import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { payoutRecoveryService } from "@/lib/services/payout-recovery.service";
import { getRequestId, jsonWithRequestId } from "@/lib/utils/logger";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const tenant = await requireAdmin(request);
    const results = await payoutRecoveryService.reconcileFailedPayouts({
      companyId: tenant.companyId,
    });
    return jsonWithRequestId({ success: true, results }, {}, requestId);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
