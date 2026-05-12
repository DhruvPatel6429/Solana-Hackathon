"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { AdminAuthCard } from "@/components/admin-auth-card";
import { EmptyState } from "@/components/empty-state";
import { ApprovalLineChart, ContractorSpendChart, CurrencyDonutChart, TreasuryAreaChart } from "@/components/charts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthSession } from "@/lib/auth/client";

export default function AnalyticsPage() {
  const auth = useAuthSession();
  const enabled = auth.isAuthenticated && !auth.loading;
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

  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 md:px-8">
        <div><p className="metric-label">Analytics</p><h1 className="mt-2 text-3xl font-bold">Treasury intelligence</h1></div>
        {!auth.loading && !auth.isAuthenticated ? <AdminAuthCard /> : null}
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
      </div>
    </AppShell>
  );
}
