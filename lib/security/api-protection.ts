import { serverEnv } from "@/config/env";
import { getRequestId } from "@/lib/utils/logger";

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();
const replayKeys = new Map<string, number>();

export class ApiProtectionError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ApiProtectionError";
  }
}

function clientKey(request: Request, scope: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}

export function assertRateLimit(
  request: Request,
  options: { scope: string; limit: number; windowMs: number },
): void {
  const now = Date.now();
  const key = clientKey(request, options.scope);
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > options.limit) {
    throw new ApiProtectionError("Rate limit exceeded.", 429);
  }
}

export function assertCsrfSafe(request: Request): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    return;
  }

  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return;
  }

  const origin = request.headers.get("origin");
  const expectedOrigin = serverEnv.appOrigin();
  if (origin && origin !== expectedOrigin) {
    throw new ApiProtectionError("Invalid request origin.", 403);
  }

  const csrfCookie = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("bp_csrf="))
    ?.slice("bp_csrf=".length);
  const csrfHeader = request.headers.get("x-csrf-token");

  if (csrfCookie && csrfHeader !== csrfCookie) {
    throw new ApiProtectionError("Invalid CSRF token.", 403);
  }
}

export function assertIdempotencyKey(request: Request, scope: string): string {
  const key =
    request.headers.get("idempotency-key") ??
    request.headers.get("x-idempotency-key") ??
    getRequestId(request);
  const replayKey = `${scope}:${key}`;
  const now = Date.now();
  const expiresAt = replayKeys.get(replayKey);

  if (expiresAt && expiresAt > now) {
    throw new ApiProtectionError("Duplicate request replay blocked.", 409);
  }

  replayKeys.set(replayKey, now + 10 * 60 * 1000);
  return key;
}

export function assertWebhookFreshness(request: Request, maxSkewMs = 5 * 60 * 1000): {
  nonce?: string;
  timestamp?: Date;
} {
  const timestampHeader =
    request.headers.get("x-webhook-timestamp") ??
    request.headers.get("dodo-timestamp") ??
    request.headers.get("x-helius-timestamp");
  const nonce =
    request.headers.get("x-webhook-nonce") ??
    request.headers.get("dodo-nonce") ??
    request.headers.get("x-helius-nonce") ??
    undefined;

  if (!timestampHeader) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiProtectionError("Webhook timestamp is required.", 400);
    }
    return { nonce };
  }

  const timestampMs = Number(timestampHeader);
  const normalizedTimestamp = timestampMs > 9_999_999_999 ? timestampMs : timestampMs * 1000;
  if (!Number.isFinite(normalizedTimestamp)) {
    throw new ApiProtectionError("Webhook timestamp is invalid.", 400);
  }

  if (Math.abs(Date.now() - normalizedTimestamp) > maxSkewMs) {
    throw new ApiProtectionError("Webhook signature timestamp expired.", 400);
  }

  if (nonce) {
    const replayKey = `webhook:${nonce}`;
    const existing = replayKeys.get(replayKey);
    if (existing && existing > Date.now()) {
      throw new ApiProtectionError("Webhook nonce replay blocked.", 409);
    }
    replayKeys.set(replayKey, Date.now() + maxSkewMs);
  }

  return { nonce, timestamp: new Date(normalizedTimestamp) };
}
