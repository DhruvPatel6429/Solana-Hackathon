/**
 * app/api/invoices/[id]/approve/route.ts
 *
 * Member 2 — Contractor Portal & Invoice Workflow
 *
 * PATCH /api/invoices/:id/approve
 *
 * Admin-only. Approves a PENDING invoice, fires the Solana payout via
 * POST /api/payouts/execute (M3's endpoint), and sends an approval email
 * to the contractor via Resend.
 *
 * Sequence:
 *   1. Authenticate + verify admin role
 *   2. Call approveInvoice() — sets status APPROVED, writes audit log
 *   3. Call POST /api/payouts/execute — M3 executes the on-chain transfer
 *   4. Send approval email to contractor via Resend
 *   5. Return the approved invoice + payout initiation result
 *
 * The payout call is best-effort with a structured error envelope: if it
 * fails, the invoice stays APPROVED (not rolled back) and the response
 * includes payoutError so the admin can retry from the dashboard. This
 * matches the doc's guidance — funds are held in escrow until approved, and
 * M3 owns the execution + confirmation lifecycle.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import { approveInvoice } from "@/lib/services/invoice.service";

// ─── Auth helper ──────────────────────────────────────────────────────────────

interface CallerIdentity {
  userId: string;
  companyId: string;
  role: "admin" | "contractor";
}

async function requireAdminAuth(req: NextRequest): Promise<CallerIdentity> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw NextResponse.json(
      { error: "Missing or malformed Authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw NextResponse.json(
      { error: "Unauthorized — invalid or expired token" },
      { status: 401 }
    );
  }

  const meta = user.user_metadata ?? {};
  const companyId = meta.companyId as string | undefined;

  if (!companyId) {
    throw NextResponse.json(
      { error: "Account is not associated with a company" },
      { status: 403 }
    );
  }

  const role = (meta.role as "admin" | "contractor") ?? "contractor";

  if (role !== "admin") {
    throw NextResponse.json(
      { error: "Only admins can approve invoices" },
      { status: 403 }
    );
  }

  return { userId: user.id, companyId, role };
}

// ─── Email helper ─────────────────────────────────────────────────────────────

/**
 * Send an approval notification to the contractor via Resend.
 * Non-throwing — email failure is logged but does not fail the request.
 * The payout has already been initiated; blocking on email would be wrong.
 */
async function sendApprovalEmail(opts: {
  contractorEmail: string;
  contractorName: string;
  invoiceId: string;
  amountUsdc: number;
  solanaTxSignature: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[approve] RESEND_API_KEY not set — skipping email");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);

  const explorerLink = opts.solanaTxSignature
    ? `https://explorer.solana.com/tx/${opts.solanaTxSignature}?cluster=devnet`
    : null;

  try {
    await resend.emails.send({
      from: "Borderless Payroll <payments@borderless-payroll.app>",
      to: opts.contractorEmail,
      subject: `✅ Invoice approved — $${opts.amountUsdc.toFixed(2)} USDC on its way`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #16a34a; margin-bottom: 8px;">Invoice Approved</h2>
          <p>Hi ${opts.contractorName},</p>
          <p>
            Your invoice <strong>#${opts.invoiceId.slice(0, 8).toUpperCase()}</strong>
            has been approved and a USDC payout of
            <strong>$${opts.amountUsdc.toFixed(2)}</strong> has been initiated.
          </p>
          ${
            explorerLink
              ? `<p>
              You can verify the transaction on Solana Explorer:<br/>
              <a href="${explorerLink}" style="color: #2563eb;">${opts.solanaTxSignature}</a>
            </p>`
              : `<p>Your payout is being processed and will appear in your wallet shortly.</p>`
          }
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
    console.error("[approve] Failed to send approval email:", message);
    return { sent: false, error: message };
  }
}

// ─── Route params type ────────────────────────────────────────────────────────

interface RouteContext {
  params: { id: string };
}

// ─── PATCH /api/invoices/:id/approve ─────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  // ── 1. Auth — admin only ──────────────────────────────────────────────────
  let caller: CallerIdentity;

  try {
    caller = await requireAdminAuth(req);
  } catch (errorResponse) {
    return errorResponse as NextResponse;
  }

  const { id: invoiceId } = params;
  if (!invoiceId?.trim()) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  // ── 2. Approve invoice in DB ──────────────────────────────────────────────
  let invoice: Awaited<ReturnType<typeof approveInvoice>>;

  try {
    invoice = await approveInvoice({
      invoiceId,
      adminId: caller.userId,
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

  // ── 3. Trigger Solana payout (M3's endpoint) ──────────────────────────────
  //
  // We call POST /api/payouts/execute internally. M3 owns the on-chain
  // execution and confirmation lifecycle. We forward the same auth token
  // so M3's route can verify the caller is a valid admin.
  //
  // If the payout call fails, we do NOT roll back the APPROVED status —
  // the admin dashboard has a retry mechanism, and the escrow vault holds
  // the funds safely. The response includes a payoutError field so the
  // frontend can surface a warning.

  let payoutResult: {
    payoutId?: string;
    solanaTxSignature?: string;
    status?: string;
    error?: string;
  } = {};

  try {
    const payoutResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/payouts/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward the caller's auth token so M3's route can authenticate
          Authorization: req.headers.get("Authorization") ?? "",
        },
        body: JSON.stringify({
          invoiceId,
          contractorId: invoice.contractorId,
          amountUsdc: invoice.amountUsdc,
          walletAddress: invoice.contractor.walletAddress,
        }),
      }
    );

    if (payoutResponse.ok) {
      const data = await payoutResponse.json();
      payoutResult = {
        payoutId: data.payout?.id,
        solanaTxSignature: data.payout?.solanaTxSignature,
        status: data.payout?.status,
      };
    } else {
      const errData = await payoutResponse.json().catch(() => ({}));
      payoutResult = {
        error:
          errData.error ??
          `Payout service returned ${payoutResponse.status}`,
      };
      console.error(
        `[approve] Payout execute failed for invoice ${invoiceId}:`,
        payoutResult.error
      );
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown payout error";
    payoutResult = { error: message };
    console.error(
      `[approve] Payout execute threw for invoice ${invoiceId}:`,
      message
    );
  }

  // ── 4. Send approval email to contractor ──────────────────────────────────
  const emailResult = await sendApprovalEmail({
    contractorEmail: invoice.contractor.email,
    contractorName: invoice.contractor.name,
    invoiceId,
    amountUsdc: Number(invoice.amountUsdc),
    solanaTxSignature: payoutResult.solanaTxSignature ?? null,
  });

  // ── 5. Return structured response ─────────────────────────────────────────
  //
  // Always 200 if the approval itself succeeded — payout and email failures
  // are surfaced in the envelope so the admin UI can show appropriate warnings
  // without treating the whole operation as failed.

  return NextResponse.json(
    {
      invoice: {
        id: invoice.id,
        status: invoice.status,
        approvedAt: invoice.approvedAt,
        amountUsdc: invoice.amountUsdc,
        contractorId: invoice.contractorId,
        invoiceHash: invoice.invoiceHash,
        contractor: {
          id: invoice.contractor.id,
          name: invoice.contractor.name,
          email: invoice.contractor.email,
          walletAddress: invoice.contractor.walletAddress,
          payoutPreference: invoice.contractor.payoutPreference,
        },
      },
      payout: payoutResult.error
        ? null
        : {
            payoutId: payoutResult.payoutId,
            solanaTxSignature: payoutResult.solanaTxSignature,
            status: payoutResult.status,
          },
      notifications: {
        email: emailResult.sent,
      },
      // Surface non-fatal downstream failures so the admin UI can warn
      ...(payoutResult.error && { payoutError: payoutResult.error }),
      ...(emailResult.error && { emailError: emailResult.error }),
    },
    { status: 200 }
  );
}