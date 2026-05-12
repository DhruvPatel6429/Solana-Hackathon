// SINGLE SOURCE OF TRUTH FOR AUTH — all API routes must use this module
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

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
  membershipRole: string;
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

let supabaseAdminClient: SupabaseClient | undefined;

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

function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      serverEnv.supabaseUrl(),
      serverEnv.supabaseServiceRoleKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return supabaseAdminClient;
}

function claimsFromUser(user: User, rawPayload: JwtPayload): JwtPayload {
  return {
    ...rawPayload,
    sub: user.id,
    aud: user.aud,
    email: user.email,
    phone: user.phone,
    role: user.role,
    app_metadata: user.app_metadata ?? {},
    user_metadata: user.user_metadata ?? {},
  };
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

  const { payload } = parseJwt(token);

  assertIssuer(payload);
  assertTimeClaims(payload);

  const { data, error } = await getSupabaseAdminClient().auth.getUser(token);

  if (error || !data.user) {
    throw new AuthenticationError(error?.message ?? "Invalid Supabase session.");
  }

  return claimsFromUser(data.user, payload);
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
    select: { id: true, companyId: true, role: true },
  });

  if (!membership) {
    throw new TenantAccessError("No company membership found for this user.");
  }

  return {
    ...user,
    companyId: membership.companyId,
    membershipId: membership.id,
    membershipRole: membership.role,
  };
}
