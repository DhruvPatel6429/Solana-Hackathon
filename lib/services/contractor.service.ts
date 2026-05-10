import { prisma } from "@/lib/db/prisma";
import { KycStatus, PayoutPreference } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardContractorInput {
  companyId: string;
  name: string;
  email: string;
  country: string;
  taxId: string;
  payoutPreference: PayoutPreference; // "USDC" | "FIAT"
  /** Required when payoutPreference === "USDC" */
  walletAddress?: string;
  /** Required when payoutPreference === "FIAT" — e.g. "USD", "EUR" */
  preferredFiatCurrency?: string;
}

export interface UpdateContractorInput {
  contractorId: string;
  companyId: string;
  name?: string;
  country?: string;
  taxId?: string;
  payoutPreference?: PayoutPreference;
  walletAddress?: string;
  preferredFiatCurrency?: string;
}

export interface ListContractorsFilter {
  companyId: string;
  kycStatus?: KycStatus;
  page?: number;
  pageSize?: number;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Very lightweight Solana base58 address check.
 * A proper implementation would use @solana/web3.js PublicKey.isOnCurve().
 * This is enough for an initial validation guard.
 */
function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function validateOnboardInput(input: OnboardContractorInput) {
  if (!input.name?.trim()) throw new Error("Contractor name is required");
  if (!input.email?.trim()) throw new Error("Contractor email is required");
  if (!input.country?.trim()) throw new Error("Country is required");
  if (!input.taxId?.trim()) throw new Error("Tax ID is required");

  if (input.payoutPreference === PayoutPreference.USDC) {
    if (!input.walletAddress) {
      throw new Error(
        "A Solana wallet address is required for USDC payout preference"
      );
    }
    if (!isValidSolanaAddress(input.walletAddress)) {
      throw new Error("Invalid Solana wallet address format");
    }
  }

  if (input.payoutPreference === PayoutPreference.FIAT) {
    if (!input.preferredFiatCurrency) {
      throw new Error(
        "A preferred fiat currency is required for FIAT payout preference"
      );
    }
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Onboard a new contractor under a given company.
 * - Validates input
 * - Ensures no duplicate email within the same company
 * - Creates contractor record with KYC status defaulted to PENDING
 * - Writes an audit log entry
 */
export async function onboardContractor(input: OnboardContractorInput) {
  validateOnboardInput(input);
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { organizationId: true },
  });

  // Prevent duplicates within the same company tenant
  const duplicate = await prisma.contractor.findFirst({
    where: {
      companyId: input.companyId,
      email: input.email.toLowerCase().trim(),
    },
  });

  if (duplicate) {
    throw new Error(
      `A contractor with email ${input.email} already exists in this company`
    );
  }

  const contractor = await prisma.contractor.create({
    data: {
      organizationId: company?.organizationId ?? null,
      companyId: input.companyId,
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
      country: input.country.trim(),
      taxId: input.taxId.trim(),
      payoutPreference: input.payoutPreference,
      walletAddress: input.walletAddress ?? null,
      preferredFiatCurrency: input.preferredFiatCurrency ?? null,
      kycStatus: KycStatus.PENDING,
    },
  });

  // Audit trail
  await prisma.auditLog.create({
    data: {
      organizationId: company?.organizationId ?? null,
      companyId: input.companyId,
      action: "CONTRACTOR_ONBOARDED",
      actorUserId: contractor.id,
      metadata: {
        contractorId: contractor.id,
        name: contractor.name,
        country: contractor.country,
        payoutPreference: contractor.payoutPreference,
      },
    },
  });

  return contractor;
}

/**
 * Fetch a single contractor by ID, scoped to the caller's company.
 */
export async function getContractorById(
  contractorId: string,
  companyId: string
) {
  const contractor = await prisma.contractor.findFirst({
    where: { id: contractorId, companyId },
    include: {
      invoices: {
        orderBy: { submittedAt: "desc" },
        take: 10,
        select: {
          id: true,
          amountUsdc: true,
          status: true,
          submittedAt: true,
          approvedAt: true,
        },
      },
    },
  });

  if (!contractor) {
    throw new Error(`Contractor ${contractorId} not found`);
  }

  return contractor;
}

/**
 * List all contractors for a company with optional KYC filter and pagination.
 */
export async function listContractors(filter: ListContractorsFilter) {
  const { companyId, kycStatus, page = 1, pageSize = 20 } = filter;

  const where: Record<string, unknown> = { companyId };
  if (kycStatus) where.kycStatus = kycStatus;

  const [total, contractors] = await Promise.all([
    prisma.contractor.count({ where }),
    prisma.contractor.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        country: true,
        payoutPreference: true,
        walletAddress: true,
        kycStatus: true,
        createdAt: true,
        // Last payment summary — useful for the admin roster table
        invoices: {
          where: { status: "PAID" },
          orderBy: { approvedAt: "desc" },
          take: 1,
          select: { approvedAt: true, amountUsdc: true },
        },
      },
    }),
  ]);

  return {
    contractors,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Update a contractor's profile settings (payout preference, wallet address, etc).
 * Scoped to the caller's company for multi-tenant safety.
 */
export async function updateContractor(input: UpdateContractorInput) {
  const { contractorId, companyId, ...updates } = input;

  const existing = await prisma.contractor.findFirst({
    where: { id: contractorId, companyId },
  });

  if (!existing) {
    throw new Error(`Contractor ${contractorId} not found`);
  }

  // Re-validate wallet if payout preference is changing to USDC
  const newPreference = updates.payoutPreference ?? existing.payoutPreference;
  const newWallet = updates.walletAddress ?? existing.walletAddress;

  if (
    newPreference === PayoutPreference.USDC &&
    newWallet &&
    !isValidSolanaAddress(newWallet)
  ) {
    throw new Error("Invalid Solana wallet address format");
  }

  const contractor = await prisma.contractor.update({
    where: { id: contractorId },
    data: {
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.country ? { country: updates.country.trim() } : {}),
      ...(updates.taxId ? { taxId: updates.taxId.trim() } : {}),
      ...(updates.payoutPreference
        ? { payoutPreference: updates.payoutPreference }
        : {}),
      ...(updates.walletAddress !== undefined
        ? { walletAddress: updates.walletAddress }
        : {}),
      ...(updates.preferredFiatCurrency !== undefined
        ? { preferredFiatCurrency: updates.preferredFiatCurrency }
        : {}),
    },
  });

  return contractor;
}

/**
 * Update a contractor's KYC status (called by compliance flow or admin action).
 */
export async function updateKycStatus(
  contractorId: string,
  companyId: string,
  kycStatus: KycStatus,
  adminId: string
) {
  const contractor = await prisma.contractor.findFirst({
    where: { id: contractorId, companyId },
  });

  if (!contractor) {
    throw new Error(`Contractor ${contractorId} not found`);
  }

  const updated = await prisma.contractor.update({
    where: { id: contractorId },
    data: { kycStatus },
  });

  await prisma.auditLog.create({
    data: {
      companyId,
      action: "KYC_STATUS_UPDATED",
      actorUserId: adminId,
      metadata: {
        contractorId,
        previousStatus: contractor.kycStatus,
        newStatus: kycStatus,
      },
    },
  });

  return updated;
}
