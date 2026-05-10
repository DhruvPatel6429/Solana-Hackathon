import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { assertCsrfSafe, assertIdempotencyKey, assertRateLimit, ApiProtectionError } from "@/lib/security/api-protection";
import { getRequestId, jsonWithRequestId, logger } from "@/lib/utils/logger";

type ExecutePayoutRequestBody = {
  invoiceId?: unknown;
  wallet?: unknown;
  walletAddress?: unknown;
  amount?: unknown;
  amountUsdc?: unknown;
};

const db = prisma as any;

function errorResponse(message: string, status: number): Response {
  return Response.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getStatusCode(error: unknown): number {
  const name = error instanceof Error ? error.name : "";
  if (name.includes("Validation") || name.includes("InvalidWalletAddress")) {
    return 400;
  }

  if (name.includes("DuplicatePayout")) {
    return 409;
  }

  if (name.includes("PayoutInvoiceNotFound")) {
    return 404;
  }

  if (name.includes("EscrowNotFound")) {
    return 404;
  }

  if (name.includes("EscrowAlreadyReleased") || name.includes("DuplicatePayout")) {
    return 409;
  }

  if (
    name.includes("PayoutExecution") ||
    name.includes("SolanaTransfer") ||
    name.includes("EscrowRelease") ||
    name.includes("EscrowDeposit")
  ) {
    return 500;
  }

  return 500;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  let tenant: Awaited<ReturnType<typeof requireAdmin>>;

  try {
    assertRateLimit(request, { scope: "payout-execute", limit: 20, windowMs: 60_000 });
    assertCsrfSafe(request);
    assertIdempotencyKey(request, "payout-execute");
    tenant = await requireAdmin(request);
  } catch (error) {
    if (error instanceof ApiProtectionError) {
      return jsonWithRequestId({ success: false, error: error.message }, { status: error.status }, requestId);
    }
    return toHttpErrorResponse(error);
  }

  let body: ExecutePayoutRequestBody;

  try {
    body = (await request.json()) as ExecutePayoutRequestBody;
  } catch {
    return errorResponse("Invalid JSON request body.", 400);
  }

  try {
    const { executePayout } = await import("../../../../lib/services/payout.service");
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
    if (!invoiceId) {
      return jsonWithRequestId({ success: false, error: "invoiceId is required." }, { status: 400 }, requestId);
    }

    const invoice = await db.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId: tenant.companyId,
      },
      include: {
        contractor: true,
      },
    });

    if (!invoice) {
      return jsonWithRequestId({ success: false, error: `Invoice ${invoiceId} not found.` }, { status: 404 }, requestId);
    }

    const wallet = invoice.contractor?.walletAddress;
    if (!wallet) {
      return jsonWithRequestId({ success: false, error: "Contractor wallet address is missing." }, { status: 400 }, requestId);
    }

    const result = await executePayout({
      invoiceId,
      wallet,
      amount: Number(invoice.amountUsdc),
      companyId: tenant.companyId,
    });

    logger.info("Payout execution API succeeded", {
      requestId,
      companyId: tenant.companyId,
      invoiceId,
      payoutId: result.payoutId,
      txSignature: result.txHash,
    });

    return jsonWithRequestId({
      success: true,
      txHash: result.txHash,
      txSignature: result.txHash,
      payout: {
        id: result.payoutId,
        status: result.status,
        txSignature: result.txHash,
        solanaTxSignature: result.txHash,
      },
    }, {}, requestId);
  } catch (error) {
    const message = getErrorMessage(error);
    const status = getStatusCode(error);

    logger.error("Payout execution API failed", {
      requestId,
      companyId: tenant.companyId,
      status,
      error: message,
    });

    return jsonWithRequestId({ success: false, error: message }, { status }, requestId);
  }
}
