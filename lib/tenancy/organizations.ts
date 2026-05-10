import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function fallbackSlug(name: string): string {
  const base = toSlug(name) || "organization";
  const suffix = createHash("sha256").update(`${name}:${Date.now()}`).digest("hex").slice(0, 8);
  return `${base}-${suffix}`;
}

export async function provisionOrganization(input: {
  name: string;
  ownerUserId: string;
  companyName?: string;
  planTier?: string;
  treasuryWalletAddress?: string;
  feeWalletAddress?: string;
}): Promise<{
  organizationId: string;
  companyId: string;
}> {
  const organizationName = input.name.trim();
  if (!organizationName) {
    throw new Error("Organization name is required.");
  }

  return db.$transaction(async (tx: any) => {
    const organization = await tx.organization.create({
      data: {
        name: organizationName,
        slug: fallbackSlug(organizationName),
        status: "ACTIVE",
      },
    });

    const company = await tx.company.create({
      data: {
        name: input.companyName?.trim() || `${organizationName} Payroll`,
        planTier: input.planTier?.trim() || "Enterprise",
        organizationId: organization.id,
        treasuryWalletAddress: input.treasuryWalletAddress,
        feeWalletAddress: input.feeWalletAddress,
      },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: input.ownerUserId,
        role: "OWNER",
      },
    });

    await tx.companyUser.upsert({
      where: { userId: input.ownerUserId },
      create: {
        userId: input.ownerUserId,
        companyId: company.id,
        organizationId: organization.id,
        role: "admin",
      },
      update: {
        companyId: company.id,
        organizationId: organization.id,
        role: "admin",
      },
    });

    return {
      organizationId: organization.id,
      companyId: company.id,
    };
  });
}

export async function getOrganizationByCompany(companyId: string) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      organizationId: true,
      name: true,
      planTier: true,
      treasuryWalletAddress: true,
      feeWalletAddress: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!company?.organizationId) {
    return null;
  }

  return company;
}

export async function listOrganizationMembers(organizationId: string) {
  return db.organizationMember.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
}

export async function addOrganizationMember(input: {
  organizationId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "FINANCE" | "COMPLIANCE" | "VIEWER";
}) {
  return db.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    create: input,
    update: {
      role: input.role,
      updatedAt: new Date(),
    },
  });
}
