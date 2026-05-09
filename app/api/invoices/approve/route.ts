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

export async function PATCH(request: Request) {
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

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
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
