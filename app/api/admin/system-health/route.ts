import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSystemHealth } from "@/lib/services/metrics.service";
import { getRequestId, jsonWithRequestId } from "@/lib/utils/logger";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const tenant = await requireAdmin(request);
    const health = await getSystemHealth(tenant.companyId);
    return jsonWithRequestId(health, { status: health.ok ? 200 : 503 }, requestId);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
