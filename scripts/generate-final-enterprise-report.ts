import "dotenv/config";

import { readFile } from "node:fs/promises";

import { writeMarkdownArtifact } from "./phase4-common";

type JsonObj = Record<string, unknown> | null;

async function readJson(path: string): Promise<JsonObj> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function summarize(report: JsonObj): string {
  if (!report) return "NOT RUN";
  const summary = report.summary as { passed?: number; failed?: number } | undefined;
  if (!summary) return "UNKNOWN";
  return (summary.failed ?? 0) > 0
    ? `FAIL (${summary.failed} failed / ${summary.passed ?? 0} passed)`
    : `PASS (${summary.passed ?? 0} passed)`;
}

async function main(): Promise<void> {
  const [phase4, load, enterprise] = await Promise.all([
    readJson("artifacts/production-certification-report.json"),
    readJson("artifacts/load-test-report.json"),
    readJson("artifacts/enterprise-certification-report.json"),
  ]);

  const finalScore = (enterprise?.finalEnterpriseScore as number | undefined) ?? 0;

  const md = `# Final Enterprise Launch Report

## Executive Summary
Borderless Payroll Copilot has completed Phase 5 implementation for enterprise launch readiness, including multi-tenant controls, partner integration APIs, compliance governance hooks, load testing instrumentation, and final certification automation.

## Product Architecture
The platform runs as a multi-tenant payroll infrastructure stack with organization-scoped persistence, escrow-backed Solana payouts, billing synchronization, treasury reconciliation, and operational recovery.

## Smart Contract Infrastructure
Escrow lifecycle infrastructure from prior phases is retained and remains the settlement backbone for initialize/deposit/release payout execution.

## Payment Infrastructure
Payout APIs support escrow-backed single payouts, batch flows, and split settlements with reconciliation and recovery hooks.

## Billing Infrastructure
Dodo integration remains active with webhook idempotency, persistence, and dead-letter replay recovery.

## Security Architecture
Security includes auth hardening, webhook verification, replay guards, API key hashing/rotation/revocation, and tenant isolation controls.

## Compliance Readiness
Compliance architecture now includes KYC/KYB integration hooks, AML/sanctions placeholders, large-transaction alerts, and governance policy persistence.

## Multi-Tenant Readiness
Organization-level data modeling and tenant middleware were added to prevent cross-tenant leakage and enforce scoped API access.

## White-Label Readiness
Partner integration APIs support branded configuration, webhook subscriptions, scoped API credentials, and embedded dashboard preparation.

## Deployment Readiness
Phase 4/5 certification scripts validate build, tests, env, webhooks, recovery, and enterprise API surface.

## Performance Benchmarks
Load testing report status: ${summarize(load)}



## Recovery Systems
Disaster recovery coverage includes database backup automation script, treasury/webhook/payout snapshots, and replay drill orchestration.

## Remaining Risks
1. External dependency risk remains for RPC/webhook providers.
2. Production API smoke checks require active deployment URL and admin credentials.
3. Full compliance integrations (sanctions/KYB providers) require partner onboarding credentials.

## Commercial Potential
The product supports enterprise pilot onboarding, partner API integrations, white-label configuration, and governance controls suitable for due diligence.

## Integration Readiness
Enterprise certification status: ${summarize(enterprise)}

## Final Enterprise Score
${finalScore}%

## Supporting Certification
- Phase 4 production certification: ${summarize(phase4)}
- Enterprise certification: ${summarize(enterprise)}
`;

  await writeMarkdownArtifact("docs/final-enterprise-launch-report.md", md);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase5] generate-final-enterprise-report failed: ${message}`);
  process.exitCode = 1;
});
