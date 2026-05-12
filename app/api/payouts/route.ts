import { NextResponse } from "next/server";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listPayoutsByCompany } from "@/lib/db/queries/payouts";

type PayoutListFilters = {
  search?: string;
  from?: Date;
  to?: Date;
  kycStatus?: "Verified" | "Pending" | "Rejected";
};

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseFilters(request: Request): PayoutListFilters {
  const url = new URL(request.url);
  return {
    search: url.searchParams.get("search") ?? undefined,
    from: parseDate(url.searchParams.get("from")),
    to: parseDate(url.searchParams.get("to")),
    kycStatus: (url.searchParams.get("kycStatus") as PayoutListFilters["kycStatus"]) ?? undefined,
  };
}

export async function GET(request: Request) {
  const filters = parseFilters(request);

  try {
    const tenant = await requireAdmin(request);
    const rows = await listPayoutsByCompany(tenant.companyId, filters);
    return NextResponse.json(rows);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
