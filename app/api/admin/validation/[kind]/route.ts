import { promises as fs } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

const execFile = promisify(execFileCallback);

type ValidationKind = "validate-anchor" | "live-payroll" | "batch" | "split" | "dodo" | "helius";

const validationScripts: Record<ValidationKind, { script: string; artifact: string }> = {
  "validate-anchor": {
    script: "scripts/validate-anchor-deployment.ts",
    artifact: "artifacts/anchor-deployment-validation.json",
  },
  "live-payroll": {
    script: "scripts/run-live-payroll-flow.ts",
    artifact: "artifacts/live-validation/live-payroll-report.json",
  },
  batch: {
    script: "scripts/run-batch-validation.ts",
    artifact: "artifacts/batch-validation-report.json",
  },
  split: {
    script: "scripts/run-split-validation.ts",
    artifact: "artifacts/split-validation-report.json",
  },
  dodo: {
    script: "scripts/test-dodo-webhook.ts",
    artifact: "artifacts/dodo-webhook-validation.json",
  },
  helius: {
    script: "scripts/test-helius-webhook.ts",
    artifact: "artifacts/helius-validation-report.json",
  },
};

async function runScript(scriptPath: string) {
  const cwd = process.cwd();
  await execFile(process.execPath, ["--import", "tsx", scriptPath], {
    cwd,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export async function POST(request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    await requireAdmin(request);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  const { kind } = await context.params;
  const validation = validationScripts[kind as ValidationKind];
  if (!validation) {
    return NextResponse.json({ error: `Unknown validation kind: ${kind}` }, { status: 400 });
  }

  try {
    await runScript(path.join(process.cwd(), validation.script));

    const artifactPath = path.join(process.cwd(), validation.artifact);
    const artifactRaw = await fs.readFile(artifactPath, "utf8");
    const artifact = JSON.parse(artifactRaw) as unknown;

    return NextResponse.json({
      success: true,
      kind,
      artifactPath: validation.artifact,
      artifact,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        kind,
        error: error instanceof Error ? error.message : "Validation script failed.",
      },
      { status: 500 },
    );
  }
}