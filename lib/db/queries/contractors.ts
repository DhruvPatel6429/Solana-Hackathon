import { prisma } from "@/lib/db/prisma";

export type ContractorListItem = {
  id: string;
  name: string;
  country: string;
  flag: string;
  payoutPreference: "USDC" | "FIAT";
  kycStatus: "Verified" | "Pending" | "Rejected";
  lastPaid: string;
  status: "Active" | "Invited" | "Paused";
};

function toFlag(country: string): string {
  const trimmed = country.trim();
  if (!trimmed) {
    return "--";
  }

  const parts = trimmed.split(/\s+/).map((part) => part[0]).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}${parts[1]}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}

function toKycStatus(value: string | null | undefined): ContractorListItem["kycStatus"] {
  const normalized = (value ?? "PENDING").toUpperCase();
  if (normalized === "VERIFIED") return "Verified";
  if (normalized === "REJECTED") return "Rejected";
  return "Pending";
}

function toPayoutPreference(value: string | null | undefined): ContractorListItem["payoutPreference"] {
  return (value ?? "").toUpperCase() === "FIAT" ? "FIAT" : "USDC";
}

function toContractorStatus(value: string | null | undefined): ContractorListItem["status"] {
  const normalized = (value ?? "Active").toLowerCase();
  if (normalized === "invited") return "Invited";
  if (normalized === "paused") return "Paused";
  return "Active";
}

export async function listContractorsByCompany(
  companyId: string,
): Promise<ContractorListItem[]> {
  const contractors = await prisma.contractor.findMany({
    where: { companyId },
    include: {
      payouts: {
        where: {
          status: "CONFIRMED",
        },
        orderBy: {
          executedAt: "desc",
        },
        select: {
          executedAt: true,
        },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return contractors.map((contractor) => ({
    id: contractor.id,
    name: contractor.name,
    country: contractor.country ?? "Unknown",
    flag: toFlag(contractor.country ?? ""),
    payoutPreference: toPayoutPreference(contractor.payoutPreference),
    kycStatus: toKycStatus(contractor.kycStatus),
    lastPaid: contractor.payouts[0]?.executedAt
      ? contractor.payouts[0].executedAt.toISOString().slice(0, 10)
      : "-",
    status: toContractorStatus(contractor.status),
  }));
}
