import "dotenv/config";

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { writeJsonArtifact } from "./phase4-common";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const outputDir = resolve("artifacts/backups");
  await mkdir(outputDir, { recursive: true });

  const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
  const outputFile = resolve(outputDir, fileName);

  const pgDumpBinary = process.env.PG_DUMP_BINARY ?? "pg_dump";

  const command = `${pgDumpBinary} "${databaseUrl}" --no-owner --file "${outputFile}"`;
  const result = spawnSync(command, {
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(`pg_dump failed: ${result.stderr || result.stdout}`);
  }

  const firstOrganization = await db.organization.findFirst({ select: { id: true } });
  const firstCompany = await db.company.findFirst({ select: { id: true, organizationId: true } });

  const snapshot = await db.disasterRecoverySnapshot.create({
    data: {
      organizationId: firstOrganization?.id ?? firstCompany?.organizationId ?? "unknown_organization",
      companyId: firstCompany?.id ?? null,
      snapshotType: "DB_BACKUP",
      reference: outputFile,
      payload: {
        command,
        outputFile,
        generatedAt: new Date().toISOString(),
      },
    },
  }).catch(() => null);

  await writeJsonArtifact("artifacts/backups/latest-backup.json", {
    success: true,
    outputFile,
    snapshotId: snapshot?.id ?? null,
  });

  console.info("[phase5] Database backup completed", { outputFile, snapshotId: snapshot?.id ?? null });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase5] backup-database failed: ${message}`);
  process.exitCode = 1;
});
