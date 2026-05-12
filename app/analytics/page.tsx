"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BarChart3, RadioTower } from "lucide-react";

import { FadeIn } from "@/components/animated";
import { AppShell } from "@/components/app-shell";
import { AdminAuthCard } from "@/components/admin-auth-card";
import { EmptyState } from "@/components/empty-state";
import { ApprovalLineChart, ContractorSpendChart, CurrencyDonutChart, DailyPayrollSpendChart, TreasuryAreaChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthSession } from "@/lib/auth/client";
import { formatUSDC } from "@/lib/utils";

const DAY_WINDOWS = [7, 14, 30] as const;

function toISODate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function windowedDailySpend(
  payouts: Array<{ date: string; amount: number }>,
  days: number,
): Array<{ label: string; value: number }> {
  const now = new Date();
  const dates = Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (days - 1 - index));
    return date;
  });

  const totals = new Map<string, number>();
  for (const payout of payouts) {
    totals.set(payout.date, (totals.get(payout.date) ?? 0) + payout.amount);
  }

  return dates.map((date) => {
    const iso = toISODate(date);
    return {
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: totals.get(iso) ?? 0,
    };
  });
}

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const auth = useAuthSession();
  const enabled = auth.isAuthenticated && !auth.loading;
  const [windowDays, setWindowDays] = useState<(typeof DAY_WINDOWS)[number]>(14);
  const { data: payouts = [] } = useQuery({ queryKey: ["analytics-payouts"], queryFn: () => api.payouts(), enabled });
  const { data: invoices = [] } = useQuery({ queryKey: ["analytics-invoices"], queryFn: () => api.invoices(), enabled });
  const overview = useQuery({ queryKey: ["analytics-overview"], queryFn: api.companyOverview, enabled });

  const monthlySpend = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const payout of payouts) {
      const date = new Date(payout.date);
      const key = Number.isNaN(date.getTime())
        ? "Unknown"
        : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      byMonth.set(key, (byMonth.get(key) ?? 0) + payout.amount);
    }
    return Array.from(byMonth.entries()).map(([label, value]) => ({ label, value }));
  }, [payouts]);

  const currencyMix = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const payout of payouts) {
      byCurrency.set(payout.currency, (byCurrency.get(payout.currency) ?? 0) + payout.amount);
    }
    return Array.from(byCurrency.entries()).map(([name, value]) => ({ name, value }));
  }, [payouts]);

  const approvalTimes = useMemo(() => {
    const buckets = new Map<string, { total: number; count: number }>();
    for (const invoice of invoices) {
      if (!invoice.approvedAt || invoice.submittedAt === "-") continue;
      const approvedDate = new Date(invoice.approvedAt);
      const submittedDate = new Date(invoice.submittedAt);
      if (Number.isNaN(approvedDate.getTime()) || Number.isNaN(submittedDate.getTime())) continue;
      const key = approvedDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const days = Math.max(0, (approvedDate.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24));
      const bucket = buckets.get(key) ?? { total: 0, count: 0 };
      bucket.total += days;
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    return Array.from(buckets.entries()).map(([label, bucket]) => ({
      label,
      value: bucket.count ? Number((bucket.total / bucket.count).toFixed(2)) : 0,
    }));
  }, [invoices]);

  const treasuryActivity = useMemo(() => {
    const transactions = overview.data?.treasury.latestTransactions ?? [];
    return transactions
      .slice()
      .reverse()
      .map((tx) => ({
        label: new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: Number(tx.amountUsdc ?? 0),
      }));
  }, [overview.data]);

  const dailySpend = useMemo(() => windowedDailySpend(payouts, windowDays), [payouts, windowDays]);

  const dailySpendTotal = useMemo(
    () => dailySpend.reduce((sum, day) => sum + day.value, 0),
    [dailySpend],
  );

  const dailySpendAverage = useMemo(
    () => (dailySpend.length ? dailySpendTotal / dailySpend.length : 0),
    [dailySpend, dailySpendTotal],
  );

  const approvedInvoiceCount = useMemo(
    () => invoices.filter((invoice) => invoice.status === "Approved" || invoice.status === "Paid").length,
    [invoices],
  );

  const settledPayoutCount = payouts.length;

  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 md:px-8">
        <FadeIn>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="metric-label">Analytics</p>
              <h1 className="mt-2 text-3xl font-bold">Treasury intelligence</h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                Monitor payroll velocity, approval efficiency, and treasury movement in one operator-focused view.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => queryClient.invalidateQueries()}
              aria-label="Refresh analytics"
            >
              <RadioTower className="h-4 w-4" />
              Refresh analytics
            </Button>
          </div>
        </FadeIn>

        {!auth.loading && !auth.isAuthenticated ? <AdminAuthCard /> : null}

        <FadeIn delay={0.03}>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="metric-label">Window spend</p>
                <Activity className="h-4 w-4 text-violet-300" />
              </div>
              <p className="mt-3 text-2xl font-bold">{formatUSDC(dailySpendTotal)}</p>
              <p className="mt-1 text-xs text-zinc-500">Total across the last {windowDays} days</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="metric-label">Daily average</p>
                <BarChart3 className="h-4 w-4 text-emerald-300" />
              </div>
              <p className="mt-3 text-2xl font-bold">{formatUSDC(Number(dailySpendAverage.toFixed(2)))}</p>
              <p className="mt-1 text-xs text-zinc-500">Average payout volume per day</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="metric-label">Settled activity</p>
                <Badge tone="emerald">{settledPayoutCount} payouts</Badge>
              </div>
              <p className="mt-3 text-2xl font-bold">{approvedInvoiceCount} invoices</p>
              <p className="mt-1 text-xs text-zinc-500">Approved or paid invoice count</p>
            </Card>
          </div>
        </FadeIn>

        <FadeIn delay={0.06}>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Daily payroll spend</CardTitle>
                <p className="mt-1 text-sm text-zinc-400">Rolling trend across the selected period.</p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 p-1">
                {DAY_WINDOWS.map((days) => (
                  <Button
                    key={days}
                    size="sm"
                    variant={windowDays === days ? "primary" : "ghost"}
                    className={windowDays === days ? "h-8 px-3" : "h-8 px-3 border-transparent"}
                    onClick={() => setWindowDays(days)}
                    aria-label={`Show ${days} day daily spend`}
                  >
                    {days}D
                  </Button>
                ))}
              </div>
            </CardHeader>
            {dailySpend.length ? (
              <DailyPayrollSpendChart data={dailySpend} />
            ) : (
              <EmptyState title="No daily spend data" description="Daily payroll trend appears after confirmed payouts." />
            )}
          </Card>
        </FadeIn>

        <FadeIn delay={0.08}>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
            <CardHeader><CardTitle>Monthly payroll spend</CardTitle></CardHeader>
            {monthlySpend.length ? (
              <ContractorSpendChart data={monthlySpend} />
            ) : (
              <EmptyState title="No payout history" description="Payroll spend charts appear after the first payout." />
            )}
            </Card>
            <Card>
            <CardHeader><CardTitle>Spend by currency</CardTitle></CardHeader>
            {currencyMix.length ? (
              <CurrencyDonutChart data={currencyMix} />
            ) : (
              <EmptyState title="No currency mix yet" description="Currency distribution will appear after payouts run." />
            )}
            </Card>
            <Card>
            <CardHeader><CardTitle>Average approval time (days)</CardTitle></CardHeader>
            {approvalTimes.length ? (
              <ApprovalLineChart data={approvalTimes} />
            ) : (
              <EmptyState title="No approvals yet" description="Approval SLA tracking appears after invoices are approved." />
            )}
            </Card>
            <Card>
            <CardHeader><CardTitle>Treasury activity (latest 8)</CardTitle></CardHeader>
            {treasuryActivity.length ? (
              <TreasuryAreaChart data={treasuryActivity} />
            ) : (
              <EmptyState title="No treasury activity" description="Treasury activity appears after the first on-chain transfer." />
            )}
            </Card>
          </div>
        </FadeIn>
      </div>
    </AppShell>
  );
}
