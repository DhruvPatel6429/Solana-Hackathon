import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

type CreateAuditLogInput = {
  companyId: string;
  action: string;
  actorUserId?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function createAuditLog({
  companyId,
  action,
  actorUserId,
  metadata,
}: CreateAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      companyId,
      action,
      actorUserId,
      metadata,
    },
  });
}

export async function listAuditLogsByCompany(companyId: string, limit = 100) {
  return prisma.auditLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
