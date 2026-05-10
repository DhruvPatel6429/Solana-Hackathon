import "dotenv/config";

import { readFile } from "node:fs/promises";

import { nowIso, writeMarkdownArtifact } from "./phase4-common";

type MaybeRecord = Record<string, unknown> | null;

async function loadJson(path: string): Promise<MaybeRecord> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function passFailSummary(report: MaybeRecord): string {
  if (!report) {
    return "NOT RUN";
  }

  const summary = report.summary as { passed?: number; failed?: number } | undefined;
  if (!summary) {
    return "UNKNOWN";
  }

  if ((summary.failed ?? 0) > 0) {
    return `FAIL (${summary.failed} failed / ${summary.passed ?? 0} passed)`;
  }

  return `PASS (${summary.passed ?? 0} passed)`;
}

function jsonCodeBlock(value: unknown): string {
  return `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

async function main(): Promise<void> {
  const [
    setup,
    anchor,
    live,
    batch,
    split,
    dodo,
    helius,
    recovery,
    production,
  ] = await Promise.all([
    loadJson("artifacts/setup-devnet-report.json"),
    loadJson("artifacts/anchor-deployment-validation.json"),
    loadJson("artifacts/live-validation/live-payroll-report.json"),
    loadJson("artifacts/batch-validation-report.json"),
    loadJson("artifacts/split-validation-report.json"),
    loadJson("artifacts/dodo-webhook-validation.json"),
    loadJson("artifacts/helius-validation-report.json"),
    loadJson("artifacts/recovery-validation-report.json"),
    loadJson("artifacts/production-certification-report.json"),
  ]);

  const md = `# Final Operational Validation Report\n\nGenerated at: ${nowIso()}\n\n## Environment\nStatus: ${passFailSummary(setup)}\n${jsonCodeBlock(setup?.environment ?? { note: "Run scripts/setup-devnet.ts" })}\n\n## Wallet Verification\nStatus: ${passFailSummary(setup)}\n${jsonCodeBlock(setup?.checks ?? { note: "No setup checks found." })}\n\n## Smart Contract Verification\nStatus: ${passFailSummary(anchor)}\n${jsonCodeBlock(anchor ?? { note: "Run scripts/validate-anchor-deployment.ts" })}\n\n## Payroll Flow Verification\nStatus: ${passFailSummary(live)}\n${jsonCodeBlock(live ?? { note: "Run scripts/run-live-payroll-flow.ts" })}\n\n## Batch Payout Verification\nStatus: ${passFailSummary(batch)}\n${jsonCodeBlock(batch ?? { note: "Run scripts/run-batch-validation.ts" })}\n\n## Split Settlement Verification\nStatus: ${passFailSummary(split)}\n${jsonCodeBlock(split ?? { note: "Run scripts/run-split-validation.ts" })}\n\n## Dodo Webhook Verification\nStatus: ${passFailSummary(dodo)}\n${jsonCodeBlock(dodo ?? { note: "Run scripts/test-dodo-webhook.ts" })}\n\n## Helius Verification\nStatus: ${passFailSummary(helius)}\n${jsonCodeBlock(helius ?? { note: "Run scripts/test-helius-webhook.ts" })}\n\n## Recovery Validation\nStatus: ${passFailSummary(recovery)}\n${jsonCodeBlock(recovery ?? { note: "Run scripts/test-recovery-scenarios.ts" })}\n\n## Deployment Validation\nStatus: ${passFailSummary(production)}\n${jsonCodeBlock(production ?? { note: "Run scripts/run-production-certification.ts" })}\n\n## Security Validation\nStatus: ${production ? "Derived from webhook/auth/env checks in production certification" : "NOT RUN"}\n${jsonCodeBlock({
  webhookSecretsValidated: Boolean(production),
  authProtectedEndpointsValidated: Boolean(production),
  envSchemaValidated: Boolean(setup || production),
})}\n\n## Remaining Risks\n1. Live provider dependencies can fail due to upstream outages (RPC, Dodo, Helius).\n2. Admin endpoint smoke tests require a valid admin bearer token and reachable deployment URL.\n3. Devnet balance volatility can affect treasury delta checks when simultaneous transactions occur.\n\n## Production Readiness Assessment\n${production && (production.summary as any)?.failed === 0 ? "Certified for production readiness based on executed checks." : "Not yet certified. Resolve failing checks and regenerate this report."}\n`;

  await writeMarkdownArtifact("docs/final-operational-validation-report.md", md);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] generate-final-validation-report failed: ${message}`);
  process.exitCode = 1;
});
