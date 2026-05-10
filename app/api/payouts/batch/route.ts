import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { assertCsrfSafe, assertIdempotencyKey, assertRateLimit, ApiProtectionError } from "@/lib/security/api-protection";
import { assertRecipientAllowed } from "@/lib/security/solana-guards";
import { executeBatchPayout } from "@/lib/solana/transfer";
import { getRequestId, jsonWithRequestId, logger } from "@/lib/utils/logger";
import { recordReconciliationAudit } from "@/lib/services/reconciliation.service";

const db = prisma as any;

type BatchPayoutBody = {
  invoiceIds?: unknown;
};

function jsonError(error: string, status: number, details?: string) {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  let tenant: Awaited<ReturnType<typeof requireAdmin>>;

  try {
    assertRateLimit(request, { scope: "payout-batch", limit: 10, windowMs: 60_000 });
    assertCsrfSafe(request);
    assertIdempotencyKey(request, "payout-batch");
    tenant = await requireAdmin(request);
  } catch (error) {
    if (error instanceof ApiProtectionError) {
      return jsonWithRequestId({ success: false, error: error.message }, { status: error.status }, requestId);
    }
    return toHttpErrorResponse(error);
  }

  let body: BatchPayoutBody;
  try {
    body = (await request.json()) as BatchPayoutBody;
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  const invoiceIds = Array.isArray(body.invoiceIds)
    ? [...new Set(body.invoiceIds.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))]
    : [];

  if (invoiceIds.length === 0) {
    return jsonError("invoiceIds must contain at least one invoice ID.", 400);
  }

  const invoices = await db.invoice.findMany({
    where: {
      companyId: tenant.companyId,
      id: { in: invoiceIds },
    },
    include: {
      contractor: true,
    },
  });

  if (invoices.length !== invoiceIds.length) {
    return jsonError("One or more invoices were not found for this company.", 404);
  }

  const invalidInvoice = invoices.find((invoice: any) => invoice.status !== "APPROVED");
  if (invalidInvoice) {
    return jsonError(
      `Invoice ${invalidInvoice.id} is ${invalidInvoice.status}; only APPROVED invoices can be batch paid.`,
      409,
    );
  }

  const missingWallet = invoices.find((invoice: any) => !invoice.contractor?.walletAddress);
  if (missingWallet) {
    return jsonError(
      `Contractor wallet address is missing for invoice ${missingWallet.id}.`,
      400,
    );
  }

  try {
    for (const invoice of invoices) {
      assertRecipientAllowed(invoice.contractor.walletAddress);
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid payout recipient.", 400);
  }

  const existingPayout = await db.payout.findFirst({
    where: {
      invoiceId: { in: invoiceIds },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: {
      invoiceId: true,
      status: true,
    },
  });

  if (existingPayout) {
    return jsonError(
      `Payout already exists for invoice ${existingPayout.invoiceId} with status ${existingPayout.status}.`,
      409,
    );
  }

  let payoutRows: any[] = [];

  try {
    payoutRows = await Promise.all(
      invoices.map((invoice: any) =>
        db.payout.create({
          data: {
            companyId: invoice.companyId,
            contractorId: invoice.contractorId,
            invoiceId: invoice.id,
            contractorWallet: invoice.contractor.walletAddress,
            amountUsdc: invoice.amountUsdc.toString(),
            currency: "USDC",
            status: "PENDING",
          },
        }),
      ),
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return jsonError("A payout already exists for one of these invoices.", 409);
    }
    throw error;
  }

  logger.info("Batch payout execution started", {
    requestId,
    companyId: tenant.companyId,
    invoiceIds,
    payoutIds: payoutRows.map((payout) => payout.id),
  });

  try {
    const result = await executeBatchPayout(
      invoices.map((invoice: any) => ({
        wallet: invoice.contractor.walletAddress,
        amount: Number(invoice.amountUsdc),
      })),
    );

    const paidAt = new Date();
    await prisma.$transaction([
      ...payoutRows.map((payout) =>
        db.payout.update({
          where: { id: payout.id },
          data: {
            status: "CONFIRMED",
            txSignature: result.signature,
            executedAt: paidAt,
          },
        }),
      ),
      ...invoices.map((invoice: any) =>
        db.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "PAID",
            approvedAt: invoice.approvedAt ?? paidAt,
          },
        }),
      ),
    ]);

    logger.info("Batch payout finalized", {
      requestId,
      companyId: tenant.companyId,
      invoiceIds,
      txSignature: result.signature,
    });

    return jsonWithRequestId({
      success: true,
      txHash: result.signature,
      txSignature: result.signature,
      payoutIds: payoutRows.map((payout) => payout.id),
    }, {}, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await Promise.all(
      payoutRows.map((payout) =>
        db.payout.update({
          where: { id: payout.id },
          data: { status: "FAILED" },
        }),
      ),
    ).catch(() => undefined);

    await Promise.all(
      payoutRows.map((payout) =>
        recordReconciliationAudit({
          companyId: tenant.companyId,
          scope: "BATCH_PAYOUT_FAILURE",
          entityType: "Payout",
          entityId: payout.id,
          severity: "CRITICAL",
          expectedValue: payout.amountUsdc,
          actualValue: 0,
          metadata: { invoiceId: payout.invoiceId, error: message },
          correlationId: requestId,
        }),
      ),
    ).catch(() => undefined);

    logger.error("Batch payout failed", {
      requestId,
      companyId: tenant.companyId,
      invoiceIds,
      error: message,
    });

    return jsonError("Batch payout failed.", 500, message);
  }
}
