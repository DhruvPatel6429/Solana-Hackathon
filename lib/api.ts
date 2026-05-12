"use client";

import { getRequiredAuthHeaders, refreshAccessToken } from "@/lib/auth/client";
import type { Contractor } from "@/types/contractor";
import type { Invoice, InvoiceStatus } from "@/types/invoice";
import type { Payout } from "@/types/payout";

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

type AuditQuery = {
  search?: string;
  from?: string;
  to?: string;
  kycStatus?: "Verified" | "Pending" | "Rejected" | "All";
  type?: "payouts" | "treasury" | "invoices" | "webhooks" | "reconciliation";
};

type ApiErrorPayload = {
  error?: string;
  details?: string;
};

type ApiRequestInit = RequestInit & {
  auth?: boolean;
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

function methodRequiresIdempotency(method?: string): boolean {
  const normalized = (method ?? "GET").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(normalized);
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function apiFetchJson<T>(url: string, init?: ApiRequestInit): Promise<T> {
  try {
    const requiresAuth = init?.auth !== false;
    const { auth: _auth, ...requestInit } = init ?? {};
    let authHeaders: HeadersInit = {};
    if (requiresAuth) {
      try {
        authHeaders = await getRequiredAuthHeaders();
      } catch (error) {
        throw new ApiRequestError(
          error instanceof Error ? error.message : "Sign in is required.",
          401,
        );
      }
    }
    const initHeaders = new Headers(init?.headers);
    if (methodRequiresIdempotency(init?.method) && !initHeaders.has("x-idempotency-key") && !initHeaders.has("idempotency-key")) {
      initHeaders.set("x-idempotency-key", idempotencyKey());
    }

    const baseHeaders = {
      "content-type": "application/json",
      ...authHeaders,
      ...Object.fromEntries(initHeaders.entries()),
    };

    let response = await fetch(url, {
      ...requestInit,
      headers: baseHeaders,
    });

    if (response.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        response = await fetch(url, {
          ...requestInit,
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${refreshedToken}`,
            ...Object.fromEntries(initHeaders.entries()),
          },
        });
      }
    }

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

const fetchJson = apiFetchJson;

function buildAuditQuery(params?: AuditQuery): string {
  if (!params) return "";

  const query = new URLSearchParams();
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.kycStatus && params.kycStatus !== "All") query.set("kycStatus", params.kycStatus);
  if (params.type) query.set("type", params.type);

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
  approvedAt?: string | null;
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

type TreasuryBalanceResponse = {
  balance: number;
  wallet?: string;
  source: "solana" | "cache" | "error";
  error?: string;
  updatedAt?: string | null;
};

type CompanyOverviewResponse = {
  company: {
    id: string;
    name: string;
    planTier: string;
    createdAt: string;
    treasuryWalletAddress?: string | null;
    treasuryBalanceUsdc: number;
    treasuryBalanceUpdatedAt?: string | null;
    feeWalletAddress?: string | null;
  };
  billing: {
    customerId?: string | null;
    subscriptionId?: string | null;
    status: string;
    webhookSync: "confirmed" | "stale" | "pending";
    latestEventAt?: string | null;
    latestPaymentId?: string | null;
    recentEvents: Array<{
      id: string;
      dodoPaymentId: string;
      amountUsd: number;
      currency: string;
      status: string;
      createdAt: string;
    }>;
  };
  treasury: {
    walletAddress?: string | null;
    balanceUsdc: number;
    updatedAt?: string | null;
    webhookSync: "confirmed" | "stale" | "pending";
    latestTransactions: Array<{
      id: string;
      signature: string;
      walletAddress: string;
      amountUsdc: number;
      direction: string;
      source?: string | null;
      destination?: string | null;
      createdAt: string;
    }>;
  };
  webhooks: {
    latestEvents: Array<{
      id: string;
      provider: string;
      eventType: string;
      externalId?: string | null;
      processed: boolean;
      processedAt?: string | null;
      createdAt: string;
    }>;
  };
  operations: {
    invoiceCounts: {
      pending: number;
      approved: number;
      rejected: number;
      paid: number;
    };
    payoutCounts: {
      pending: number;
      confirmed: number;
      failed: number;
    };
    activeEscrows: number;
    recentPayouts: Array<{
      id: string;
      invoiceId: string;
      contractorName: string;
      amountUsdc: number;
      escrowPda?: string | null;
      txSignature?: string | null;
      status: string;
      executedAt?: string | null;
      createdAt: string;
    }>;
  };
};

type SignupResponse = {
  success: boolean;
  companyId: string;
};

type ValidationResponse = {
  success: boolean;
  kind: string;
  artifactPath?: string;
  artifact?: unknown;
  error?: string;
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
    approvedAt: row.approvedAt ? formatDate(row.approvedAt) : undefined,
    status: normalizeInvoiceStatus(row.status),
    txHash: payout?.solanaTxSignature ?? payout?.txSignature ?? undefined,
    description: row.description ?? row.notes ?? "",
  };
}

export const api = {
  signup: (body: { companyName?: string; planTier?: string }) =>
    fetchJson<SignupResponse>("/api/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  treasuryBalance: () => fetchJson<TreasuryBalanceResponse>("/api/treasury/balance"),
  contractors: async () => {
    const response = await fetchJson<ContractorsResponse>("/api/contractors");
    return response.contractors.map(normalizeContractor);
  },
  createContractor: (body: {
    name: string;
    email: string;
    country: string;
    taxId: string;
    payoutPreference: "USDC" | "FIAT";
    walletAddress?: string;
    preferredFiatCurrency?: string;
  }) => fetchJson<{ contractor: unknown }>("/api/contractors", { method: "POST", body: JSON.stringify(body) }),
  invoices: async () => {
    const response = await fetchJson<InvoicesResponse>("/api/invoices");
    return response.invoices.map(normalizeInvoice);
  },
  createInvoice: (body: {
    contractorId: string;
    amountUsdc: number;
    workPeriodStart: string;
    workPeriodEnd: string;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
    currency?: "USDC";
    notes?: string;
  }) => fetchJson<{ invoice: unknown }>("/api/invoices", { method: "POST", body: JSON.stringify(body) }),
  approveInvoice: (id: string) =>
    fetchJson<{ success: boolean; txHash?: string; txSignature?: string }>(`/api/invoices/${id}/approve`, {
      method: "PATCH",
      body: JSON.stringify({ settle: false }),
    }),
  rejectInvoice: (id: string, reason: string) =>
    fetchJson<{ success?: boolean; invoice?: unknown }>(`/api/invoices/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) }),
  executePayouts: (invoiceIds: string[]) =>
    fetchJson<BatchPayoutResponse>("/api/payouts/batch", {
      method: "POST",
      body: JSON.stringify({ invoiceIds }),
    }),
  escrowStatus: (invoiceId: string) =>
    fetchJson<{ success: boolean; escrow: unknown }>(`/api/escrow/${invoiceId}`),
  payouts: (params?: AuditQuery) => fetchJson<Payout[]>(`/api/payouts${buildAuditQuery(params)}`),
  exportAudit: (params?: AuditQuery) => fetchJson<Payout[]>(`/api/audit/export${buildAuditQuery(params)}`),
  downloadAuditCsv: async (params?: AuditQuery) => {
    const url = `/api/audit/export?format=csv${buildAuditQuery(params).replace(/^\?/, "&")}`;
    const filename = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;

    try {
      const authHeaders = await getRequiredAuthHeaders();
      const response = await fetch(url, {
        headers: {
          ...authHeaders,
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
    const response = await fetchJson<{
      base: string;
      rates: Array<{ pair: string; rate: number; updatedAt: string }>;
    }>("/api/fx/rates");
    await api.reportUsage("fx_quote", "fx-refresh").catch(() => undefined);
    await wait();
    return response.rates.map((rate) => ({
      pair: rate.pair,
      rate: rate.rate.toFixed(3),
      updatedAt: rate.updatedAt,
    }));
  },
  reportUsage: (eventType: "invoice" | "payout" | "fx_quote" = "payout", referenceId?: string) =>
    fetchJson<void>("/api/billing/report-usage", { method: "POST", body: JSON.stringify({ eventType, referenceId }) }),
  companyOverview: () => fetchJson<CompanyOverviewResponse>("/api/admin/company-overview"),
  systemHealth: () => fetchJson<any>("/api/admin/system-health"),
  systemMetrics: () => fetchJson<any>("/api/admin/metrics"),
  reconciliationReport: () => fetchJson<any>("/api/admin/reconciliation-report"),
  recoverPayouts: () => fetchJson<any>("/api/admin/recovery/payouts", { method: "POST", body: JSON.stringify({}) }),
  replayWebhooks: () => fetchJson<any>("/api/admin/recovery/webhooks", { method: "POST", body: JSON.stringify({}) }),
  runValidation: (kind: "validate-anchor" | "live-payroll" | "batch" | "split" | "dodo" | "helius") =>
    fetchJson<ValidationResponse>(`/api/admin/validation/${kind}`, { method: "POST", body: JSON.stringify({}) }),
};
