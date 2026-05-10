import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AuthenticationError, TenantAccessError } from "@/lib/auth/server";
import { authenticateApiKey, type ApiKeyScope } from "@/lib/tenancy/api-keys";

const db = prisma as any;

export type TenantRequestContext = {
  authMode: "admin_jwt" | "api_key";
  userId?: string;
  companyId?: string;
  organizationId: string;
  role: string;
  scopes: ApiKeyScope[];
};

async function resolveOrganizationId(companyId: string): Promise<string | null> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true },
  });

  return company?.organizationId ?? null;
}

export async function requireTenantRequestContext(
  request: Request,
  options: {
    allowedScopes?: ApiKeyScope[];
    allowApiKey?: boolean;
  } = {},
): Promise<TenantRequestContext> {
  const allowApiKey = options.allowApiKey ?? true;

  if (allowApiKey) {
    const rawApiKey = request.headers.get("x-api-key") ?? request.headers.get("authorization")?.replace(/^ApiKey\s+/i, "");

    if (rawApiKey) {
      const key = await authenticateApiKey(rawApiKey);

      if (!key) {
        throw new AuthenticationError("Invalid API key.");
      }

      if (options.allowedScopes && options.allowedScopes.length > 0) {
        const missing = options.allowedScopes.filter((scope) => !key.scopes.includes(scope));
        if (missing.length > 0) {
          throw new TenantAccessError(`API key missing required scopes: ${missing.join(", ")}`);
        }
      }

      return {
        authMode: "api_key",
        organizationId: key.organizationId,
        companyId: key.companyId,
        role: "api_key",
        scopes: key.scopes,
      };
    }
  }

  const admin = await requireAdmin(request);
  const organizationId = await resolveOrganizationId(admin.companyId);

  if (!organizationId) {
    throw new TenantAccessError("Organization context is not configured for this company.");
  }

  return {
    authMode: "admin_jwt",
    userId: admin.userId,
    companyId: admin.companyId,
    organizationId,
    role: admin.role,
    scopes: [],
  };
}

export function assertOrganizationMatch(
  tenant: TenantRequestContext,
  organizationId?: string | null,
): void {
  if (!organizationId) {
    throw new TenantAccessError("Organization ID is required.");
  }

  if (tenant.organizationId !== organizationId) {
    throw new TenantAccessError("Cross-tenant access blocked: organization mismatch.");
  }
}

export function assertCompanyMatch(
  tenant: TenantRequestContext,
  companyId?: string | null,
): void {
  if (tenant.companyId && companyId && tenant.companyId !== companyId) {
    throw new TenantAccessError("Cross-tenant access blocked: company mismatch.");
  }
}
