import { AppShell } from "@/components/app-shell";
import { ApprovalLineChart, ContractorSpendChart, CurrencyDonutChart, TreasuryAreaChart } from "@/components/charts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export default function AnalyticsPage() {
  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 md:px-8">
        <div><p className="metric-label">Analytics</p><h1 className="mt-2 text-3xl font-bold">Treasury intelligence</h1></div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>Monthly spend by contractor team</CardTitle></CardHeader><ContractorSpendChart /></Card>
          <Card><CardHeader><CardTitle>Spend by currency</CardTitle></CardHeader><CurrencyDonutChart /></Card>
          <Card><CardHeader><CardTitle>Invoice approval time</CardTitle></CardHeader><ApprovalLineChart /></Card>
          <Card><CardHeader><CardTitle>Treasury balance over time</CardTitle></CardHeader><TreasuryAreaChart /></Card>
        </div>
      </div>
    </AppShell>
  );
}
