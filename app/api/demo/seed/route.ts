import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

type DemoContractorSeed = {
  name: string;
  email: string;
  country: string;
  taxId: string;
  walletAddress: string;
};

type DemoInvoiceSeed = {
  key: string;
  amountUsdc: number;
  contractorIndex: number;
};

const DEMO_CONTRACTORS: DemoContractorSeed[] = [
  {
    name: "Maya Chen",
    email: "maya.chen+judge@borderless.demo",
    country: "Singapore",
    taxId: "SG-TAX-1031",
    walletAddress: "11111111111111111111111111111111",
  },
  {
    name: "Arjun Mehta",
    email: "arjun.mehta+judge@borderless.demo",
    country: "India",
    taxId: "IN-PAN-8274",
    walletAddress: "11111111111111111111111111111111",
  },
];

const DEMO_INVOICES: DemoInvoiceSeed[] = [
  { key: "JUDGE_DEMO_INV_1", amountUsdc: 1250, contractorIndex: 0 },
  { key: "JUDGE_DEMO_INV_2", amountUsdc: 2875, contractorIndex: 1 },
  { key: "JUDGE_DEMO_INV_3", amountUsdc: 4100, contractorIndex: 0 },
];

function isJudgeModeEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_JUDGE_MODE === "true" ||
    process.env.JUDGE_MODE === "true"
  );
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

export async function POST(request: Request): Promise<Response> {
  if (!isJudgeModeEnabled()) {
    return NextResponse.json(
      { success: false, error: "Judge mode is disabled." },
      { status: 403 },
    );
  }

  let tenant: Awaited<ReturnType<typeof requireTenantContext>>;
  try {
    tenant = await requireTenantContext(request);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  const role = getClaimedRole(tenant.claims);
  if (role && role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Only admins can seed demo data." },
      { status: 403 },
    );
  }

  let company = await db.company.findUnique({
    where: { id: tenant.companyId },
    select: { id: true, name: true, planTier: true },
  });

  let companyCreated = false;
  if (!company) {
    company = await db.company.create({
      data: {
        id: tenant.companyId,
        name: "Judge Demo Company",
        planTier: "Growth",
      },
      select: { id: true, name: true, planTier: true },
    });
    companyCreated = true;
  }

  let contractorCreated = 0;
  let contractorExisting = 0;
  const contractors: Array<{ id: string }> = [];

  for (const seed of DEMO_CONTRACTORS) {
    const existing = await db.contractor.findFirst({
      where: {
        companyId: tenant.companyId,
        OR: [{ email: seed.email }, { name: seed.name }],
      },
      select: { id: true },
    });

    if (existing) {
      contractors.push(existing);
      contractorExisting += 1;
      continue;
    }

    const contractor = await db.contractor.create({
      data: {
        companyId: tenant.companyId,
        name: seed.name,
        email: seed.email,
        country: seed.country,
        taxId: seed.taxId,
        payoutPreference: "USDC",
        walletAddress: seed.walletAddress,
        preferredFiatCurrency: null,
        kycStatus: "VERIFIED",
        status: "Active",
      },
      select: { id: true },
    });

    contractors.push(contractor);
    contractorCreated += 1;
  }

  let invoiceCreated = 0;
  let invoiceExisting = 0;
  const invoiceIds: string[] = [];

  for (const seed of DEMO_INVOICES) {
    const existingInvoice = await db.invoice.findFirst({
      where: {
        companyId: tenant.companyId,
        notes: seed.key,
      },
      select: { id: true },
    });

    if (existingInvoice) {
      invoiceIds.push(existingInvoice.id);
      invoiceExisting += 1;
      continue;
    }

    const contractor = contractors[seed.contractorIndex];
    if (!contractor) {
      continue;
    }

    const invoice = await db.invoice.create({
      data: {
        companyId: tenant.companyId,
        contractorId: contractor.id,
        amountUsdc: seed.amountUsdc.toString(),
        status: "PENDING",
        description: `Judge demo invoice ${seed.key.replace("JUDGE_DEMO_", "#")}`,
        notes: seed.key,
        submittedAt: new Date(),
      },
      select: { id: true },
    });

    invoiceIds.push(invoice.id);
    invoiceCreated += 1;
  }

  return NextResponse.json({
    success: true,
    summary: {
      company: {
        id: company.id,
        name: company.name,
        created: companyCreated,
      },
      contractors: {
        created: contractorCreated,
        existing: contractorExisting,
        total: DEMO_CONTRACTORS.length,
      },
      invoices: {
        created: invoiceCreated,
        existing: invoiceExisting,
        total: DEMO_INVOICES.length,
        ids: invoiceIds,
      },
    },
  });
}
