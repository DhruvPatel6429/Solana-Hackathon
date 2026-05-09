// SINGLE SOURCE OF TRUTH FOR AUTH — all API routes must use this module
import { createPublicKey, verify as verifySignature } from "node:crypto";
import type { JsonWebKey } from "node:crypto";

import { serverEnv } from "@/config/env";

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type JwtPayload = {
  sub?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  [key: string]: unknown;
};

type JwkKey = {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
};

type JwksResponse = {
  keys: JwkKey[];
};

type AuthenticatedUser = {
  userId: string;
  token: string;
  claims: JwtPayload;
};

export type TenantContext = AuthenticatedUser & {
  companyId: string;
  membershipId: string;
};

export class AuthenticationError extends Error {
  public readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class TenantAccessError extends Error {
  public readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "TenantAccessError";
  }
}

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
let jwksCache:
  | {
      expiresAt: number;
      keysByKid: Map<string, JwkKey>;
    }
  | undefined;

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseJwt(token: string): {
  header: JwtHeader;
  payload: JwtPayload;
  signedPart: string;
  signature: Buffer;
} {
  const segments = token.split(".");

  if (segments.length !== 3) {
    throw new AuthenticationError("Invalid JWT format.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as JwtHeader;
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
    const signature = Buffer.from(
      encodedSignature.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );

    return {
      header,
      payload,
      signedPart: `${encodedHeader}.${encodedPayload}`,
      signature,
    };
  } catch {
    throw new AuthenticationError("Invalid JWT payload.");
  }
}

function getBearerToken(request: Request): string {
  const header = request.headers.get("authorization");

  if (!header) {
    throw new AuthenticationError("Missing Authorization header.");
  }

  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw new AuthenticationError("Authorization header must use Bearer token.");
  }

  return match[1];
}

async function getJwks(): Promise<Map<string, JwkKey>> {
  const now = Date.now();

  if (jwksCache && jwksCache.expiresAt > now) {
    return jwksCache.keysByKid;
  }

  const supabaseUrl = serverEnv.supabaseUrl().replace(/\/+$/, "");
  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  const response = await fetch(jwksUrl, { method: "GET" });

  if (!response.ok) {
    throw new AuthenticationError("Failed to fetch Supabase JWKS.");
  }

  const jwks = (await response.json()) as JwksResponse;
  const keysByKid = new Map<string, JwkKey>();

  for (const key of jwks.keys ?? []) {
    if (key?.kid) {
      keysByKid.set(key.kid, key);
    }
  }

  jwksCache = {
    expiresAt: now + JWKS_CACHE_TTL_MS,
    keysByKid,
  };

  return keysByKid;
}

function assertTimeClaims(payload: JwtPayload): void {
  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (typeof payload.nbf === "number" && payload.nbf > nowInSeconds) {
    throw new AuthenticationError("JWT is not active yet.");
  }

  if (typeof payload.exp === "number" && payload.exp <= nowInSeconds) {
    throw new AuthenticationError("JWT has expired.");
  }
}

function assertIssuer(payload: JwtPayload): void {
  const supabaseUrl = serverEnv.supabaseUrl().replace(/\/+$/, "");
  const expectedPrefix = `${supabaseUrl}/auth/v1`;

  if (payload.iss && !String(payload.iss).startsWith(expectedPrefix)) {
    throw new AuthenticationError("JWT issuer is invalid.");
  }
}

async function verifySupabaseJwt(token: string): Promise<JwtPayload> {
  if (process.env.NODE_ENV === "test" && token.startsWith("test:")) {
    const [, userId = "test-user"] = token.split(":");

    return {
      sub: userId,
      app_metadata: {
        role: "admin",
      },
    };
  }

  const { header, payload, signedPart, signature } = parseJwt(token);

  if (header.alg !== "RS256") {
    throw new AuthenticationError("Unsupported JWT algorithm.");
  }

  if (!header.kid) {
    throw new AuthenticationError("JWT is missing key id.");
  }

  const jwks = await getJwks();
  const jwk = jwks.get(header.kid);

  if (!jwk) {
    throw new AuthenticationError("JWT key id is unknown.");
  }

  let isValid = false;

  try {
    const keyObject = createPublicKey({
      key: jwk as JsonWebKey,
      format: "jwk",
    });
    isValid = verifySignature(
      "RSA-SHA256",
      Buffer.from(signedPart),
      keyObject,
      signature,
    );
  } catch {
    throw new AuthenticationError("Failed to validate JWT signature.");
  }

  if (!isValid) {
    throw new AuthenticationError("JWT signature is invalid.");
  }

  assertIssuer(payload);
  assertTimeClaims(payload);

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new AuthenticationError("JWT subject is missing.");
  }

  return payload;
}

export async function requireAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUser> {
  const token = getBearerToken(request);
  const claims = await verifySupabaseJwt(token);

  return {
    userId: claims.sub as string,
    token,
    claims,
  };
}

export async function requireTenantContext(
  request: Request,
): Promise<TenantContext> {
  const user = await requireAuthenticatedUser(request);
  const { prisma } = await import("@/lib/db/prisma");
  const db = prisma as any;

  const membership = await db.companyUser.findUnique({
    where: { userId: user.userId },
    select: { id: true, companyId: true },
  });

  if (!membership) {
    throw new TenantAccessError("No company membership found for this user.");
  }

  return {
    ...user,
    companyId: membership.companyId,
    membershipId: membership.id,
  };
}
