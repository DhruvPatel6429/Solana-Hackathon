import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export async function listUsageEventsByCompany(companyId: string, take = 20) {
  return db.usageEvent.findMany({
    where: { companyId },
    orderBy: { reportedAt: "desc" },
    take,
  });
}
