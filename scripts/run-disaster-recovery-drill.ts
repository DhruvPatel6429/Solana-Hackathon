import "dotenv/config";

import { prisma } from "@/lib/db/prisma";
import {
  snapshotPayoutRecoveryState,
  snapshotTreasuryState,
  snapshotWebhookState,
} from "@/lib/services/disaster-recovery.service";
import { payoutRecoveryService } from "@/lib/services/payout-recovery.service";
import { webhookRecoveryService } from "@/lib/services/webhook-recovery.service";
import { writeJsonArtifact } from "./phase4-common";

const db = prisma as any;

async function main(): Promise<void> {
  const company = await db.company.findFirst({
    where: { organizationId: { not: null } },
    select: { id: true, organizationId: true },
  });

  if (!company?.organizationId) {
    throw new Error("No organization-scoped company found. Provision organization first.");
  }

  const [treasurySnapshot, webhookSnapshot, payoutSnapshot] = await Promise.all([
    snapshotTreasuryState({ organizationId: company.organizationId, companyId: company.id }),
    snapshotWebhookState({ organizationId: company.organizationId, companyId: company.id }),
    snapshotPayoutRecoveryState({ organizationId: company.organizationId, companyId: company.id }),
  ]);

  const [reconcileResults, retryResults, webhookReplay] = await Promise.all([
    payoutRecoveryService.reconcileFailedPayouts({ companyId: company.id, limit: 50 }),
    payoutRecoveryService.retryTransientFailures(20),
    webhookRecoveryService.replayFailedWebhooks(50),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    organizationId: company.organizationId,
    companyId: company.id,
    snapshots: {
      treasurySnapshotId: treasurySnapshot.id,
      webhookSnapshotId: webhookSnapshot.id,
      payoutSnapshotId: payoutSnapshot.id,
    },
    recoveryExecution: {
      reconcileResults,
      retryResults,
      webhookReplay,
    },
  };

  await writeJsonArtifact("artifacts/disaster-recovery-drill-report.json", report);
  console.info("[phase5] Disaster recovery drill complete", report.snapshots);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase5] run-disaster-recovery-drill failed: ${message}`);
  process.exitCode = 1;
});
