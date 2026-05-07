import { prisma } from "@/lib/db/prisma";

export type PayoutListItem = {
  id: string;
  contractor: string;
  amount: number;
  currency: "USDC" | "USD" | "EUR" | "INR" | "BRL" | "PHP";
  date: string;
  invoiceId: string;
  txHash: string;
  kycStatus: "Verified" | "Pending" | "Rejected";
};

export type PayoutListFilters = {
  search?: string;
  from?: Date;
  to?: Date;
  kycStatus?: "Verified" | "Pending" | "Rejected";
};

const SUPPORTED_CURRENCIES: PayoutListItem["currency"][] = [
  "USDC",
  "USD",
  "EUR",
  "INR",
  "BRL",
  "PHP",
];

function toKycStatus(value: string | null | undefined): PayoutListItem["kycStatus"] {
  const normalized = (value ?? "PENDING").toUpperCase();
  if (normalized === "VERIFIED") return "Verified";
  if (normalized === "REJECTED") return "Rejected";
  return "Pending";
}

function toCurrency(value: string | null | undefined): PayoutListItem["currency"] {
  const normalized = (value ?? "USDC").toUpperCase();
  return SUPPORTED_CURRENCIES.includes(normalized as PayoutListItem["currency"])
    ? (normalized as PayoutListItem["currency"])
    : "USDC";
}

function applyPayoutFilters(
  rows: PayoutListItem[],
  filters?: PayoutListFilters,
): PayoutListItem[] {
  if (!filters) {
    return rows;
  }

  const query = filters.search?.trim().toLowerCase();
  const from = filters.from;
  const to = filters.to;
  const kyc = filters.kycStatus;

  return rows.filter((row) => {
    if (kyc && row.kycStatus !== kyc) {
      return false;
    }

    const rowDate = new Date(`${row.date}T00:00:00.000Z`);
    if (from && rowDate < from) {
      return false;
    }

    if (to && rowDate > to) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = `${row.contractor} ${row.invoiceId} ${row.txHash}`.toLowerCase();
    return haystack.includes(query);
  });
}

export async function listPayoutsByCompany(
  companyId: string,
  filters?: PayoutListFilters,
): Promise<PayoutListItem[]> {
  const payouts = await prisma.payout.findMany({
    where: {
      companyId,
      status: "CONFIRMED",
      txSignature: {
        not: null,
      },
    },
    include: {
      contractor: {
        select: {
          name: true,
          kycStatus: true,
        },
      },
    },
    orderBy: [
      { executedAt: "desc" },
      { createdAt: "desc" },
    ],
  });

  const rows = payouts
    .filter((payout) => Boolean(payout.txSignature))
    .map((payout) => ({
      id: payout.id,
      contractor:
        payout.contractor?.name ??
        `Wallet ${payout.contractorWallet.slice(0, 6)}...${payout.contractorWallet.slice(-4)}`,
      amount: payout.amountUsdc,
      currency: toCurrency(payout.currency),
      date: (payout.executedAt ?? payout.createdAt).toISOString().slice(0, 10),
      invoiceId: payout.invoiceId,
      txHash: payout.txSignature as string,
      kycStatus: toKycStatus(payout.contractor?.kycStatus),
    }));

  return applyPayoutFilters(rows, filters);
}
