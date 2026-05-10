import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { rejectInvoice } from "@/lib/services/invoice.service";

type RejectInvoiceBody = {
  invoiceId?: unknown;
  id?: unknown;
  reason?: unknown;
};

function getClaimedRole(claims: Record<string, unknown>): string | undefined {
  const appMetadata = claims.app_metadata;
  const userMetadata = claims.user_metadata;

  if (
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    "role" in appMetadata
  ) {
    return String(appMetadata.role);
  }

  if (
    typeof userMetadata === "object" &&
    userMetadata !== null &&
    "role" in userMetadata
  ) {
    return String(userMetadata.role);
  }

  return undefined;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function PATCH(request: Request): Promise<Response> {
  let tenant: Awaited<ReturnType<typeof requireTenantContext>>;

  try {
    tenant = await requireTenantContext(request);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  if (getClaimedRole(tenant.claims) !== "admin") {
    return jsonError("Only admins can reject invoices.", 403);
  }

  let body: RejectInvoiceBody;
  try {
    body = (await request.json()) as RejectInvoiceBody;
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  const invoiceId =
    typeof body.invoiceId === "string"
      ? body.invoiceId.trim()
      : typeof body.id === "string"
        ? body.id.trim()
        : "";

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!invoiceId) {
    return jsonError("invoiceId is required.", 400);
  }

  if (!reason) {
    return jsonError("A rejection reason is required.", 400);
  }

  if (reason.length > 1000) {
    return jsonError("Rejection reason must be 1000 characters or fewer.", 400);
  }

  try {
    const invoice = await rejectInvoice({
      invoiceId,
      companyId: tenant.companyId,
      reason,
      adminId: tenant.userId,
    });

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        status: invoice.status,
        rejectionReason: invoice.rejectionReason,
        contractorId: invoice.contractorId,
        amountUsdc: invoice.amountUsdc,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const isNotFound = message.toLowerCase().includes("not found");
    const isConflict = message.includes("already");

    return jsonError(message, isNotFound ? 404 : isConflict ? 409 : 500);
  }
}
