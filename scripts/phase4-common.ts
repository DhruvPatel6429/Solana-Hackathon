import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export type ValidationStatus = "PASS" | "FAIL";

export type ValidationCheck = {
  name: string;
  status: ValidationStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
};

export type ValidationReport = {
  name: string;
  generatedAt: string;
  environment: {
    network: string;
    rpcUrl: string;
  };
  checks: ValidationCheck[];
  summary: {
    passed: number;
    failed: number;
  };
};

const DEFAULT_DEVNET_USDC_MINT = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[phase4] Missing required env var: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch (error) {
    throw new Error(`[phase4] Invalid ${label}: ${value}`);
  }
}

export function requirePublicKeyEnv(name: string): PublicKey {
  return parsePublicKey(requiredEnv(name), name);
}

export function loadTreasuryWalletFromEnv(): Keypair {
  const secret = requiredEnv("TREASURY_WALLET_SECRET_KEY");
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(secret);
  } catch (error) {
    throw new Error("[phase4] TREASURY_WALLET_SECRET_KEY must be a valid base58 string.");
  }

  if (decoded.length !== 64) {
    throw new Error(
      `[phase4] TREASURY_WALLET_SECRET_KEY must decode to 64 bytes, received ${decoded.length}.`,
    );
  }

  return Keypair.fromSecretKey(decoded);
}

export function getConnection(): Connection {
  const rpcUrl = requiredEnv("SOLANA_RPC_URL");
  return new Connection(rpcUrl, { commitment: "finalized" });
}

export function getNetwork(): string {
  return optionalEnv("NEXT_PUBLIC_SOLANA_NETWORK") ?? "devnet";
}

export function getUsdcMint(): PublicKey {
  const mint = optionalEnv("DEVNET_USDC_MINT") ?? DEFAULT_DEVNET_USDC_MINT;
  return parsePublicKey(mint, "DEVNET_USDC_MINT");
}

export function explorerTxUrl(signature: string): string {
  const network = getNetwork();
  return `https://explorer.solana.com/tx/${signature}?cluster=${encodeURIComponent(network)}`;
}

export function explorerAddressUrl(address: string): string {
  const network = getNetwork();
  return `https://explorer.solana.com/address/${address}?cluster=${encodeURIComponent(network)}`;
}

export function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function invoiceIdForRun(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export function usdcToBaseUnitsString(amount: number | string, decimals = 6): string {
  const value = typeof amount === "number" ? amount.toString() : amount.trim();
  if (!/^(?:(\d+)(?:\.(\d*))?|\.(\d+))$/.test(value)) {
    throw new Error(`[phase4] Invalid decimal amount: ${value}`);
  }

  const match = value.match(/^(?:(\d+)(?:\.(\d*))?|\.(\d+))$/);
  const whole = match?.[1] ?? "0";
  const fraction = match?.[2] ?? match?.[3] ?? "";

  if (fraction.length > decimals) {
    throw new Error(`[phase4] Amount ${value} exceeds ${decimals} decimal places.`);
  }

  const baseUnits =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction || "").padEnd(decimals, "0") || "0");

  if (baseUnits <= 0n) {
    throw new Error("[phase4] Amount must be greater than zero.");
  }

  return baseUnits.toString();
}

export async function getUsdcBalance(connection: Connection, wallet: PublicKey, mint: PublicKey): Promise<{
  amount: string;
  uiAmount: number;
  tokenAccount: string;
}> {
  const tokenAccount = getAssociatedTokenAddressSync(mint, wallet, false);
  const balance = await connection.getTokenAccountBalance(tokenAccount).catch(() => null);

  if (!balance) {
    return {
      amount: "0",
      uiAmount: 0,
      tokenAccount: tokenAccount.toBase58(),
    };
  }

  return {
    amount: balance.value.amount,
    uiAmount: Number(balance.value.uiAmount ?? 0),
    tokenAccount: tokenAccount.toBase58(),
  };
}

export async function verifyDatabaseConnectivity(): Promise<void> {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  await client.query("SELECT 1");
  await client.end();
}

export async function verifyHttpReachable(url: string, timeoutMs = 10_000): Promise<{ status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    return { status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[phase4] URL not reachable: ${url}. ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

export function webhookUrlsFromEnv(): { dodo: string; helius: string } {
  const baseUrl = optionalEnv("APP_BASE_URL") ?? optionalEnv("APP_ORIGIN") ?? "http://localhost:3000";
  const normalized = baseUrl.replace(/\/$/, "");
  return {
    dodo: `${normalized}/api/webhooks/dodo`,
    helius: `${normalized}/api/webhooks/helius`,
  };
}

export async function runCheck(
  checks: ValidationCheck[],
  name: string,
  fn: () => Promise<Record<string, unknown> | void>,
): Promise<void> {
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();

  try {
    const details = await fn();
    const normalizedDetails = (details ?? undefined) as
      | Record<string, unknown>
      | undefined;
    const endedAtDate = new Date();
    checks.push({
      name,
      status: "PASS",
      startedAt,
      endedAt: endedAtDate.toISOString(),
      durationMs: endedAtDate.getTime() - startedAtDate.getTime(),
      details: normalizedDetails,
    });
  } catch (error) {
    const endedAtDate = new Date();
    const message = error instanceof Error ? error.message : String(error);
    checks.push({
      name,
      status: "FAIL",
      startedAt,
      endedAt: endedAtDate.toISOString(),
      durationMs: endedAtDate.getTime() - startedAtDate.getTime(),
      error: message,
    });
    throw error;
  }
}

export function buildReport(name: string, checks: ValidationCheck[]): ValidationReport {
  const passed = checks.filter((check) => check.status === "PASS").length;
  const failed = checks.length - passed;

  return {
    name,
    generatedAt: nowIso(),
    environment: {
      network: getNetwork(),
      rpcUrl: requiredEnv("SOLANA_RPC_URL"),
    },
    checks,
    summary: {
      passed,
      failed,
    },
  };
}

export function hasFailures(report: ValidationReport): boolean {
  return report.summary.failed > 0;
}

export async function writeJsonArtifact(relativePath: string, payload: unknown): Promise<string> {
  const targetPath = resolve(relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return targetPath;
}

export async function writeMarkdownArtifact(relativePath: string, markdown: string): Promise<string> {
  const targetPath = resolve(relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
  return targetPath;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function instructionDiscriminator(name: string): string {
  const digest = createHash("sha256").update(`global:${name}`, "utf8").digest();
  return digest.subarray(0, 8).toString("hex");
}

export function accountDiscriminator(name: string): string {
  const digest = createHash("sha256").update(`account:${name}`, "utf8").digest();
  return digest.subarray(0, 8).toString("hex");
}

export async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<{ status: number; json: unknown; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      status: response.status,
      json,
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function printReport(report: ValidationReport): void {
  const status = hasFailures(report) ? "FAIL" : "PASS";
  console.info(`[phase4] ${report.name} => ${status}`);
  console.info(`[phase4] Passed: ${report.summary.passed}, Failed: ${report.summary.failed}`);

  for (const check of report.checks) {
    if (check.status === "PASS") {
      console.info(`  [PASS] ${check.name} (${check.durationMs}ms)`);
    } else {
      console.error(`  [FAIL] ${check.name} (${check.durationMs}ms) :: ${check.error}`);
    }
  }
}
