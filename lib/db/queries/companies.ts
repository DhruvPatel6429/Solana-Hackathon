import { prisma } from "@/lib/db/prisma";

type CreateOrGetCompanyInput = {
  userId: string;
  companyName?: string;
  planTier?: string;
};

export async function getCompanyForUser(userId: string) {
  return prisma.companyUser.findUnique({
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
  return prisma.$transaction(async (tx) => {
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
      return existingMembership.company;
    }

    const company = await tx.company.create({
      data: {
        name: companyName?.trim() || `Company ${userId.slice(0, 8)}`,
        planTier: planTier?.trim() || "Starter",
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
        companyId: company.id,
        userId,
      },
    });

    return company;
  });
}
