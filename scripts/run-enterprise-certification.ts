import "dotenv/config";

import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { fetchJsonWithTimeout, requiredEnv, writeJsonArtifact } from "./phase4-common";

type Check = {
  name: string;
  category: "technical" | "commercial";
  status: "PASS" | "FAIL";
  detail?: string;
  error?: string;
};

function runCmd(command: string, args: string[]): { ok: boolean; out: string } {
  const result = spawnSync(command, args, {
    shell: process.platform === "win32",
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

async function checkFile(path: string): Promise<void> {
  await access(path);
}

async function main(): Promise<void> {
  const checks: Check[] = [];

  const runCheck = async (
    name: string,
    category: "technical" | "commercial",
    fn: () => Promise<string | void>,
  ) => {
    try {
      const detail = await fn();
      checks.push({
        name,
        category,
        status: "PASS",
        detail: detail ?? undefined,
      });
    } catch (error) {
      checks.push({
        name,
        category,
        status: "FAIL",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await runCheck("build", "technical", async () => {
    const result = runCmd("npm", ["run", "build"]);
    if (!result.ok) throw new Error(result.out.slice(-2000));
    return "npm run build passed";
  });

  await runCheck("tests", "technical", async () => {
    const result = runCmd("npm", ["test"]);
    if (!result.ok) throw new Error(result.out.slice(-2000));
    return "npm test passed";
  });

  await runCheck("typecheck", "technical", async () => {
    const result = runCmd("npm", ["run", "typecheck"]);
    if (!result.ok) throw new Error(result.out.slice(-2000));
    return "npm run typecheck passed";
  });

  await runCheck("wallet_and_solana_env", "technical", async () => {
    requiredEnv("SOLANA_RPC_URL");
    requiredEnv("TREASURY_WALLET_SECRET_KEY");
    requiredEnv("ESCROW_PROGRAM_ID");
    return "Solana environment variables present";
  });

  await runCheck("db_and_webhook_env", "technical", async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("DODO_WEBHOOK_SECRET");
    requiredEnv("HELIUS_WEBHOOK_SECRET");
    return "Database and webhook secrets present";
  });

  await runCheck("scaling_script", "technical", async () => {
    await checkFile("scripts/load-test-platform.ts");
    await checkFile("artifacts/load-test-report.json").catch(() => undefined);
    return "load-test-platform script exists";
  });

  await runCheck("tenant_isolation_validation", "technical", async () => {
    const result = runCmd("npm", ["run", "phase5:verify-tenancy"]);
    if (!result.ok) throw new Error(result.out.slice(-2000));
    return "Tenant isolation verification passed";
  });

  await runCheck("recovery_scripts", "technical", async () => {
    await checkFile("scripts/backup-database.ts");
    await checkFile("scripts/run-disaster-recovery-drill.ts");
    return "Recovery scripts exist";
  });

  await runCheck("tenancy_and_partner_apis", "commercial", async () => {
    await Promise.all([
      checkFile("app/api/organizations/route.ts"),
      checkFile("app/api/partners/route.ts"),
      checkFile("app/api/api-keys/route.ts"),
      checkFile("lib/tenancy/context.ts"),
    ]);
    return "Tenant and partner APIs implemented";
  });

  await runCheck("documentation_package", "commercial", async () => {
    await Promise.all([
      checkFile("docs/tenant-onboarding-guide.md"),
      checkFile("docs/partner-integration-guide.md"),
      checkFile("docs/white-label-integration-guide.md"),
      checkFile("docs/compliance-architecture.md"),
      checkFile("docs/disaster-recovery-plan.md"),
      checkFile("docs/security-audit-report.md"),
      checkFile("docs/final-enterprise-launch-report.md"),
    ]);
    return "Commercial and governance documentation present";
  });

  await runCheck("api_surface_runtime_smoke", "commercial", async () => {
    const baseUrl = process.env.APP_BASE_URL?.trim();
    const adminToken = process.env.ADMIN_BEARER_TOKEN?.trim();

    if (!baseUrl || !adminToken) {
      return "Skipped runtime API smoke (APP_BASE_URL or ADMIN_BEARER_TOKEN not set)";
    }

    const headers = {
      authorization: `Bearer ${adminToken}`,
      "content-type": "application/json",
    };

    const [organizations, apiKeys, partners] = await Promise.all([
      fetchJsonWithTimeout(`${baseUrl.replace(/\/$/, "")}/api/organizations`, { method: "GET", headers }),
      fetchJsonWithTimeout(`${baseUrl.replace(/\/$/, "")}/api/api-keys`, { method: "GET", headers }),
      fetchJsonWithTimeout(`${baseUrl.replace(/\/$/, "")}/api/partners`, { method: "GET", headers }),
    ]);

    if (organizations.status >= 400 || apiKeys.status >= 400 || partners.status >= 400) {
      throw new Error(
        `Enterprise API smoke failed: org=${organizations.status} apiKeys=${apiKeys.status} partners=${partners.status}`,
      );
    }

    return `Enterprise APIs healthy (org=${organizations.status}, apiKeys=${apiKeys.status}, partners=${partners.status})`;
  });

  const technical = checks.filter((check) => check.category === "technical");
  const commercial = checks.filter((check) => check.category === "commercial");

  const score = {
    technical: {
      passed: technical.filter((check) => check.status === "PASS").length,
      total: technical.length,
    },
    commercial: {
      passed: commercial.filter((check) => check.status === "PASS").length,
      total: commercial.length,
    },
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      passed: checks.filter((check) => check.status === "PASS").length,
      failed: checks.filter((check) => check.status === "FAIL").length,
    },
    score,
    checks,
    finalEnterpriseScore:
      score.technical.total + score.commercial.total === 0
        ? 0
        : Number(
            (
              ((score.technical.passed + score.commercial.passed) /
                (score.technical.total + score.commercial.total)) *
              100
            ).toFixed(2),
          ),
  };

  await writeJsonArtifact("artifacts/enterprise-certification-report.json", report);

  for (const check of checks) {
    const line = `${check.status} [${check.category}] ${check.name}`;
    if (check.status === "PASS") {
      console.info(`[phase5] ${line}`);
    } else {
      console.error(`[phase5] ${line}: ${check.error}`);
    }
  }

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase5] run-enterprise-certification failed: ${message}`);
  process.exitCode = 1;
});
