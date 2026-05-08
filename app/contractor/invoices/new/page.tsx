"use client";

/**
 * app/(contractor)/invoices/new/page.tsx
 *
 * Member 2 — Contractor Portal
 *
 * Invoice submission form. Contractor fills in:
 *   - Work period (start → end dates)
 *   - Line items (description, quantity, unit price) — add / remove rows
 *   - Notes (optional)
 *
 * amountUsdc is computed live from line items and sent to the API — this
 * mirrors the server-side cross-check (±0.01 tolerance) and prevents
 * mismatch errors before the request even leaves the browser.
 *
 * On success: redirects to /contractor with a ?submitted=1 flag so the
 * portal page can show a success toast.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string; // client-only key for React reconciliation
  description: string;
  quantity: string; // kept as string while editing; parsed on submit
  unitPrice: string;
}

interface FieldErrors {
  workPeriodStart?: string;
  workPeriodEnd?: string;
  lineItems?: string;
  [key: `line_${number}_description`]: string | undefined;
  [key: `line_${number}_quantity`]: string | undefined;
  [key: `line_${number}_unitPrice`]: string | undefined;
  notes?: string;
  form?: string;
}

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

function newLineItem(): LineItem {
  return { id: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "" };
}

function parseNumber(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function formatUsdc(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-[#9ca3af] uppercase tracking-widest mb-1.5">
      {children}
      {required && <span className="text-rose-400 ml-1">*</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="mt-1.5 text-xs text-rose-400 flex items-center gap-1">
      <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      {msg}
    </p>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  min,
  step,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  min?: string;
  step?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      step={step}
      className={`w-full bg-[#080b12] border ${
        error ? "border-rose-500/60" : "border-[#1e2130] focus:border-[#6366f1]"
      } rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#374151] outline-none transition-colors ${className}`}
    />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewInvoicePage() {
  const router = useRouter();

  // ── Auth state ──────────────────────────────────────────────────────────
  const [token, setToken]               = useState<string | null>(null);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [authError, setAuthError]       = useState<string | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────
  const [workPeriodStart, setWorkPeriodStart] = useState(firstOfMonth());
  const [workPeriodEnd, setWorkPeriodEnd]     = useState(today());
  const [lineItems, setLineItems]             = useState<LineItem[]>([newLineItem()]);
  const [notes, setNotes]                     = useState("");
  const [errors, setErrors]                   = useState<FieldErrors>({});
  const [submitting, setSubmitting]           = useState(false);
  const [submitted, setSubmitted]             = useState(false);

  // ── Computed total ──────────────────────────────────────────────────────
  const computedTotal = lineItems.reduce(
    (sum, item) => sum + parseNumber(item.quantity) * parseNumber(item.unitPrice),
    0
  );

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setAuthError("Supabase environment variables are not configured.");
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) {
        setAuthError("Not authenticated. Please sign in.");
        return;
      }
      setToken(session.access_token);

      // Decode contractorId from JWT user_metadata
      try {
        const payload = JSON.parse(atob(session.access_token.split(".")[1]));
        const cid = payload?.user_metadata?.contractorId as string | undefined;
        if (!cid) {
          setAuthError("No contractor profile linked to this account.");
        } else {
          setContractorId(cid);
        }
      } catch {
        setAuthError("Failed to decode session.");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Line item helpers ───────────────────────────────────────────────────
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, newLineItem()]);
  }, []);

  const removeLineItem = useCallback((id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateLineItem = useCallback(
    (id: string, field: keyof Omit<LineItem, "id">, value: string) => {
      setLineItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
      );
    },
    []
  );

  // ── Validation ──────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: FieldErrors = {};

    if (!workPeriodStart) errs.workPeriodStart = "Start date is required";
    if (!workPeriodEnd)   errs.workPeriodEnd   = "End date is required";
    if (workPeriodStart && workPeriodEnd && workPeriodEnd < workPeriodStart) {
      errs.workPeriodEnd = "End date must be on or after start date";
    }

    if (lineItems.length === 0) {
      errs.lineItems = "Add at least one line item";
    }

    lineItems.forEach((item, i) => {
      if (!item.description.trim()) {
        errs[`line_${i}_description`] = "Description is required";
      }
      const qty = parseNumber(item.quantity);
      if (!item.quantity || qty <= 0) {
        errs[`line_${i}_quantity`] = "Must be greater than 0";
      }
      const price = parseNumber(item.unitPrice);
      if (!item.unitPrice || price < 0) {
        errs[`line_${i}_unitPrice`] = "Must be 0 or greater";
      }
    });

    if (computedTotal <= 0) {
      errs.lineItems = "Invoice total must be greater than $0.00";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!token || !contractorId) {
      setErrors({ form: "Authentication required. Please refresh and sign in." });
      return;
    }

    setSubmitting(true);
    setErrors({});

    const payload = {
      contractorId,
      amountUsdc: parseFloat(computedTotal.toFixed(2)),
      workPeriodStart,
      workPeriodEnd,
      lineItems: lineItems.map((item) => ({
        description: item.description.trim(),
        quantity: parseNumber(item.quantity),
        unitPrice: parseNumber(item.unitPrice),
      })),
      currency: "USDC",
      notes: notes.trim() || undefined,
    };

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ form: data.error ?? "Submission failed. Please try again." });
        return;
      }

      setSubmitted(true);
      // Brief pause so the success state is visible, then redirect
      setTimeout(() => router.push("/contractor?submitted=1"), 1200);
    } catch (err) {
      setErrors({
        form: err instanceof Error ? err.message : "Network error. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Auth error screen ───────────────────────────────────────────────────
  if (authError) {
    return (
      <div className="min-h-screen bg-[#080b12] flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-[#0f1117] border border-rose-500/20 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-2">Access Denied</p>
          <p className="text-[#6b7280] text-sm">{authError}</p>
        </div>
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#080b12] flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-[#0f1117] border border-emerald-500/20 rounded-2xl p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Invoice Submitted</h2>
          <p className="text-[#6b7280] text-sm mb-1">
            Total: <span className="text-white font-mono font-semibold">${formatUsdc(computedTotal)} USDC</span>
          </p>
          <p className="text-[#6b7280] text-sm">Redirecting to your portal…</p>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080b12] text-white">
      {/* Subtle grid */}
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

      <div className="relative max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-[#1e2130] hover:border-[#374151] text-[#9ca3af] hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-mono text-[#6b7280] uppercase tracking-widest">
                New Invoice
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Submit for Approval</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">

          {/* ── Work period ─────────────────────────────────────────────── */}
          <div className="bg-[#0f1117] border border-[#1e2130] rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#6366f1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Work Period
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label required>Start Date</Label>
                <Input
                  type="date"
                  value={workPeriodStart}
                  onChange={setWorkPeriodStart}
                  error={errors.workPeriodStart}
                />
                <FieldError msg={errors.workPeriodStart} />
              </div>
              <div>
                <Label required>End Date</Label>
                <Input
                  type="date"
                  value={workPeriodEnd}
                  onChange={setWorkPeriodEnd}
                  min={workPeriodStart}
                  error={errors.workPeriodEnd}
                />
                <FieldError msg={errors.workPeriodEnd} />
              </div>
            </div>
          </div>

          {/* ── Line items ───────────────────────────────────────────────── */}
          <div className="bg-[#0f1117] border border-[#1e2130] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-[#6366f1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Line Items
              </h2>
              <span className="text-xs text-[#6b7280]">{lineItems.length} item{lineItems.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Column labels */}
            <div className="grid grid-cols-12 gap-2 mb-2 px-1">
              <div className="col-span-6">
                <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-widest">Description</span>
              </div>
              <div className="col-span-2 text-center">
                <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-widest">Qty</span>
              </div>
              <div className="col-span-3 text-right">
                <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-widest">Unit Price</span>
              </div>
              <div className="col-span-1" />
            </div>

            {/* Rows */}
            <div className="space-y-3">
              {lineItems.map((item, i) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-start">
                  {/* Description */}
                  <div className="col-span-6">
                    <Input
                      value={item.description}
                      onChange={(v) => updateLineItem(item.id, "description", v)}
                      placeholder="e.g. Frontend development"
                      error={errors[`line_${i}_description`]}
                    />
                    <FieldError msg={errors[`line_${i}_description`]} />
                  </div>

                  {/* Quantity */}
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(v) => updateLineItem(item.id, "quantity", v)}
                      placeholder="1"
                      min="0.01"
                      step="0.01"
                      error={errors[`line_${i}_quantity`]}
                      className="text-center"
                    />
                    <FieldError msg={errors[`line_${i}_quantity`]} />
                  </div>

                  {/* Unit price */}
                  <div className="col-span-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280] text-sm pointer-events-none">$</span>
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updateLineItem(item.id, "unitPrice", e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className={`w-full bg-[#080b12] border ${
                          errors[`line_${i}_unitPrice`]
                            ? "border-rose-500/60"
                            : "border-[#1e2130] focus:border-[#6366f1]"
                        } rounded-xl pl-7 pr-3 py-2.5 text-sm text-white placeholder-[#374151] outline-none transition-colors text-right`}
                      />
                    </div>
                    <FieldError msg={errors[`line_${i}_unitPrice`]} />
                  </div>

                  {/* Row subtotal + remove */}
                  <div className="col-span-1 flex flex-col items-end pt-2.5">
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(item.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6b7280] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Remove line"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Row subtotal hint */}
                  {parseNumber(item.quantity) > 0 && parseNumber(item.unitPrice) > 0 && (
                    <div className="col-span-12 flex justify-end -mt-1 pr-9">
                      <span className="text-xs text-[#6b7280] font-mono">
                        = ${formatUsdc(parseNumber(item.quantity) * parseNumber(item.unitPrice))}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <FieldError msg={errors.lineItems} />

            {/* Add line button */}
            <button
              type="button"
              onClick={addLineItem}
              className="mt-4 flex items-center gap-2 text-xs font-medium text-[#6366f1] hover:text-[#818cf8] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add line item
            </button>

            {/* Running total */}
            <div className="mt-5 pt-5 border-t border-[#1e2130] flex items-center justify-between">
              <span className="text-sm font-semibold text-[#9ca3af]">Invoice Total</span>
              <div className="text-right">
                <span className="text-2xl font-bold font-mono text-white">
                  ${formatUsdc(computedTotal)}
                </span>
                <span className="text-sm text-[#6b7280] ml-1.5">USDC</span>
              </div>
            </div>
          </div>

          {/* ── Notes ───────────────────────────────────────────────────── */}
          <div className="bg-[#0f1117] border border-[#1e2130] rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#6366f1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Notes
              <span className="text-[#6b7280] font-normal normal-case tracking-normal text-xs">(optional)</span>
            </h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional context for this invoice — project name, milestone, deliverables…"
              maxLength={500}
              className="w-full bg-[#080b12] border border-[#1e2130] focus:border-[#6366f1] rounded-xl px-4 py-3 text-sm text-white placeholder-[#374151] outline-none transition-colors resize-none"
            />
            <div className="flex justify-end mt-1">
              <span className="text-xs text-[#374151] font-mono">{notes.length}/500</span>
            </div>
          </div>

          {/* ── Form-level error ─────────────────────────────────────────── */}
          {errors.form && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
              <svg className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-rose-400">{errors.form}</p>
            </div>
          )}

          {/* ── Submit ───────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2.5 border border-[#1e2130] hover:border-[#374151] text-[#9ca3af] hover:text-white text-sm font-medium rounded-xl transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || computedTotal <= 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#6366f1] hover:bg-[#4f52d1] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Submit Invoice · ${formatUsdc(computedTotal)} USDC
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
