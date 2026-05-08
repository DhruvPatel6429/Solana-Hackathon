/**
 * app/api/invoices/route.ts
 *
 * Member 2 — Contractor Portal & Invoice Workflow
 *
 * POST /api/invoices  — Contractor submits a new invoice for approval
 * GET  /api/invoices  — List invoices (company-wide for admins, own-only for contractors)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { InvoiceStatus } from "@prisma/client";

import {
  createInvoice,
  listInvoices,
  type CreateInvoiceInput,
  type LineItem,
} from "@/lib/services/invoice.service";

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Caller identity resolved from the Supabase JWT.
 *
 * role:
 *   "admin"      — company finance admin; can see all invoices for their company
 *   "contractor" — can only submit and view their own invoices
 *
 * companyId is always present.
 * contractorId is only present when role === "contractor".
 */
interface CallerIdentity {
  userId: string;
  companyId: string;
  role: "admin" | "contractor";
  contractorId?: string;
}

async function requireAuth(req: NextRequest): Promise<CallerIdentity> {
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
  const contractorId = meta.contractorId as string | undefined;

  return { userId: user.id, companyId, role, contractorId };
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function validateLineItems(items: unknown): LineItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("lineItems must be a non-empty array");
  }

  return items.map((item: unknown, i: number) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`lineItems[${i}] must be an object`);
    }

    const { description, quantity, unitPrice } = item as Record<string, unknown>;

    if (typeof description !== "string" || !description.trim()) {
      throw new Error(`lineItems[${i}].description is required`);
    }
    if (typeof quantity !== "number" || quantity <= 0) {
      throw new Error(`lineItems[${i}].quantity must be a positive number`);
    }
    if (typeof unitPrice !== "number" || unitPrice < 0) {
      throw new Error(`lineItems[${i}].unitPrice must be a non-negative number`);
    }

    return {
      description: description.trim(),
      quantity,
      unitPrice,
    };
  });
}

// ─── POST /api/invoices ───────────────────────────────────────────────────────

/**
 * Submit a new invoice for approval.
 *
 * Who can call this: contractors (from their portal) and admins
 * (creating on behalf of a contractor).
 *
 * Request body:
 * {
 *   contractorId: string          // whose invoice this is
 *   amountUsdc: number            // total invoice value in USDC
 *   workPeriodStart: string       // ISO date  e.g. "2025-05-01"
 *   workPeriodEnd: string         // ISO date  e.g. "2025-05-31"
 *   lineItems: [
 *     { description: string, quantity: number, unitPrice: number }
 *   ]
 *   currency?: string             // defaults to "USDC"
 *   notes?: string
 * }
 *
 * Security:
 *   - A contractor can only submit invoices for their own contractorId.
 *   - An admin can submit on behalf of any contractor in their company.
 *   - amountUsdc is cross-checked against the sum of lineItems to prevent
 *     mismatches (tolerance: ±0.01 USDC for floating point).
 *
 * Response 201:
 * { invoice: Invoice }
 */
export async function POST(req: NextRequest) {
  let caller: CallerIdentity;

  try {
    caller = await requireAuth(req);
  } catch (errorResponse) {
    return errorResponse as NextResponse;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Required field presence ───────────────────────────────────────────────
  const required = [
    "contractorId",
    "amountUsdc",
    "workPeriodStart",
    "workPeriodEnd",
    "lineItems",
  ];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 400 }
      );
    }
  }

  // ── Type checks ───────────────────────────────────────────────────────────
  if (typeof body.contractorId !== "string" || !body.contractorId.trim()) {
    return NextResponse.json(
      { error: "contractorId must be a non-empty string" },
      { status: 400 }
    );
  }

  if (typeof body.amountUsdc !== "number" || body.amountUsdc <= 0) {
    return NextResponse.json(
      { error: "amountUsdc must be a positive number" },
      { status: 400 }
    );
  }

  if (!isIsoDate(body.workPeriodStart)) {
    return NextResponse.json(
      { error: "workPeriodStart must be a valid ISO date string" },
      { status: 400 }
    );
  }

  if (!isIsoDate(body.workPeriodEnd)) {
    return NextResponse.json(
      { error: "workPeriodEnd must be a valid ISO date string" },
      { status: 400 }
    );
  }

  if (new Date(body.workPeriodEnd) < new Date(body.workPeriodStart)) {
    return NextResponse.json(
      { error: "workPeriodEnd must be on or after workPeriodStart" },
      { status: 400 }
    );
  }

  // ── Line items ────────────────────────────────────────────────────────────
  let lineItems: LineItem[];
  try {
    lineItems = validateLineItems(body.lineItems);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid lineItems" },
      { status: 400 }
    );
  }

  // ── Cross-check: amountUsdc must equal sum of lineItems (±0.01 tolerance) ─
  const computedTotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  if (Math.abs(computedTotal - (body.amountUsdc as number)) > 0.01) {
    return NextResponse.json(
      {
        error: `amountUsdc (${body.amountUsdc}) does not match the sum of lineItems (${computedTotal.toFixed(2)}). Please ensure the total is correct.`,
      },
      { status: 400 }
    );
  }

  // ── Contractor scope enforcement ─────────────────────────────────────────
  // A contractor can only submit invoices for themselves.
  if (
    caller.role === "contractor" &&
    caller.contractorId !== body.contractorId
  ) {
    return NextResponse.json(
      { error: "Contractors may only submit invoices for their own account" },
      { status: 403 }
    );
  }

  const input: CreateInvoiceInput = {
    contractorId: body.contractorId as string,
    companyId: caller.companyId,
    amountUsdc: body.amountUsdc as number,
    workPeriodStart: body.workPeriodStart as string,
    workPeriodEnd: body.workPeriodEnd as string,
    lineItems,
    currency: (body.currency as string | undefined) ?? "USDC",
    notes: body.notes as string | undefined,
  };

  try {
    const invoice = await createInvoice(input);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── GET /api/invoices ────────────────────────────────────────────────────────

/**
 * List invoices with optional filters and pagination.
 *
 * Scoping rules:
 *   - Admin  → sees all invoices for their company; can further filter by
 *              contractorId, status, date range.
 *   - Contractor → always scoped to their own contractorId regardless of
 *                  query params (cannot view other contractors' invoices).
 *
 * Query params:
 *   contractorId  — filter by contractor (admin only; ignored for contractors)
 *   status        — "PENDING" | "APPROVED" | "REJECTED" | "PAID"
 *   fromDate      — ISO date string, inclusive
 *   toDate        — ISO date string, inclusive
 *   page          — page number (default: 1)
 *   pageSize      — results per page (default: 20, max: 100)
 *
 * Response 200:
 * {
 *   invoices: Invoice[],
 *   pagination: { total, page, pageSize, totalPages }
 * }
 */
export async function GET(req: NextRequest) {
  let caller: CallerIdentity;

  try {
    caller = await requireAuth(req);
  } catch (errorResponse) {
    return errorResponse as NextResponse;
  }

  const { searchParams } = new URL(req.url);

  // ── Status filter ─────────────────────────────────────────────────────────
  const statusParam = searchParams.get("status");
  let status: InvoiceStatus | undefined;
  if (statusParam) {
    const validStatuses = Object.values(InvoiceStatus);
    if (!validStatuses.includes(statusParam as InvoiceStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        },
        { status: 400 }
      );
    }
    status = statusParam as InvoiceStatus;
  }

  // ── Date range filters ────────────────────────────────────────────────────
  const fromDateParam = searchParams.get("fromDate");
  const toDateParam = searchParams.get("toDate");

  if (fromDateParam && !isIsoDate(fromDateParam)) {
    return NextResponse.json(
      { error: "fromDate must be a valid ISO date string" },
      { status: 400 }
    );
  }
  if (toDateParam && !isIsoDate(toDateParam)) {
    return NextResponse.json(
      { error: "toDate must be a valid ISO date string" },
      { status: 400 }
    );
  }

  const fromDate = fromDateParam ? new Date(fromDateParam) : undefined;
  const toDate = toDateParam ? new Date(toDateParam) : undefined;

  if (fromDate && toDate && toDate < fromDate) {
    return NextResponse.json(
      { error: "toDate must be on or after fromDate" },
      { status: 400 }
    );
  }

  // ── Contractor filter (admin only) ────────────────────────────────────────
  const contractorIdParam = searchParams.get("contractorId");

  // ── Pagination ────────────────────────────────────────────────────────────
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10))
  );

  // ── Build filter — enforce contractor scope ────────────────────────────────
  const filter = {
    companyId: caller.companyId,
    // Contractors are always locked to their own invoices.
    // Admins can optionally filter by a specific contractorId.
    contractorId:
      caller.role === "contractor"
        ? caller.contractorId
        : (contractorIdParam ?? undefined),
    status,
    fromDate,
    toDate,
    page,
    pageSize,
  };

  try {
    const result = await listInvoices(filter);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}