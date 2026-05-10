import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

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
  let tenant: Awaited<ReturnType<typeof requireAdmin>>;

  try {
    tenant = await requireAdmin(request);
  } catch (error) {
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
      return errorResponse("invoiceId is required.", 400);
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
      return errorResponse(`Invoice ${invoiceId} not found.`, 404);
    }

    const wallet = invoice.contractor?.walletAddress;
    if (!wallet) {
      return errorResponse("Contractor wallet address is missing.", 400);
    }

    const result = await executePayout({
      invoiceId,
      wallet,
      amount: Number(invoice.amountUsdc),
      companyId: tenant.companyId,
    });

    return Response.json({
      success: true,
      txHash: result.txHash,
      txSignature: result.txHash,
      payout: {
        id: result.payoutId,
        status: result.status,
        txSignature: result.txHash,
        solanaTxSignature: result.txHash,
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = getStatusCode(error);

    console.error("[api:payouts:execute] Request failed", {
      status,
      error: message,
    });

    return errorResponse(message, status);
  }
}
