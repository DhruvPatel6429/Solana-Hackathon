/**
 * app/api/invoices/[id]/reject/route.ts
 *
 * Member 2 — Contractor Portal & Invoice Workflow
 *
 * PATCH /api/invoices/:id/reject
 *
 * Admin-only. Rejects a PENDING invoice with a mandatory reason, writes the
 * audit log, and sends a rejection email to the contractor via Resend.
 *
 * No funds move on-chain — the escrow vault is untouched. The contractor
 * is expected to address the reason and resubmit a corrected invoice.
 *
 * Sequence:
 *   1. Authenticate + verify admin role
 *   2. Validate request body — reason is required
 *   3. Call rejectInvoice() — sets status REJECTED, stores reason, writes audit log
 *   4. Send rejection email to contractor via Resend
 *   5. Return the rejected invoice
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { rejectInvoice } from "@/lib/services/invoice.service";

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

// ─── Email helper ─────────────────────────────────────────────────────────────

/**
 * Send a rejection notification to the contractor via Resend.
 * Non-throwing — email failure is logged but never fails the HTTP response.
 * The rejection is already committed to the DB; blocking on email is wrong.
 */
async function sendRejectionEmail(opts: {
  contractorEmail: string;
  contractorName: string;
  invoiceId: string;
  amountUsdc: number;
  reason: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[reject] RESEND_API_KEY not set — skipping email");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);

  try {
    await resend.emails.send({
      from: "Borderless Payroll <payments@borderless-payroll.app>",
      to: opts.contractorEmail,
      subject: `❌ Invoice rejected — action required`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #dc2626; margin-bottom: 8px;">Invoice Rejected</h2>
          <p>Hi ${opts.contractorName},</p>
          <p>
            Your invoice <strong>#${opts.invoiceId.slice(0, 8).toUpperCase()}</strong>
            for <strong>$${opts.amountUsdc.toFixed(2)} USDC</strong> has been rejected
            by your administrator.
          </p>
          <div style="
            background: #fef2f2;
            border-left: 4px solid #dc2626;
            padding: 12px 16px;
            border-radius: 4px;
            margin: 20px 0;
          ">
            <p style="margin: 0; font-weight: 600; color: #991b1b;">Reason:</p>
            <p style="margin: 8px 0 0; color: #7f1d1d;">${opts.reason}</p>
          </div>
          <p>
            Please review the feedback above, make the necessary corrections,
            and resubmit your invoice from the contractor portal.
          </p>
          <p>
            No funds have been moved. Your payment will be processed once a
            corrected invoice is approved.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">
            Borderless Payroll Copilot — Global contractor payments on Solana
          </p>
        </div>
      `,
    });

    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error("[reject] Failed to send rejection email:", message);
    return { sent: false, error: message };
  }
}

// ─── Route params type ────────────────────────────────────────────────────────

interface RouteContext {
  params: { id: string };
}

// ─── PATCH /api/invoices/:id/reject ──────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  // ── 1. Auth — admin only ──────────────────────────────────────────────────
  let tenant: Awaited<ReturnType<typeof requireTenantContext>>;

  try {
    tenant = await requireTenantContext(req);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  const role = getClaimedRole(tenant.claims);
  if (role && role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can reject invoices" },
      { status: 403 },
    );
  }

  const { id: invoiceId } = params;
  if (!invoiceId?.trim()) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  // ── 2. Parse + validate body ──────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // reason is mandatory — without it the contractor has no idea what to fix
  if (!body.reason || typeof body.reason !== "string" || !body.reason.trim()) {
    return NextResponse.json(
      { error: "A rejection reason is required" },
      { status: 400 }
    );
  }

  const reason = body.reason.trim();

  // Enforce a reasonable length so the reason is actually useful
  if (reason.length > 1000) {
    return NextResponse.json(
      { error: "Rejection reason must be 1000 characters or fewer" },
      { status: 400 }
    );
  }

  // ── 3. Reject invoice in DB ───────────────────────────────────────────────
  let invoice: Awaited<ReturnType<typeof rejectInvoice>>;

  try {
    invoice = await rejectInvoice({
      invoiceId,
      companyId: tenant.companyId,
      reason,
      adminId: tenant.userId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";

    const isNotFound = message.toLowerCase().includes("not found");
    const isConflict = message.includes("already");

    return NextResponse.json(
      { error: message },
      { status: isNotFound ? 404 : isConflict ? 409 : 500 }
    );
  }

  // ── 4. Send rejection email to contractor ─────────────────────────────────
  const emailResult = await sendRejectionEmail({
    contractorEmail: invoice.contractor.email,
    contractorName: invoice.contractor.name,
    invoiceId,
    amountUsdc: Number(invoice.amountUsdc),
    reason,
  });

  // ── 5. Return structured response ─────────────────────────────────────────
  return NextResponse.json(
    {
      invoice: {
        id: invoice.id,
        status: invoice.status,
        rejectionReason: invoice.rejectionReason,
        amountUsdc: invoice.amountUsdc,
        contractorId: invoice.contractorId,
        submittedAt: invoice.submittedAt,
        contractor: {
          id: invoice.contractor.id,
          name: invoice.contractor.name,
          email: invoice.contractor.email,
        },
      },
      notifications: {
        email: emailResult.sent,
      },
      // Surface email failure as a warning — the rejection itself succeeded
      ...(emailResult.error && { emailError: emailResult.error }),
    },
    { status: 200 }
  );
}
