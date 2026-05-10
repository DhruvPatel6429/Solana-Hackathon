import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { webhookRecoveryService } from "@/lib/services/webhook-recovery.service";
import { getRequestId, jsonWithRequestId } from "@/lib/utils/logger";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    await requireAdmin(request);
    const results = await webhookRecoveryService.replayFailedWebhooks();
    return jsonWithRequestId({ success: true, results }, {}, requestId);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
