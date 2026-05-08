import { prisma } from "@/lib/db/prisma";

export type InvoiceListItem = {
  id: string;
  contractorId: string;
  contractor: string;
  amount: number;
  currency: "USDC";
  submittedAt: string;
  status: "Pending" | "Approved" | "Rejected" | "Paid";
  txHash?: string;
  description: string;
};

function toInvoiceStatus(value: string | null | undefined): InvoiceListItem["status"] {
  const normalized = (value ?? "PENDING").toUpperCase();
  if (normalized === "APPROVED") return "Approved";
  if (normalized === "REJECTED") return "Rejected";
  if (normalized === "PAID") return "Paid";
  return "Pending";
}

export async function listInvoicesByCompany(
  companyId: string,
): Promise<InvoiceListItem[]> {
  const invoices = await prisma.invoice.findMany({
    where: { companyId },
    include: {
      contractor: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      submittedAt: "desc",
    },
  });

  const payoutMap = new Map<string, string>();
  const payoutRows = await prisma.payout.findMany({
    where: {
      companyId,
      txSignature: {
        not: null,
      },
    },
    select: {
      invoiceId: true,
      txSignature: true,
    },
  });

  for (const payout of payoutRows) {
    if (payout.txSignature) {
      payoutMap.set(payout.invoiceId, payout.txSignature);
    }
  }

  return invoices.map((invoice) => ({
    id: invoice.id,
    contractorId: invoice.contractorId,
    contractor: invoice.contractor.name,
    amount: invoice.amountUsdc,
    currency: "USDC",
    submittedAt: invoice.submittedAt.toISOString().slice(0, 10),
    status: toInvoiceStatus(invoice.status),
    txHash: payoutMap.get(invoice.id),
    description: invoice.description ?? "Invoice payout",
  }));
}
