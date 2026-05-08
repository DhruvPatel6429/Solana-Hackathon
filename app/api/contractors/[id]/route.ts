/**
 * app/api/contractors/[id]/route.ts
 *
 * Member 2 — Contractor Portal & Invoice Workflow
 *
 * GET    /api/contractors/:id  — Fetch a single contractor (with recent invoices)
 * PATCH  /api/contractors/:id  — Update contractor profile or KYC status
 * DELETE /api/contractors/:id  — Remove a contractor (soft-delete via kycStatus guard)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { KycStatus, PayoutPreference } from "@prisma/client";

import {
  getContractorById,
  updateContractor,
  updateKycStatus,
  type UpdateContractorInput,
} from "@/lib/services/contractor.service";
import { prisma } from "@/lib/db/prisma";

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Validates the Supabase JWT and returns the caller's userId + companyId.
 * Throws a ready-to-return NextResponse on failure.
 */
async function requireCompanyAuth(
  req: NextRequest
): Promise<{ userId: string; companyId: string }> {
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

  const companyId = user.user_metadata?.companyId as string | undefined;
  if (!companyId) {
    throw NextResponse.json(
      { error: "Account is not associated with a company" },
      { status: 403 }
    );
  }

  return { userId: user.id, companyId };
}

// ─── Route params type ────────────────────────────────────────────────────────

interface RouteContext {
  params: { id: string };
}

// ─── GET /api/contractors/:id ─────────────────────────────────────────────────

/**
 * Fetch a single contractor by ID.
 *
 * The response includes the contractor's profile plus their 10 most recent
 * invoices — used by the admin roster detail panel and the contractor's own
 * payment history page.
 *
 * Multi-tenant safe: the query is always scoped to the caller's companyId,
 * so a company can never read another company's contractors.
 *
 * Response 200:
 * {
 *   contractor: {
 *     id, name, email, country, taxId,
 *     payoutPreference, walletAddress, kycStatus, createdAt,
 *     invoices: [{ id, amountUsdc, status, submittedAt, approvedAt }]
 *   }
 * }
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  let auth: { userId: string; companyId: string };

  try {
    auth = await requireCompanyAuth(req);
  } catch (errorResponse) {
    return errorResponse as NextResponse;
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json(
      { error: "Contractor ID is required" },
      { status: 400 }
    );
  }

  try {
    const contractor = await getContractorById(id, auth.companyId);
    return NextResponse.json({ contractor }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const isNotFound = message.toLowerCase().includes("not found");
    return NextResponse.json(
      { error: message },
      { status: isNotFound ? 404 : 500 }
    );
  }
}

// ─── PATCH /api/contractors/:id ───────────────────────────────────────────────

/**
 * Update a contractor's profile or KYC status.
 *
 * Two distinct update modes in a single endpoint:
 *
 * 1. Profile update — any of:
 *    { name?, country?, taxId?, payoutPreference?, walletAddress?, preferredFiatCurrency? }
 *
 * 2. KYC status update — only admins should call this:
 *    { kycStatus: "PENDING" | "VERIFIED" | "REJECTED" }
 *    This is separated internally so the audit log captures KYC changes
 *    distinctly from general profile edits.
 *
 * Response 200:
 * { contractor: UpdatedContractor }
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  let auth: { userId: string; companyId: string };

  try {
    auth = await requireCompanyAuth(req);
  } catch (errorResponse) {
    return errorResponse as NextResponse;
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json(
      { error: "Contractor ID is required" },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json(
      { error: "Request body must not be empty" },
      { status: 400 }
    );
  }

  try {
    // ── KYC status update ────────────────────────────────────────────────────
    if ("kycStatus" in body) {
      const validStatuses = Object.values(KycStatus);
      if (!validStatuses.includes(body.kycStatus as KycStatus)) {
        return NextResponse.json(
          {
            error: `Invalid kycStatus. Must be one of: ${validStatuses.join(", ")}`,
          },
          { status: 400 }
        );
      }

      const contractor = await updateKycStatus(
        id,
        auth.companyId,
        body.kycStatus as KycStatus,
        auth.userId
      );

      return NextResponse.json({ contractor }, { status: 200 });
    }

    // ── Profile update ───────────────────────────────────────────────────────
    const allowedFields: Array<keyof UpdateContractorInput> = [
      "name",
      "country",
      "taxId",
      "payoutPreference",
      "walletAddress",
      "preferredFiatCurrency",
    ];

    // Reject unknown fields to avoid silent data corruption
    const unknownFields = Object.keys(body).filter(
      (k) => !allowedFields.includes(k as keyof UpdateContractorInput)
    );
    if (unknownFields.length > 0) {
      return NextResponse.json(
        { error: `Unknown field(s): ${unknownFields.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate payoutPreference enum if provided
    if (body.payoutPreference !== undefined) {
      const validPreferences = Object.values(PayoutPreference);
      if (!validPreferences.includes(body.payoutPreference as PayoutPreference)) {
        return NextResponse.json(
          {
            error: `Invalid payoutPreference. Must be one of: ${validPreferences.join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    const input: UpdateContractorInput = {
      contractorId: id,
      companyId: auth.companyId,
      ...(body.name !== undefined && { name: body.name as string }),
      ...(body.country !== undefined && { country: body.country as string }),
      ...(body.taxId !== undefined && { taxId: body.taxId as string }),
      ...(body.payoutPreference !== undefined && {
        payoutPreference: body.payoutPreference as PayoutPreference,
      }),
      ...(body.walletAddress !== undefined && {
        walletAddress: body.walletAddress as string,
      }),
      ...(body.preferredFiatCurrency !== undefined && {
        preferredFiatCurrency: body.preferredFiatCurrency as string,
      }),
    };

    const contractor = await updateContractor(input);
    return NextResponse.json({ contractor }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const isNotFound = message.toLowerCase().includes("not found");
    const isValidation =
      message.includes("required") ||
      message.includes("Invalid") ||
      message.includes("invalid");

    return NextResponse.json(
      { error: message },
      { status: isNotFound ? 404 : isValidation ? 400 : 500 }
    );
  }
}

// ─── DELETE /api/contractors/:id ──────────────────────────────────────────────

/**
 * Remove a contractor from the company.
 *
 * Safety rules:
 * - A contractor with PENDING or APPROVED invoices cannot be deleted.
 *   The admin must resolve all open invoices first.
 * - Deletion is a hard delete of the contractor record; associated invoices
 *   that are already PAID or REJECTED are preserved for audit trail purposes
 *   via the audit_logs table.
 *
 * Response 200:
 * { message: "Contractor deleted successfully" }
 */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  let auth: { userId: string; companyId: string };

  try {
    auth = await requireCompanyAuth(req);
  } catch (errorResponse) {
    return errorResponse as NextResponse;
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json(
      { error: "Contractor ID is required" },
      { status: 400 }
    );
  }

  try {
    // Verify the contractor exists and belongs to this company
    const contractor = await getContractorById(id, auth.companyId);

    // Block deletion if any invoices are still open
    const openInvoiceCount = await prisma.invoice.count({
      where: {
        contractorId: id,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });

    if (openInvoiceCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete contractor with ${openInvoiceCount} open invoice(s). Resolve all pending/approved invoices first.`,
        },
        { status: 409 }
      );
    }

    // Write audit log before deletion (the row won't exist after)
    await prisma.auditLog.create({
      data: {
        companyId: auth.companyId,
        action: "CONTRACTOR_DELETED",
        actorId: auth.userId,
        metadata: {
          contractorId: id,
          name: contractor.name,
          email: contractor.email,
          country: contractor.country,
        },
      },
    });

    await prisma.contractor.delete({ where: { id } });

    return NextResponse.json(
      { message: "Contractor deleted successfully" },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const isNotFound = message.toLowerCase().includes("not found");
    return NextResponse.json(
      { error: message },
      { status: isNotFound ? 404 : 500 }
    );
  }
}