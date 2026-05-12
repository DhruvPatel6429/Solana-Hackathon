import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { approveInvoice } from "@/lib/services/invoice.service";
import { executePayout } from "@/lib/services/payout.service";

const db = prisma as any;

interface RouteContext {
  params: { id: string };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  let tenant: Awaited<ReturnType<typeof requireAdmin>>;

  try {
    tenant = await requireAdmin(request);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  const invoiceId = params.id?.trim();
  if (!invoiceId) {
    return NextResponse.json(
      { success: false, error: "Invoice ID is required." },
      { status: 400 },
    );
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
    return NextResponse.json(
      { success: false, error: `Invoice ${invoiceId} not found.` },
      { status: 404 },
    );
  }

  if (invoice.status === "PAID") {
    const payout = await db.payout.findUnique({ where: { invoiceId } });
    return NextResponse.json(
      {
        success: false,
        error: "Invoice has already been paid.",
        ...(payout?.txSignature
          ? { details: `Existing tx signature: ${payout.txSignature}` }
          : {}),
      },
      { status: 409 },
    );
  }

  if (!["PENDING", "APPROVED"].includes(invoice.status)) {
    return NextResponse.json(
      {
        success: false,
        error: `Invoice ${invoiceId} is ${invoice.status}; only PENDING or APPROVED invoices can be paid.`,
      },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const shouldSettle = body?.settle !== false;

  if (!shouldSettle) {
    try {
      const approved =
        invoice.status === "APPROVED"
          ? invoice
          : await approveInvoice({
              invoiceId,
              adminId: tenant.userId,
            });

      return NextResponse.json({
        success: true,
        invoice: {
          id: approved.id,
          status: "APPROVED",
          approvedAt: approved.approvedAt,
          amountUsdc: approved.amountUsdc,
          contractorId: approved.contractorId,
        },
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Invoice approval failed.",
        },
        { status: 500 },
      );
    }
  }

  const wallet = invoice.contractor?.walletAddress;
  if (!wallet) {
    return NextResponse.json(
      { success: false, error: "Contractor wallet address is missing." },
      { status: 400 },
    );
  }

  try {
    const payout = await executePayout({
      invoiceId,
      wallet,
      amount: Number(invoice.amountUsdc),
      companyId: tenant.companyId,
    });

    return NextResponse.json({
      success: true,
      txHash: payout.txHash,
      txSignature: payout.txHash,
      invoice: {
        id: invoice.id,
        status: "PAID",
        approvedAt: invoice.approvedAt,
        amountUsdc: invoice.amountUsdc,
        contractorId: invoice.contractorId,
      },
      payout: {
        id: payout.payoutId,
        status: payout.status,
        solanaTxSignature: payout.txHash,
      },
      explorerUrl: `https://explorer.solana.com/tx/${payout.txHash}?cluster=devnet`,
    });
  } catch (error) {
    const details = getErrorMessage(error);

    console.error("[api:invoices:id:approve] Payout failed", {
      invoiceId,
      error: details,
    });

    return NextResponse.json(
      {
        success: false,
        error: "Payout failed. Invoice was not marked PAID.",
        details,
      },
      { status: 500 },
    );
  }
}
