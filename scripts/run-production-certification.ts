import "dotenv/config";

import { spawnSync } from "node:child_process";

import {
  fetchJsonWithTimeout,
  getConnection,
  nowIso,
  parsePublicKey,
  requiredEnv,
  verifyDatabaseConnectivity,
  webhookUrlsFromEnv,
  writeJsonArtifact,
} from "./phase4-common";

import { prisma } from "../lib/db/prisma";

type SubsystemResult = {
  subsystem: string;
  status: "PASS" | "FAIL";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
};

const db = prisma as any;

function runCommand(command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; exitCode: number | null } {
  const result = spawnSync(command, args, {
    shell: process.platform === "win32",
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status,
  };
}

async function runSubsystem(
  results: SubsystemResult[],
  subsystem: string,
  fn: () => Promise<Record<string, unknown> | void>,
): Promise<void> {
  const started = Date.now();
  const startedAt = nowIso();

  try {
    const details = await fn();
    const normalizedDetails = (details ?? undefined) as
      | Record<string, unknown>
      | undefined;
    results.push({
      subsystem,
      status: "PASS",
      startedAt,
      endedAt: nowIso(),
      durationMs: Date.now() - started,
      details: normalizedDetails,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      subsystem,
      status: "FAIL",
      startedAt,
      endedAt: nowIso(),
      durationMs: Date.now() - started,
      error: message,
    });
  }
}

function requireAdminApiConfig(): { baseUrl: string; token: string } {
  const baseUrl = requiredEnv("APP_BASE_URL").replace(/\/$/, "");
  const token = requiredEnv("ADMIN_BEARER_TOKEN");
  return { baseUrl, token };
}

async function main(): Promise<void> {
  const results: SubsystemResult[] = [];
  const connection = getConnection();

  await runSubsystem(results, "env_validation", async () => {
    const requiredVars = [
      "DATABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
      "SOLANA_RPC_URL",
      "TREASURY_WALLET_SECRET_KEY",
      "ESCROW_PROGRAM_ID",
      "DODO_WEBHOOK_SECRET",
      "HELIUS_WEBHOOK_SECRET",
      "NEXT_PUBLIC_SOLANA_NETWORK",
    ];

    for (const name of requiredVars) {
      requiredEnv(name);
    }

    parsePublicKey(requiredEnv("ESCROW_PROGRAM_ID"), "ESCROW_PROGRAM_ID");

    return {
      requiredVarsValidated: requiredVars.length,
    };
  });

  await runSubsystem(results, "typecheck", async () => {
    const result = runCommand("npm", ["run", "typecheck"]);
    if (!result.ok) {
      throw new Error(`typecheck failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`);
    }

    return { command: "npm run typecheck" };
  });

  await runSubsystem(results, "build", async () => {
    const result = runCommand("npm", ["run", "build"]);
    if (!result.ok) {
      throw new Error(`build failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`);
    }

    return { command: "npm run build" };
  });

  await runSubsystem(results, "migrations", async () => {
    const result = runCommand("npx", ["prisma", "migrate", "status"]);
    if (!result.ok) {
      throw new Error(`migrate status failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`);
    }

    return { command: "npx prisma migrate status" };
  });

  await runSubsystem(results, "docker_build", async () => {
    const result = runCommand("docker", ["build", "-t", "borderless-payroll-copilot:phase4-cert", "."]);
    if (!result.ok) {
      throw new Error(`docker build failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`);
    }

    return { command: "docker build -t borderless-payroll-copilot:phase4-cert ." };
  });

  await runSubsystem(results, "anchor_build", async () => {
    const result = runCommand("npm", ["run", "anchor:build"]);
    if (!result.ok) {
      throw new Error(`anchor build failed (exit ${result.exitCode})\n${result.stderr || result.stdout}`);
    }

    return { command: "npm run anchor:build" };
  });

  await runSubsystem(results, "db_connectivity", async () => {
    await verifyDatabaseConnectivity();
    return { database: "reachable" };
  });

  await runSubsystem(results, "solana_connectivity", async () => {
    const latest = await connection.getLatestBlockhash("finalized");
    return {
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    };
  });

  await runSubsystem(results, "api_health", async () => {
    const baseUrl = requiredEnv("APP_BASE_URL").replace(/\/$/, "");
    const response = await fetchJsonWithTimeout(`${baseUrl}/api/health`, { method: "GET" }, 20_000);

    if (response.status !== 200) {
      throw new Error(`Health endpoint returned ${response.status}: ${response.text}`);
    }

    return {
      status: response.status,
      body: response.json ?? response.text,
    };
  });

  await runSubsystem(results, "operational_endpoints", async () => {
    const { baseUrl, token } = requireAdminApiConfig();

    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };

    const [metrics, reconciliation, systemHealth, auditExport] = await Promise.all([
      fetchJsonWithTimeout(`${baseUrl}/api/admin/metrics`, { method: "GET", headers }, 20_000),
      fetchJsonWithTimeout(`${baseUrl}/api/admin/reconciliation-report`, { method: "GET", headers }, 20_000),
      fetchJsonWithTimeout(`${baseUrl}/api/admin/system-health`, { method: "GET", headers }, 20_000),
      fetchJsonWithTimeout(`${baseUrl}/api/audit/export?format=json&type=payouts`, { method: "GET", headers }, 20_000),
    ]);

    const failing = [
      { name: "metrics", status: metrics.status },
      { name: "reconciliation", status: reconciliation.status },
      { name: "systemHealth", status: systemHealth.status },
      { name: "auditExport", status: auditExport.status },
    ].filter((item) => item.status < 200 || item.status >= 300);

    if (failing.length > 0) {
      throw new Error(
        `Operational endpoints failed: ${failing.map((item) => `${item.name}:${item.status}`).join(", ")}`,
      );
    }

    return {
      metricsStatus: metrics.status,
      reconciliationStatus: reconciliation.status,
      systemHealthStatus: systemHealth.status,
      auditExportStatus: auditExport.status,
    };
  });

  await runSubsystem(results, "logging_pipeline", async () => {
    const correlationId = `phase4-cert-${Date.now()}`;
    const existingCompany = await db.company.findFirst({ select: { id: true } });
    const companyId =
      existingCompany?.id ??
      (
        await db.company.create({
          data: {
            id: `company_phase4_cert_${Date.now()}`,
            name: "Phase4 Certification Probe Company",
          },
          select: { id: true },
        })
      ).id;

    const log = await db.auditLog.create({
      data: {
        companyId,
        action: "phase4_certification_log_probe",
        actorUserId: "phase4-cert-script",
        metadata: {
          correlationId,
          createdAt: nowIso(),
        },
      },
    });

    const fetched = await db.auditLog.findUnique({ where: { id: log.id } });

    if (!fetched) {
      throw new Error("Audit log probe could not be read back from DB.");
    }

    return {
      auditLogId: fetched.id,
      correlationId,
    };
  });

  await runSubsystem(results, "webhook_configuration", async () => {
    requiredEnv("DODO_WEBHOOK_SECRET");
    requiredEnv("HELIUS_WEBHOOK_SECRET");
    const urls = webhookUrlsFromEnv();

    const [dodo, helius] = await Promise.all([
      fetchJsonWithTimeout(
        urls.dodo,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
            "x-webhook-nonce": `phase4-cert-dodo-${Date.now()}`,
            "dodo-signature": "00",
          },
          body: JSON.stringify({ healthProbe: true }),
        },
        20_000,
      ),
      fetchJsonWithTimeout(
        urls.helius,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-helius-webhook-secret": requiredEnv("HELIUS_WEBHOOK_SECRET"),
            "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
            "x-webhook-nonce": `phase4-cert-helius-${Date.now()}`,
          },
          body: JSON.stringify([{ healthProbe: true }]),
        },
        20_000,
      ),
    ]);

    if (dodo.status >= 500 || helius.status >= 500) {
      throw new Error(`Webhook endpoints unreachable or failing (dodo=${dodo.status}, helius=${helius.status}).`);
    }

    return {
      dodoEndpoint: urls.dodo,
      dodoStatus: dodo.status,
      heliusEndpoint: urls.helius,
      heliusStatus: helius.status,
    };
  });

  const report = {
    name: "production-certification",
    generatedAt: nowIso(),
    summary: {
      passed: results.filter((item) => item.status === "PASS").length,
      failed: results.filter((item) => item.status === "FAIL").length,
    },
    subsystems: results,
  };

  await writeJsonArtifact("artifacts/production-certification-report.json", report);

  const failed = report.subsystems.filter((item) => item.status === "FAIL");
  for (const subsystem of report.subsystems) {
    const line = `${subsystem.status} - ${subsystem.subsystem}`;
    if (subsystem.status === "PASS") {
      console.info(`[phase4] ${line}`);
    } else {
      console.error(`[phase4] ${line}: ${subsystem.error}`);
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] run-production-certification failed: ${message}`);
  process.exitCode = 1;
});
