import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export type ReconciliationSeverity = "INFO" | "WARN" | "CRITICAL";

export async function recordReconciliationAudit(input: {
  companyId?: string | null;
  scope: string;
  entityType?: string;
  entityId?: string;
  severity?: ReconciliationSeverity;
  status?: "OPEN" | "RESOLVED";
  expectedValue?: number | string | null;
  actualValue?: number | string | null;
  txSignature?: string | null;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}) {
  const expected =
    input.expectedValue === undefined || input.expectedValue === null
      ? null
      : Number(input.expectedValue);
  const actual =
    input.actualValue === undefined || input.actualValue === null
      ? null
      : Number(input.actualValue);
  const delta =
    expected === null || actual === null || Number.isNaN(expected) || Number.isNaN(actual)
      ? null
      : actual - expected;

  return db.reconciliationAudit.create({
    data: {
      companyId: input.companyId ?? null,
      scope: input.scope,
      entityType: input.entityType,
      entityId: input.entityId,
      severity: input.severity ?? "INFO",
      status: input.status ?? "OPEN",
      expectedValue: expected === null ? null : expected.toString(),
      actualValue: actual === null ? null : actual.toString(),
      deltaValue: delta === null ? null : delta.toString(),
      txSignature: input.txSignature ?? null,
      metadata: input.metadata ?? {},
      correlationId: input.correlationId,
      resolvedAt: input.status === "RESOLVED" ? new Date() : null,
    },
  });
}

export async function getReconciliationReport(companyId?: string) {
  const where = companyId ? { companyId } : {};
  const [openItems, recentItems, failedJobs, deadLetterWebhooks] = await Promise.all([
    db.reconciliationAudit.findMany({
      where: { ...where, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.reconciliationAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.failedJob.findMany({
      where: { status: { in: ["PENDING_RETRY", "PERMANENT_FAILURE"] } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.deadLetterWebhook.findMany({
      where: { status: { in: ["PENDING_REPLAY", "PERMANENT_FAILURE"] } },
      orderBy: { receivedAt: "desc" },
      take: 25,
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      open: openItems.length,
      critical: openItems.filter((item: any) => item.severity === "CRITICAL").length,
      failedJobs: failedJobs.length,
      deadLetterWebhooks: deadLetterWebhooks.length,
    },
    openItems,
    recentItems,
    failedJobs,
    deadLetterWebhooks,
  };
}
