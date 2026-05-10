import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getReconciliationReport } from "@/lib/services/reconciliation.service";
import { getRequestId, jsonWithRequestId } from "@/lib/utils/logger";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const tenant = await requireAdmin(request);
    const report = await getReconciliationReport(tenant.companyId);
    return jsonWithRequestId(report, {}, requestId);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
