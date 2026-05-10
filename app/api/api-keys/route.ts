import { toHttpErrorResponse } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import {
  issueApiKey,
  redactApiKey,
  revokeApiKey,
  rotateApiKey,
  type ApiKeyScope,
} from "@/lib/tenancy/api-keys";
import { requireTenantRequestContext } from "@/lib/tenancy/context";

const db = prisma as any;

const ALLOWED_SCOPES: ApiKeyScope[] = [
  "payouts:write",
  "payouts:read",
  "invoices:read",
  "invoices:write",
  "webhooks:manage",
  "dashboard:embed",
  "compliance:read",
  "audit:read",
];

function normalizeScopes(value: unknown): ApiKeyScope[] {
  if (!Array.isArray(value)) {
    return ["payouts:read", "invoices:read"];
  }

  const scopes = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item): item is ApiKeyScope => ALLOWED_SCOPES.includes(item as ApiKeyScope));

  return scopes.length > 0 ? scopes : ["payouts:read", "invoices:read"];
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRequestContext(request, { allowApiKey: false });

    const keys = await db.apiKey.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(tenant.companyId ? { companyId: tenant.companyId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        status: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return Response.json({ success: true, keys });
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const tenant = await requireTenantRequestContext(request, { allowApiKey: false });
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return Response.json({ success: false, error: "name is required." }, { status: 400 });
    }

    const scopes = normalizeScopes(body.scopes);

    const created = await issueApiKey({
      organizationId: tenant.organizationId,
      companyId: tenant.companyId,
      name,
      scopes,
      createdByUserId: tenant.userId,
      expiresAt:
        typeof body.expiresAt === "string" && body.expiresAt.trim()
          ? new Date(body.expiresAt)
          : null,
    });

    await db.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        companyId: tenant.companyId,
        action: "api_key_issued",
        actorUserId: tenant.userId,
        metadata: {
          apiKeyId: created.id,
          keyPrefix: created.keyPrefix,
          scopes,
        },
      },
    }).catch(() => undefined);

    return Response.json(
      {
        success: true,
        apiKey: {
          id: created.id,
          key: created.key,
          display: redactApiKey(created.key),
          keyPrefix: created.keyPrefix,
          scopes: created.scopes,
          status: created.status,
          expiresAt: created.expiresAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const tenant = await requireTenantRequestContext(request, { allowApiKey: false });
    const apiKeyId = typeof body.apiKeyId === "string" ? body.apiKeyId : "";
    const action = typeof body.action === "string" ? body.action : "";

    if (!apiKeyId || !action) {
      return Response.json({ success: false, error: "apiKeyId and action are required." }, { status: 400 });
    }

    if (action === "rotate") {
      const rotated = await rotateApiKey({
        apiKeyId,
        organizationId: tenant.organizationId,
        rotatedByUserId: tenant.userId,
      });

      return Response.json({
        success: true,
        rotated: {
          id: rotated.id,
          key: rotated.key,
          display: redactApiKey(rotated.key),
          keyPrefix: rotated.keyPrefix,
          scopes: rotated.scopes,
          expiresAt: rotated.expiresAt,
        },
      });
    }

    if (action === "revoke") {
      await revokeApiKey({ apiKeyId, organizationId: tenant.organizationId });
      return Response.json({ success: true, revoked: true });
    }

    return Response.json({ success: false, error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
