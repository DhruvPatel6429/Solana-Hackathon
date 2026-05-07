import { contractors, fxRates, invoices, payouts, treasury, type Contractor, type Invoice, type Payout } from "./mock-data";

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

async function fallback<T>(value: T): Promise<T> {
  await wait();
  return structuredClone(value);
}

async function fetchJson<T>(url: string, init?: RequestInit, mock?: T): Promise<T> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return (await response.json()) as T;
  } catch {
    if (mock !== undefined) return fallback(mock);
    throw new Error("Network request failed");
  }
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
  exportAudit: () => fetchJson<Payout[]>("/api/audit/export", undefined, payouts),
  reportUsage: () => fetchJson<void>("/api/billing/report-usage", { method: "POST" }, undefined),
  checkout: (tier: string) =>
    fetchJson<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ tier }) }, { url: `/onboarding?checkout=${tier}` }),
  fxRates: () => fallback(fxRates.map((rate) => ({ ...rate, refreshedAt: new Date().toLocaleTimeString() }))),
};
