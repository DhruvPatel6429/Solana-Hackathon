import { contractors, fxRates, invoices, payouts, treasury, type Contractor, type Invoice, type Payout } from "./mock-data";

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

type AuditQuery = {
  search?: string;
  from?: string;
  to?: string;
  kycStatus?: "Verified" | "Pending" | "Rejected" | "All";
};

async function fallback<T>(value: T): Promise<T> {
  await wait();
  return structuredClone(value);
}

function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {};
  }

  const localToken = window.localStorage.getItem("bp_access_token");
  const sessionToken = window.sessionStorage.getItem("bp_access_token");
  const token = localToken || sessionToken;

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit, mock?: T): Promise<T> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...getAuthHeaders(),
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return (await response.json()) as T;
  } catch {
    if (mock !== undefined) return fallback(mock);
    throw new Error("Network request failed");
  }
}

function buildAuditQuery(params?: AuditQuery): string {
  if (!params) return "";

  const query = new URLSearchParams();
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.kycStatus && params.kycStatus !== "All") query.set("kycStatus", params.kycStatus);

  const value = query.toString();
  return value ? `?${value}` : "";
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

export const api = {
  treasuryBalance: () => fetchJson<{ balance: number; wallet: string }>("/api/treasury/balance", undefined, treasury),
  contractors: () => fetchJson<Contractor[]>("/api/contractors", undefined, contractors),
  invoices: () => fetchJson<Invoice[]>("/api/invoices", undefined, invoices),
  approveInvoice: (id: string) =>
    fetchJson<{ success: boolean; txHash: string }>(`/api/invoices/${id}/approve`, { method: "PATCH" }, { success: true, txHash: payouts[0].txHash }),
  rejectInvoice: (id: string, reason: string) =>
    fetchJson<{ success: boolean }>(`/api/invoices/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) }, { success: true }),
  executePayouts: () => fetchJson<{ txSignature: string }>("/api/payouts/execute", { method: "POST" }, { txSignature: "5J7mV8fYbLr1pU35Hk3wPHajYxXbhJ8QX7WdUkbMc3mQ" }),
<<<<<<< HEAD
  payouts: (params?: AuditQuery) => fetchJson<Payout[]>(`/api/payouts${buildAuditQuery(params)}`, undefined, payouts),
  exportAudit: (params?: AuditQuery) => fetchJson<Payout[]>(`/api/audit/export${buildAuditQuery(params)}`, undefined, payouts),
  downloadAuditCsv: async (params?: AuditQuery) => {
    const url = `/api/audit/export?format=csv${buildAuditQuery(params).replace(/^\?/, "&")}`;
    const filename = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;

    try {
      const response = await fetch(url, {
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const content = await response.text();
      downloadTextFile(filename, content, "text/csv; charset=utf-8");
      return;
    } catch {
      const rows = await fallback(payouts);
      const csv = [
        "id,contractor,amount,currency,date,invoiceId,txHash,kycStatus",
        ...rows.map((row) =>
          [
            row.id,
            row.contractor,
            row.amount.toFixed(2),
            row.currency,
            row.date,
            row.invoiceId,
            row.txHash,
            row.kycStatus,
          ].join(","),
        ),
      ].join("\n");

      downloadTextFile(filename, csv, "text/csv; charset=utf-8");
    }
  },
  reportUsage: () => fetchJson<void>("/api/billing/report-usage", { method: "POST" }, undefined),
=======
  exportAudit: () => fetchJson<Payout[]>("/api/audit/export", undefined, payouts),
>>>>>>> e07b30c (Member-1 updated)
  checkout: (tier: string) =>
    fetchJson<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ tier, companyId: "company_demo_01" }) }, { url: `/onboarding?checkout=${tier}` }),
  fxRates: async () => {
    await api.reportUsage("fx_quote", "fx-refresh");
    return fallback(fxRates.map((rate) => ({ ...rate, refreshedAt: new Date().toLocaleTimeString() })));
  },
  reportUsage: (eventType: "invoice" | "payout" | "fx_quote" = "payout", referenceId?: string) =>
    fetchJson<void>("/api/billing/report-usage", { method: "POST", body: JSON.stringify({ eventType, referenceId, companyId: "company_demo_01" }) }, undefined),
};
