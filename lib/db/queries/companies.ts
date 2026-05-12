import { prisma } from "@/lib/db/prisma";
import { serverEnv } from "@/config/env";

const db = prisma as any;

type CreateOrGetCompanyInput = {
  userId: string;
  companyName?: string;
  planTier?: string;
};

export async function getCompanyForUser(userId: string) {
  return db.companyUser.findUnique({
    where: { userId },
    select: {
      id: true,
      company: {
        select: {
          id: true,
          name: true,
          planTier: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function createOrGetCompanyForUser({
  userId,
  companyName,
  planTier,
}: CreateOrGetCompanyInput) {
  return db.$transaction(async (tx: any) => {
    const existingMembership = await tx.companyUser.findUnique({
      where: { userId },
      select: {
        id: true,
        company: {
          select: {
            id: true,
            name: true,
            planTier: true,
            createdAt: true,
          },
        },
      },
    });

    if (existingMembership?.company) {
      const treasuryWalletAddress = serverEnv.treasuryWalletAddress();
      const updates: Record<string, string> = {};

      if (companyName?.trim()) {
        updates.name = companyName.trim();
      }

      if (planTier?.trim()) {
        updates.planTier = planTier.trim();
      }

      if (treasuryWalletAddress) {
        updates.treasuryWalletAddress = treasuryWalletAddress;
      }

      if (Object.keys(updates).length) {
        return tx.company.update({
          where: { id: existingMembership.company.id },
          data: updates,
          select: {
            id: true,
            name: true,
            planTier: true,
            createdAt: true,
          },
        });
      }

      return existingMembership.company;
    }

    const organization = await tx.organization.create({
      data: {
        name: companyName?.trim() || `Organization ${userId.slice(0, 8)}`,
        slug: `org-${userId.slice(0, 8)}-${Date.now()}`,
      },
      select: { id: true },
    });

    const company = await tx.company.create({
      data: {
        name: companyName?.trim() || `Company ${userId.slice(0, 8)}`,
        planTier: planTier?.trim() || "Starter",
        organizationId: organization.id,
        treasuryWalletAddress: serverEnv.treasuryWalletAddress() || null,
      },
      select: {
        id: true,
        name: true,
        planTier: true,
        createdAt: true,
      },
    });

    await tx.companyUser.create({
      data: {
        organizationId: organization.id,
        companyId: company.id,
        userId,
        role: "admin",
      },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId,
        role: "OWNER",
      },
    });

    return company;
  });
}
