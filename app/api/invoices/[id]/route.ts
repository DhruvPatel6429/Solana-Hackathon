/**
 * app/api/invoices/[id]/route.ts
 *
 * Member 2 — Contractor Portal & Invoice Workflow
 *
 * GET /api/invoices/:id  — Fetch a single invoice by ID from the real DB,
 *                          including contractor profile and payout records.
 */

import { NextRequest, NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { getInvoiceById } from "@/lib/services/invoice.service";

type CallerRole = "admin" | "contractor";

type CallerIdentity = Awaited<ReturnType<typeof requireTenantContext>> & {
  role: CallerRole;
  contractorId?: string;
};

function getNestedClaimRecord(
  claims: Record<string, unknown>,
  key: "app_metadata" | "user_metadata",
): Record<string, unknown> | undefined {
  const raw = claims[key];
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  return raw as Record<string, unknown>;
}

function getCallerRole(claims: Record<string, unknown>): CallerRole {
  const appMetadata = getNestedClaimRecord(claims, "app_metadata");
  const userMetadata = getNestedClaimRecord(claims, "user_metadata");
  const claimedRole = appMetadata?.role ?? userMetadata?.role;
  return claimedRole === "admin" ? "admin" : "contractor";
}

function getContractorIdFromClaims(
  claims: Record<string, unknown>,
): string | undefined {
  const appMetadata = getNestedClaimRecord(claims, "app_metadata");
  const userMetadata = getNestedClaimRecord(claims, "user_metadata");
  const rawContractorId = appMetadata?.contractorId ?? userMetadata?.contractorId;
  return typeof rawContractorId === "string" && rawContractorId.trim()
    ? rawContractorId.trim()
    : undefined;
}

// ─── Route params type ────────────────────────────────────────────────────────

interface RouteContext {
  params: { id: string };
}

// ─── GET /api/invoices/:id ────────────────────────────────────────────────────

/**
 * Fetch a single invoice by ID.
 *
 * Returns the full invoice record including:
 *   - Contractor profile (name, country, payoutPreference, walletAddress, kycStatus)
 *   - All associated payout records (solanaTxSignature, status, executedAt)
 *
 * This single response shape covers every use case:
 *   - Admin invoice detail panel (review before approve/reject)
 *   - Contractor payment history row expansion
 *   - Compliance audit drill-down (tx hash + invoice hash in one response)
 *
 * Scoping rules:
 *   - Admin  → can fetch any invoice that belongs to their company.
 *   - Contractor → can only fetch invoices where invoice.contractorId
 *                  matches their own contractorId from the JWT. A contractor
 *                  cannot read another contractor's invoice even if they know
 *                  the ID.
 *
 * Response 200:
 * {
 *   invoice: {
 *     id, contractorId, companyId,
 *     amountUsdc, status, invoiceHash,
 *     submittedAt, approvedAt, rejectionReason,
 *     contractor: { id, name, email, country, payoutPreference, walletAddress, kycStatus },
 *     payouts: [{ id, solanaTxSignature, status, executedAt, amountUsdc }]
 *   }
 * }
 *
 * Error responses:
 *   401 — missing / invalid JWT
 *   403 — contractor attempting to view another contractor's invoice
 *   404 — invoice not found (or doesn't belong to caller's company)
 *   500 — unexpected server error
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let caller: CallerIdentity;

  try {
    const tenant = await requireTenantContext(req);
    caller = {
      ...tenant,
      role: getCallerRole(tenant.claims),
      contractorId: getContractorIdFromClaims(tenant.claims),
    };
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  // ── Param validation ──────────────────────────────────────────────────────
  const { id } = params;
  if (!id?.trim()) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  // ── Fetch from DB ─────────────────────────────────────────────────────────
  try {
    // getInvoiceById already scopes the query to companyId — a row is only
    // returned if both id AND companyId match. This is the primary multi-tenant
    // guard: an admin from Company A can never read Company B's invoices.
    const invoice = await getInvoiceById(id, caller.companyId);

    // ── Contractor scope check ──────────────────────────────────────────────
    // For contractor-role callers, we add a second layer: the invoice's
    // contractorId must match the contractorId in their JWT. This prevents a
    // contractor from reading a colleague's invoice within the same company.
    if (
      caller.role === "contractor" &&
      invoice.contractorId !== caller.contractorId
    ) {
      // Return 404 rather than 403 to avoid leaking that the invoice exists.
      return NextResponse.json(
        { error: `Invoice ${id} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ invoice }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    const isNotFound = message.toLowerCase().includes("not found");

    return NextResponse.json(
      { error: message },
      { status: isNotFound ? 404 : 500 }
    );
  }
}
