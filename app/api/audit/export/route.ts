import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { buildPayoutCsv } from "@/lib/audit/csv";
import { listPayoutsByCompany, type PayoutListFilters } from "@/lib/db/queries/payouts";
import { logAuditExported } from "@/lib/services/audit.service";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContext(request);
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "json").toLowerCase();

    const filters: PayoutListFilters = {
      search: url.searchParams.get("search") ?? undefined,
      from: parseDate(url.searchParams.get("from")),
      to: parseDate(url.searchParams.get("to")),
      kycStatus:
        (url.searchParams.get("kycStatus") as PayoutListFilters["kycStatus"]) ??
        undefined,
    };

    const rows = await listPayoutsByCompany(tenant.companyId, filters);

    await logAuditExported({
      companyId: tenant.companyId,
      actorUserId: tenant.userId,
      metadata: {
        format,
        rowCount: rows.length,
        filters: {
          search: filters.search ?? null,
          from: filters.from?.toISOString() ?? null,
          to: filters.to?.toISOString() ?? null,
          kycStatus: filters.kycStatus ?? null,
        },
      },
    }).catch(() => undefined);

    if (format === "csv") {
      const csv = buildPayoutCsv(rows);
      const today = new Date().toISOString().slice(0, 10);
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename=\"audit-export-${today}.csv\"`,
        },
      });
    }

    return Response.json(rows);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
