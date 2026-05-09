import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { executePayout } from "@/lib/services/payout.service";

type ApproveInvoiceBody = {
  invoiceId?: unknown;
  id?: unknown;
};

const db = prisma as any;

function errorResponse(message: string, status: number, details?: string) {
  return Response.json(
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getClaimedRole(claims: Record<string, unknown>): string | undefined {
  const appMetadata = claims.app_metadata;
  const userMetadata = claims.user_metadata;

  if (
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    "role" in appMetadata
  ) {
    return String(appMetadata.role);
  }

  if (
    typeof userMetadata === "object" &&
    userMetadata !== null &&
    "role" in userMetadata
  ) {
    return String(userMetadata.role);
  }

  return undefined;
}

export async function PATCH(request: Request) {
  let tenant: Awaited<ReturnType<typeof requireTenantContext>>;

  try {
    tenant = await requireTenantContext(request);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  const role = getClaimedRole(tenant.claims);
  if (role && role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Only admins can approve invoices." },
      { status: 403 },
    );
  }

  let body: ApproveInvoiceBody;

  try {
    body = (await request.json()) as ApproveInvoiceBody;
  } catch {
    return errorResponse("Invalid JSON request body.", 400);
  }

  const invoiceId =
    typeof body.invoiceId === "string"
      ? body.invoiceId.trim()
      : typeof body.id === "string"
        ? body.id.trim()
        : "";

  if (!invoiceId) {
    return errorResponse("invoiceId is required.", 400);
  }

  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      companyId: tenant.companyId,
    },
    include: { contractor: true },
  });

  if (!invoice) {
    return errorResponse(`Invoice ${invoiceId} not found.`, 404);
  }

  if (invoice.status === "PAID") {
    const payout = await db.payout.findUnique({ where: { invoiceId } });
    return errorResponse(
      "Invoice has already been paid.",
      409,
      payout?.txSignature ? `Existing tx signature: ${payout.txSignature}` : undefined,
    );
  }

  if (!["PENDING", "APPROVED"].includes(invoice.status)) {
    return errorResponse(
      `Invoice ${invoiceId} is ${invoice.status}; only PENDING or APPROVED invoices can be paid.`,
      409,
    );
  }

  const wallet = invoice.contractor?.walletAddress;
  if (!wallet) {
    return errorResponse("Contractor wallet address is missing.", 400);
  }

  try {
    const payout = await executePayout({
      invoiceId,
      wallet,
      amount: Number(invoice.amountUsdc),
      companyId: tenant.companyId,
    });

    return Response.json({
      success: true,
      txHash: payout.txHash,
      txSignature: payout.txHash,
      invoice: {
        id: invoice.id,
        status: "PAID",
      },
      payout: {
        id: payout.payoutId,
        status: payout.status,
        solanaTxSignature: payout.txHash,
      },
    });
  } catch (error) {
    const details = getErrorMessage(error);
    console.error("[api:invoices:approve] Payout failed", {
      invoiceId,
      error: details,
    });

    return errorResponse("Payout failed. Invoice was not marked PAID.", 500, details);
  }
}
