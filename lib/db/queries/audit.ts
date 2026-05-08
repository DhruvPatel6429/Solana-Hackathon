import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

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
  return db.auditLog.create({
    data: {
      companyId,
      action,
      actorUserId,
      metadata,
    },
  });
}

export async function listAuditLogsByCompany(companyId: string, limit = 100) {
  return db.auditLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
