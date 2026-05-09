/**
 * app/api/contractors/route.ts
 *
 * Member 2 — Contractor Portal & Invoice Workflow
 *
 * POST /api/contractors  — Onboard a new contractor under the authenticated company
 * GET  /api/contractors  — List all contractors for the authenticated company
 */

import { NextRequest, NextResponse } from "next/server";
import { KycStatus, PayoutPreference } from "@prisma/client";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import {
  onboardContractor,
  listContractors,
  type OnboardContractorInput,
} from "@/lib/services/contractor.service";

// ─── POST /api/contractors ────────────────────────────────────────────────────

/**
 * Onboard a new contractor.
 *
 * Request body:
 * {
 *   name: string
 *   email: string
 *   country: string
 *   taxId: string
 *   payoutPreference: "USDC" | "FIAT"
 *   walletAddress?: string        // required when payoutPreference === "USDC"
 *   preferredFiatCurrency?: string // required when payoutPreference === "FIAT"
 * }
 *
 * Response 201:
 * { contractor: Contractor }
 */
export async function POST(req: NextRequest) {
  let tenant: Awaited<ReturnType<typeof requireTenantContext>>;

  try {
    tenant = await requireTenantContext(req);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // ── Basic presence checks before hitting the service ──────────────────────
  const required = ["name", "email", "country", "taxId", "payoutPreference"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 400 }
      );
    }
  }

  // Validate payoutPreference enum value
  const validPreferences = Object.values(PayoutPreference);
  if (!validPreferences.includes(body.payoutPreference as PayoutPreference)) {
    return NextResponse.json(
      {
        error: `Invalid payoutPreference. Must be one of: ${validPreferences.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const input: OnboardContractorInput = {
    companyId: tenant.companyId,
    name: body.name as string,
    email: body.email as string,
    country: body.country as string,
    taxId: body.taxId as string,
    payoutPreference: body.payoutPreference as PayoutPreference,
    walletAddress: body.walletAddress as string | undefined,
    preferredFiatCurrency: body.preferredFiatCurrency as string | undefined,
  };

  try {
    const contractor = await onboardContractor(input);

    return NextResponse.json({ contractor }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";

    // Distinguish validation errors (400) from unexpected errors (500)
    const isValidationError =
      message.includes("required") ||
      message.includes("Invalid") ||
      message.includes("already exists");

    return NextResponse.json(
      { error: message },
      { status: isValidationError ? 400 : 500 }
    );
  }
}

// ─── GET /api/contractors ─────────────────────────────────────────────────────

/**
 * List all contractors for the authenticated company.
 *
 * Query params:
 *   kycStatus  — optional filter: "PENDING" | "VERIFIED" | "REJECTED"
 *   page       — page number (default: 1)
 *   pageSize   — results per page (default: 20, max: 100)
 *
 * Response 200:
 * {
 *   contractors: Contractor[],
 *   pagination: { total, page, pageSize, totalPages }
 * }
 */
export async function GET(req: NextRequest) {
  let tenant: Awaited<ReturnType<typeof requireTenantContext>>;

  try {
    tenant = await requireTenantContext(req);
  } catch (error) {
    return toHttpErrorResponse(error);
  }

  const { searchParams } = new URL(req.url);

  // Parse + validate kycStatus
  const kycStatusParam = searchParams.get("kycStatus");
  let kycStatus: KycStatus | undefined;
  if (kycStatusParam) {
    const validStatuses = Object.values(KycStatus);
    if (!validStatuses.includes(kycStatusParam as KycStatus)) {
      return NextResponse.json(
        {
          error: `Invalid kycStatus. Must be one of: ${validStatuses.join(", ")}`,
        },
        { status: 400 }
      );
    }
    kycStatus = kycStatusParam as KycStatus;
  }

  // Parse + clamp pagination
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10))
  );

  try {
    const result = await listContractors({
      companyId: tenant.companyId,
      kycStatus,
      page,
      pageSize,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
