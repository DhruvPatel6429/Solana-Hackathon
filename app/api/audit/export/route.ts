import { payouts } from "@/lib/mock-data";

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

function parseFilters(request: Request): PayoutListFilters & { format: string } {
  const url = new URL(request.url);
  return {
    format: (url.searchParams.get("format") ?? "json").toLowerCase(),
    search: url.searchParams.get("search") ?? undefined,
    from: parseDate(url.searchParams.get("from")),
    to: parseDate(url.searchParams.get("to")),
    kycStatus: (url.searchParams.get("kycStatus") as PayoutListFilters["kycStatus"]) ?? undefined,
  };
}

function buildCsv(rows: typeof payouts) {
  return [
    "id,contractor,amount,currency,date,invoiceId,txHash,kycStatus",
    ...rows.map((row) => [row.id, row.contractor, row.amount.toFixed(2), row.currency, row.date, row.invoiceId, row.txHash, row.kycStatus].join(",")),
  ].join("\n");
}

export async function GET(request: Request) {
  const filters = parseFilters(request);

  if (!process.env.DATABASE_URL || !request.headers.get("authorization")) {
    const query = filters.search?.trim().toLowerCase();
    const rows = payouts.filter((payout) => {
      if (filters.kycStatus && payout.kycStatus !== filters.kycStatus) return false;
      if (query && !`${payout.contractor} ${payout.invoiceId} ${payout.txHash}`.toLowerCase().includes(query)) return false;
      return true;
    });

    if (filters.format === "csv") {
      const today = new Date().toISOString().slice(0, 10);
      return new Response(buildCsv(rows), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename=\"audit-export-${today}.csv\"`,
        },
      });
    }

    return Response.json(rows);
  }

  try {
    const { requireTenantContext } = await import("@/lib/auth/server");
    const { listPayoutsByCompany } = await import("@/lib/db/queries/payouts");
    const { buildPayoutCsv } = await import("@/lib/audit/csv");
    const { logAuditExported } = await import("@/lib/services/audit.service");
    const tenant = await requireTenantContext(request);
    const rows = await listPayoutsByCompany(tenant.companyId, filters);

    await logAuditExported({
      companyId: tenant.companyId,
      actorUserId: tenant.userId,
      metadata: {
        format: filters.format,
        rowCount: rows.length,
        filters: {
          search: filters.search ?? null,
          from: filters.from?.toISOString() ?? null,
          to: filters.to?.toISOString() ?? null,
          kycStatus: filters.kycStatus ?? null,
        },
      },
    }).catch(() => undefined);

    if (filters.format === "csv") {
      const today = new Date().toISOString().slice(0, 10);
      return new Response(buildPayoutCsv(rows), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename=\"audit-export-${today}.csv\"`,
        },
      });
    }

    return Response.json(rows);
  } catch (error) {
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    return toHttpErrorResponse(error);
  }
}
