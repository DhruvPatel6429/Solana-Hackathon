"use client";

/**
 * app/(contractor)/page.tsx
 *
 * Member 2 — Contractor Portal
 *
 * The contractor's home screen. Shows:
 *   - Profile summary (name, country, KYC badge, payout preference, wallet)
 *   - Payment stats (total earned, pending, paid invoice counts)
 *   - Invoice list with status badges, amounts, and on-chain tx links
 *   - Quick actions: Submit Invoice, Update Settings
 *
 * All data is fetched from the real API routes built in steps 3–8.
 * Uses Supabase client-side auth for the JWT token.
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contractor {
  id: string;
  name: string;
  email: string;
  country: string;
  payoutPreference: "USDC" | "FIAT";
  walletAddress: string | null;
  preferredFiatCurrency: string | null;
  kycStatus: "PENDING" | "VERIFIED" | "REJECTED";
  createdAt: string;
}

interface Invoice {
  id: string;
  amountUsdc: any; // Prisma Decimal type, convert with .toNumber()
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID";
  submittedAt: string;
  approvedAt: string | null;
  rejectionReason: string | null;
  payouts: Array<{
    id: string;
    solanaTxSignature: string | null;
    status: string;
  }>;
}

interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOLANA_EXPLORER = "https://explorer.solana.com/tx";
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";

const STATUS_CONFIG = {
  PENDING:  { label: "Pending",  bg: "bg-amber-500/15",  text: "text-amber-400",  dot: "bg-amber-400"  },
  APPROVED: { label: "Approved", bg: "bg-blue-500/15",   text: "text-blue-400",   dot: "bg-blue-400"   },
  PAID:     { label: "Paid",     bg: "bg-emerald-500/15",text: "text-emerald-400",dot: "bg-emerald-400" },
  REJECTED: { label: "Rejected", bg: "bg-rose-500/15",   text: "text-rose-400",   dot: "bg-rose-400"   },
} as const;

const KYC_CONFIG = {
  PENDING:  { label: "KYC Pending",  bg: "bg-amber-500/15",  text: "text-amber-400"  },
  VERIFIED: { label: "KYC Verified", bg: "bg-emerald-500/15",text: "text-emerald-400" },
  REJECTED: { label: "KYC Rejected", bg: "bg-rose-500/15",   text: "text-rose-400"   },
} as const;

// ─── Supabase client ──────────────────────────────────────────────────────────

function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatUsdc(amount: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function shortId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function KycBadge({ status }: { status: keyof typeof KYC_CONFIG }) {
  const cfg = KYC_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="relative bg-[#0f1117] border border-[#1e2130] rounded-2xl p-5 overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent ?? "bg-[#1e2130]"}`} />
      <p className="text-xs font-medium text-[#6b7280] uppercase tracking-widest mb-3">{label}</p>
      <p className="text-3xl font-bold text-white font-mono">{value}</p>
      {sub && <p className="text-xs text-[#6b7280] mt-1.5">{sub}</p>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#0f1117] border border-[#1e2130] flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-[#374151]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p className="text-[#6b7280] text-sm">{message}</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContractorPortalPage() {
  const [token, setToken]               = useState<string | null>(null);
  const [contractor, setContractor]     = useState<Contractor | null>(null);
  const [invoices, setInvoices]         = useState<Invoice[]>([]);
  const [pagination, setPagination]     = useState<Pagination | null>(null);
  const [page, setPage]                 = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [loading, setLoading]           = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // ── Auth: get session token ───────────────────────────────────────────────
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase environment variables are not configured.");
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
      } else {
        setError("Not authenticated. Please sign in.");
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Fetch contractor profile ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const meta = JSON.parse(atob(token.split(".")[1]));
    const contractorId = meta?.user_metadata?.contractorId as string | undefined;

    if (!contractorId) {
      setError("No contractor profile linked to this account.");
      setLoading(false);
      return;
    }

    fetch(`/api/contractors/${contractorId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setContractor(data.contractor);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // ── Fetch invoices ────────────────────────────────────────────────────────
  const fetchInvoices = useCallback(() => {
    if (!token) return;

    setInvoicesLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10",
      ...(statusFilter !== "ALL" && { status: statusFilter }),
    });

    fetch(`/api/invoices?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setInvoices(data.invoices);
        setPagination(data.pagination);
      })
      .catch((e) => setError(e.message))
      .finally(() => setInvoicesLoading(false));
  }, [token, page, statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalEarned  = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + (typeof i.amountUsdc === 'number' ? i.amountUsdc : i.amountUsdc.toNumber()), 0);
  const totalPending = invoices.filter((i) => i.status === "PENDING").reduce((s, i) => s + (typeof i.amountUsdc === 'number' ? i.amountUsdc : i.amountUsdc.toNumber()), 0);
  const paidCount    = invoices.filter((i) => i.status === "PAID").length;
  const pendingCount = invoices.filter((i) => i.status === "PENDING").length;

  // ── Render states ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#080b12] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#1e2130] border-t-[#6366f1] rounded-full animate-spin" />
          <p className="text-[#6b7280] text-sm font-mono">Loading portal…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#080b12] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#0f1117] border border-rose-500/20 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-2">Something went wrong</p>
          <p className="text-[#6b7280] text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080b12] text-white">
      {/* ── Subtle grid background ── */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-[#6b7280] uppercase tracking-widest">
                Contractor Portal
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {contractor
                ? `Welcome back, ${contractor.name.split(" ")[0]}`
                : "Your Portal"}
            </h1>
          </div>

          <Link
            href="/contractor/invoices/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#6366f1] hover:bg-[#4f52d1] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Invoice
          </Link>
        </div>

        {/* ── Profile card ────────────────────────────────────────────────── */}
        {contractor && (
          <div className="bg-[#0f1117] border border-[#1e2130] rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Avatar */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-xl font-bold shrink-0">
                {contractor.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold">{contractor.name}</h2>
                  <KycBadge status={contractor.kycStatus} />
                </div>
                <p className="text-[#6b7280] text-sm truncate">{contractor.email}</p>
                <p className="text-[#6b7280] text-sm">{contractor.country}</p>
              </div>

              {/* Payout preference */}
              <div className="shrink-0 text-right">
                <p className="text-xs text-[#6b7280] uppercase tracking-widest mb-1">
                  Payout via
                </p>
                {contractor.payoutPreference === "USDC" ? (
                  <div>
                    <p className="text-sm font-semibold text-[#6366f1]">USDC · Solana</p>
                    {contractor.walletAddress && (
                      <p className="text-xs text-[#6b7280] font-mono mt-0.5">
                        {contractor.walletAddress.slice(0, 4)}…
                        {contractor.walletAddress.slice(-4)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[#6b7280]">
                    Fiat · {contractor.preferredFiatCurrency ?? "—"}
                  </p>
                )}
              </div>

              {/* Settings link */}
              <Link
                href="/contractor/settings"
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 border border-[#1e2130] hover:border-[#374151] text-[#9ca3af] hover:text-white text-xs font-medium rounded-xl transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </Link>
            </div>
          </div>
        )}

        {/* ── Stats row ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Total Earned"
            value={`$${formatUsdc(totalEarned)}`}
            sub={`${paidCount} invoice${paidCount !== 1 ? "s" : ""} paid`}
            accent="bg-gradient-to-r from-emerald-500 to-teal-500"
          />
          <StatCard
            label="Pending"
            value={`$${formatUsdc(totalPending)}`}
            sub={`${pendingCount} awaiting approval`}
            accent="bg-amber-500"
          />
          <StatCard
            label="Total Invoices"
            value={String(pagination?.total ?? invoices.length)}
            sub="all time"
            accent="bg-[#6366f1]"
          />
          <StatCard
            label="Member Since"
            value={contractor ? new Date(contractor.createdAt).getFullYear().toString() : "—"}
            sub={contractor ? formatDate(contractor.createdAt) : ""}
            accent="bg-[#1e2130]"
          />
        </div>

        {/* ── Invoice list ─────────────────────────────────────────────────── */}
        <div className="bg-[#0f1117] border border-[#1e2130] rounded-2xl overflow-hidden">

          {/* Table header + filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-[#1e2130]">
            <h3 className="text-sm font-semibold text-white">Invoice History</h3>
            <div className="flex items-center gap-2">
              {(["ALL", "PENDING", "APPROVED", "PAID", "REJECTED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-[#6366f1] text-white"
                      : "text-[#6b7280] hover:text-white hover:bg-[#1e2130]"
                  }`}
                >
                  {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {invoicesLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-[#1e2130] border-t-[#6366f1] rounded-full animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <EmptyState
              message={
                statusFilter === "ALL"
                  ? "No invoices yet. Submit your first invoice to get started."
                  : `No ${STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG]?.label.toLowerCase()} invoices.`
              }
            />
          ) : (
            <div className="divide-y divide-[#1e2130]">
              {invoices.map((invoice) => {
                const txSig = invoice.payouts[0]?.solanaTxSignature ?? null;

                return (
                  <div
                    key={invoice.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4 hover:bg-[#080b12]/60 transition-colors group"
                  >
                    {/* ID + date */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-mono font-semibold text-white">
                          {shortId(invoice.id)}
                        </span>
                        <StatusBadge status={invoice.status} />
                      </div>
                      <p className="text-xs text-[#6b7280]">
                        Submitted {formatDate(invoice.submittedAt)}
                        {invoice.approvedAt && ` · Approved ${formatDate(invoice.approvedAt)}`}
                      </p>

                      {/* Rejection reason */}
                      {invoice.status === "REJECTED" && invoice.rejectionReason && (
                        <p className="text-xs text-rose-400 mt-1 flex items-start gap-1">
                          <svg className="w-3 h-3 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {invoice.rejectionReason}
                        </p>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold font-mono text-white">
                        ${formatUsdc(invoice.amountUsdc)}
                        <span className="text-xs font-normal text-[#6b7280] ml-1">USDC</span>
                      </p>

                      {/* On-chain tx link */}
                      {txSig && (
                        <a
                          href={`${SOLANA_EXPLORER}/${txSig}?cluster=${NETWORK}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[#6366f1] hover:text-[#818cf8] transition-colors mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View on Explorer
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#1e2130]">
              <p className="text-xs text-[#6b7280]">
                Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, pagination.total)} of {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-medium border border-[#1e2130] rounded-lg text-[#9ca3af] hover:text-white hover:border-[#374151] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-[#6b7280] font-mono">
                  {page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="px-3 py-1.5 text-xs font-medium border border-[#1e2130] rounded-lg text-[#9ca3af] hover:text-white hover:border-[#374151] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
