import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export type ApiKeyScope =
  | "payouts:write"
  | "payouts:read"
  | "invoices:read"
  | "invoices:write"
  | "webhooks:manage"
  | "dashboard:embed"
  | "compliance:read"
  | "audit:read";

export type CreatedApiKey = {
  id: string;
  key: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  status: "ACTIVE" | "REVOKED";
  expiresAt: Date | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function redactApiKey(key: string): string {
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export function hashApiKey(rawKey: string): string {
  return sha256(rawKey);
}

export function generateRawApiKey(): string {
  const token = randomBytes(24).toString("hex");
  return `bpc_live_${token}`;
}

export async function issueApiKey(input: {
  organizationId: string;
  companyId?: string;
  name: string;
  scopes: ApiKeyScope[];
  createdByUserId?: string;
  expiresAt?: Date | null;
}): Promise<CreatedApiKey> {
  const raw = generateRawApiKey();
  const keyHash = hashApiKey(raw);
  const keyPrefix = raw.slice(0, 12);

  const row = await db.apiKey.create({
    data: {
      organizationId: input.organizationId,
      companyId: input.companyId,
      name: input.name,
      keyPrefix,
      keyHash,
      scopes: input.scopes,
      status: "ACTIVE",
      createdByUserId: input.createdByUserId,
      expiresAt: input.expiresAt ?? null,
    },
  });

  return {
    id: row.id,
    key: raw,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes as ApiKeyScope[],
    status: row.status,
    expiresAt: row.expiresAt,
  };
}

export async function rotateApiKey(input: {
  apiKeyId: string;
  organizationId: string;
  rotatedByUserId?: string;
}): Promise<CreatedApiKey> {
  const existing = await db.apiKey.findFirst({
    where: {
      id: input.apiKeyId,
      organizationId: input.organizationId,
      status: "ACTIVE",
    },
  });

  if (!existing) {
    throw new Error("API key not found or not active.");
  }

  await db.apiKey.update({
    where: { id: existing.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return issueApiKey({
    organizationId: existing.organizationId,
    companyId: existing.companyId,
    name: `${existing.name} (rotated)`,
    scopes: (existing.scopes ?? []) as ApiKeyScope[],
    createdByUserId: input.rotatedByUserId,
    expiresAt: existing.expiresAt,
  });
}

export async function revokeApiKey(input: {
  apiKeyId: string;
  organizationId: string;
}): Promise<void> {
  const row = await db.apiKey.findFirst({
    where: {
      id: input.apiKeyId,
      organizationId: input.organizationId,
    },
  });

  if (!row) {
    throw new Error("API key not found.");
  }

  await db.apiKey.update({
    where: { id: row.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
  });
}

export async function authenticateApiKey(rawKey: string) {
  if (!rawKey?.trim()) {
    return null;
  }

  const keyHash = hashApiKey(rawKey.trim());
  const row = await db.apiKey.findUnique({ where: { keyHash } });

  if (!row || row.status !== "ACTIVE") {
    return null;
  }

  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  await db.apiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => undefined);

  return {
    apiKeyId: row.id,
    organizationId: row.organizationId,
    companyId: row.companyId ?? undefined,
    scopes: (row.scopes ?? []) as ApiKeyScope[],
    keyPrefix: row.keyPrefix,
    name: row.name,
  };
}
