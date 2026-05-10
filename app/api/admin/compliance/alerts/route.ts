import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantRequestContext } from "@/lib/tenancy/context";
import { listComplianceAlerts, upsertGovernancePolicy } from "@/lib/services/compliance.service";

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRequestContext(request, { allowApiKey: false });
    const alerts = await listComplianceAlerts(tenant.organizationId, tenant.companyId);
    return Response.json({ success: true, alerts });
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

    const policyType = typeof body.policyType === "string" ? body.policyType.trim() : "";
    if (!policyType) {
      return Response.json({ success: false, error: "policyType is required." }, { status: 400 });
    }

    const value = body.value && typeof body.value === "object" ? body.value : {};

    const policy = await upsertGovernancePolicy({
      organizationId: tenant.organizationId,
      companyId: tenant.companyId,
      policyType,
      value: value as Record<string, unknown>,
      createdByUserId: tenant.userId,
    });

    return Response.json({ success: true, policy }, { status: 201 });
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
