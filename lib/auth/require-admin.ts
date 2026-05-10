import { requireTenantContext, TenantAccessError, type TenantContext } from "@/lib/auth/server";

export type AdminContext = TenantContext & {
  role: "admin";
};

function roleFromClaims(claims: Record<string, unknown>): string | undefined {
  const appMetadata = claims.app_metadata;
  const userMetadata = claims.user_metadata;

  if (typeof appMetadata === "object" && appMetadata !== null && "role" in appMetadata) {
    return String(appMetadata.role);
  }

  if (typeof userMetadata === "object" && userMetadata !== null && "role" in userMetadata) {
    return String(userMetadata.role);
  }

  return undefined;
}

export async function requireAdmin(request: Request): Promise<AdminContext> {
  const tenant = await requireTenantContext(request);
  const role = roleFromClaims(tenant.claims);

  if (role !== "admin") {
    throw new TenantAccessError("Admin access is required.");
  }

  return {
    ...tenant,
    role: "admin",
  };
}
