import { fxRates } from "./mock-data";
import type { Contractor } from "@/types/contractor";
import type { Invoice, InvoiceStatus } from "@/types/invoice";
import type { Payout } from "@/types/payout";

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

type AuditQuery = {
  search?: string;
  from?: string;
  to?: string;
  kycStatus?: "Verified" | "Pending" | "Rejected" | "All";
};

type ApiErrorPayload = {
  error?: string;
  details?: string;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...getAuthHeaders(),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
      throw new ApiRequestError(
        payload.error ?? `Request failed with status ${response.status}`,
        response.status,
        payload.details,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }

    throw new ApiRequestError(
      error instanceof Error ? error.message : "Network request failed",
    );
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

type ApiContractor = {
  id: string;
  name: string;
  country?: string | null;
  payoutPreference?: string | null;
  kycStatus?: string | null;
  status?: string | null;
  invoices?: Array<{ approvedAt?: string | null; amountUsdc?: unknown }>;
};

type ContractorsResponse = {
  contractors: ApiContractor[];
  pagination?: unknown;
};

type ApiInvoice = {
  id: string;
  contractorId: string;
  amountUsdc: unknown;
  status: string;
  submittedAt: string;
  description?: string | null;
  notes?: string | null;
  contractor?: { id?: string; name?: string | null; country?: string | null };
  payouts?: Array<{
    solanaTxSignature?: string | null;
    txSignature?: string | null;
    status?: string | null;
  }>;
};

type InvoicesResponse = {
  invoices: ApiInvoice[];
  pagination?: unknown;
};

type BatchPayoutResponse = {
  success: boolean;
  txHash: string;
  txSignature: string;
  payoutIds?: string[];
};

function normalizeKycStatus(value?: string | null): Contractor["kycStatus"] {
  const normalized = (value ?? "PENDING").toUpperCase();
  if (normalized === "VERIFIED") return "Verified";
  if (normalized === "REJECTED") return "Rejected";
  return "Pending";
}

function normalizeContractorStatus(value?: string | null): Contractor["status"] {
  if (value === "Invited" || value === "Paused" || value === "Active") {
    return value;
  }
  return "Active";
}

function normalizeInvoiceStatus(value: string): InvoiceStatus {
  const normalized = value.toUpperCase();
  if (normalized === "APPROVED") return "Approved";
  if (normalized === "REJECTED") return "Rejected";
  if (normalized === "PAID") return "Paid";
  return "Pending";
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number(String(value));
  }
  return 0;
}

function formatDate(value?: string | Date | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toISOString().slice(0, 10);
}

function countryCode(country?: string | null): string {
  return (country ?? "--").slice(0, 2).toUpperCase();
}

function normalizeContractor(row: ApiContractor): Contractor {
  const lastPaid = row.invoices?.[0]?.approvedAt ?? null;
  return {
    id: row.id,
    name: row.name,
    country: row.country ?? "-",
    flag: countryCode(row.country),
    payoutPreference: row.payoutPreference === "FIAT" ? "FIAT" : "USDC",
    kycStatus: normalizeKycStatus(row.kycStatus),
    lastPaid: formatDate(lastPaid),
    status: normalizeContractorStatus(row.status),
  };
}

function normalizeInvoice(row: ApiInvoice): Invoice {
  const payout = row.payouts?.find((candidate) => candidate.solanaTxSignature ?? candidate.txSignature);
  return {
    id: row.id,
    contractorId: row.contractorId,
    contractor: row.contractor?.name ?? row.contractorId,
    amount: toNumber(row.amountUsdc),
    currency: "USDC",
    submittedAt: formatDate(row.submittedAt),
    status: normalizeInvoiceStatus(row.status),
    txHash: payout?.solanaTxSignature ?? payout?.txSignature ?? undefined,
    description: row.description ?? row.notes ?? "",
  };
}

export const api = {
  treasuryBalance: () => fetchJson<{ balance: number; wallet?: string; source: "solana" | "cache" | "error"; error?: string }>("/api/treasury/balance"),
  contractors: async () => {
    const response = await fetchJson<ContractorsResponse>("/api/contractors");
    return response.contractors.map(normalizeContractor);
  },
  invoices: async () => {
    const response = await fetchJson<InvoicesResponse>("/api/invoices");
    return response.invoices.map(normalizeInvoice);
  },
  approveInvoice: (id: string) =>
    fetchJson<{ success: boolean; txHash: string; txSignature?: string }>(`/api/invoices/${id}/approve`, { method: "PATCH" }),
  rejectInvoice: (id: string, reason: string) =>
    fetchJson<{ success?: boolean; invoice?: unknown }>(`/api/invoices/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) }),
  executePayouts: (invoiceIds: string[]) =>
    fetchJson<BatchPayoutResponse>("/api/payouts/batch", {
      method: "POST",
      body: JSON.stringify({ invoiceIds }),
    }),
  payouts: (params?: AuditQuery) => fetchJson<Payout[]>(`/api/payouts${buildAuditQuery(params)}`),
  exportAudit: (params?: AuditQuery) => fetchJson<Payout[]>(`/api/audit/export${buildAuditQuery(params)}`),
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
    } catch (error) {
      throw error instanceof Error ? error : new Error("Audit CSV download failed");
    }
  },
  checkout: (tier: string) =>
    fetchJson<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ tier }) }),
  fxRates: async () => {
    await api.reportUsage("fx_quote", "fx-refresh");
    await wait();
    return fxRates.map((rate) => ({ ...rate, refreshedAt: new Date().toLocaleTimeString() }));
  },
  reportUsage: (eventType: "invoice" | "payout" | "fx_quote" = "payout", referenceId?: string) =>
    fetchJson<void>("/api/billing/report-usage", { method: "POST", body: JSON.stringify({ eventType, referenceId }) }),
};
