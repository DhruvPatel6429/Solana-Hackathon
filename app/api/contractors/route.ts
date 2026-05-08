/**
 * app/api/contractors/route.ts
 *
 * Member 2 — Contractor Portal & Invoice Workflow
 *
 * POST /api/contractors  — Onboard a new contractor under the authenticated company
 * GET  /api/contractors  — List all contractors for the authenticated company
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { KycStatus, PayoutPreference } from "@prisma/client";

import {
  onboardContractor,
  listContractors,
  type OnboardContractorInput,
} from "@/lib/services/contractor.service";

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Validates the Supabase JWT from the Authorization header and returns the
 * authenticated user's companyId (stored in user_metadata by M4's signup flow).
 *
 * Throws a NextResponse with 401 if auth fails.
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
  let auth: { userId: string; companyId: string };

  try {
    auth = await requireCompanyAuth(req);
  } catch (errorResponse) {
    return errorResponse as NextResponse;
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
    companyId: auth.companyId,
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
  let auth: { userId: string; companyId: string };

  try {
    auth = await requireCompanyAuth(req);
  } catch (errorResponse) {
    return errorResponse as NextResponse;
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
      companyId: auth.companyId,
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