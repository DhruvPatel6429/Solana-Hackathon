import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSystemMetrics } from "@/lib/services/metrics.service";
import { getRequestId, jsonWithRequestId } from "@/lib/utils/logger";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const tenant = await requireAdmin(request);
    const metrics = await getSystemMetrics(tenant.companyId);
    return jsonWithRequestId(metrics, {}, requestId);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
