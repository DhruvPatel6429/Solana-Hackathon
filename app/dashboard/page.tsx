"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BadgeDollarSign, CheckCircle2, Clock3, Copy, ExternalLink, Globe2, Landmark, Plus, RadioTower, Search, ShieldCheck, TrendingUp, Wallet, Zap } from "lucide-react";
import { FadeIn } from "@/components/animated";
import { AppShell } from "@/components/app-shell";
import { Sparkline } from "@/components/charts";
import { Skeleton } from "@/components/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useContractors, useExecutePayouts, useFxRates, useInvoiceActions, useInvoices, useTreasuryBalance } from "@/hooks/use-app-data";
import { invoices as mockInvoices, treasury } from "@/lib/mock-data";
import { formatUSDC, truncateHash } from "@/lib/utils";

const statusTone = {
  Pending: "amber",
  Approved: "blue",
  Rejected: "red",
  Paid: "emerald",
  Verified: "emerald",
  Active: "emerald",
  Invited: "amber",
  Paused: "red",
} as const;

const commandMetrics = [
  { label: "Approval SLA", value: "0.8 days", icon: Clock3, helper: "42% faster this month" },
  { label: "Policy automation", value: "0%", icon: ShieldCheck, helper: "Rules below 2,500 USDC" },
  { label: "Dodo usage", value: "31 units", icon: BadgeDollarSign, helper: "Invoices, payouts, FX quotes" },
  { label: "Webhook health", value: "99.9%", icon: Activity, helper: "Last event verified" },
];

const integrationStack = [
  { label: "Dodo checkout", status: "Active", icon: Landmark },
  { label: "Usage metering", status: "Reporting", icon: BadgeDollarSign },
  { label: "Solana devnet", status: "Connected", icon: RadioTower },
];

export default function DashboardPage() {
  const { data: treasuryData, isLoading: treasuryLoading } = useTreasuryBalance();
  const { data: contractors = [], isLoading: contractorsLoading } = useContractors();
  const { data: invoiceData = mockInvoices, isLoading: invoicesLoading } = useInvoices();
  const { data: fxRates = [] } = useFxRates();
  const { approve, reject } = useInvoiceActions();
  const executePayouts = useExecutePayouts();
  const [invoiceTab, setInvoiceTab] = useState("Pending");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [contractorPage, setContractorPage] = useState(1);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);

  const filteredContractors = contractors.filter((contractor) => {
    const matchesSearch = contractor.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || contractor.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pageSize = 5;
  const totalContractorPages = Math.max(1, Math.ceil(filteredContractors.length / pageSize));
  const paginatedContractors = filteredContractors.slice((contractorPage - 1) * pageSize, contractorPage * pageSize);
  const shownInvoices = invoiceData.filter((invoice) => invoice.status === invoiceTab);
  const payoutQueue = invoiceData.filter((invoice) => invoice.status === "Approved");
  const monthSpend = invoiceData.filter((invoice) => invoice.status === "Paid").reduce((sum, invoice) => sum + invoice.amount, 0);

  const stats = useMemo(
    () => [
      { label: "Treasury Balance", value: treasuryLoading ? null : formatUSDC(treasuryData?.balance ?? treasury.balance), icon: Wallet, helper: "Recent top-up +14.8%" },
      { label: "Active Contractors", value: contractorsLoading ? null : String(contractors.filter((c) => c.status === "Active").length), icon: Globe2, helper: "Across 6 countries" },
      { label: "Pending Invoices", value: invoicesLoading ? null : String(invoiceData.filter((invoice) => invoice.status === "Pending").length), icon: Search, helper: "Needs review" },
      { label: "This Month Spend", value: invoicesLoading ? null : formatUSDC(monthSpend), icon: TrendingUp, helper: "Live spend velocity" },
    ],
    [contractors, contractorsLoading, invoiceData, invoicesLoading, monthSpend, treasuryData?.balance, treasuryLoading],
  );
  const approvalRate = Math.round((invoiceData.filter((invoice) => invoice.status === "Approved" || invoice.status === "Paid").length / invoiceData.length) * 100);

  return (
    <AppShell>
      <div className="premium-grid space-y-6 px-4 py-6 md:px-8">
        <FadeIn>
          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#101018]/90 p-5 shadow-2xl shadow-black/20">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone="emerald">Devnet settlement ready</Badge>
                  <Badge tone="violet">Dodo billing active</Badge>
                  <Badge tone="blue">USDC treasury funded</Badge>
                </div>
                <p className="metric-label">Business dashboard</p>
                <h1 className="mt-2 text-4xl font-extrabold">Treasury command center</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                  Approve invoices, meter Dodo usage, execute Solana payouts, and export audit-ready proof from one finance cockpit.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost">
                  <RadioTower className="h-4 w-4" />
                  Sync rates
                </Button>
                <Button onClick={() => setTopUpOpen(true)}>Top Up Treasury</Button>
              </div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {commandMetrics.map((metric) => {
                const TypedIcon = metric.icon;
                const value = metric.label === "Policy automation" ? `${approvalRate}%` : metric.value;
                return (
                  <div key={metric.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex items-center justify-between">
                      <p className="metric-label">{metric.label}</p>
                      <TypedIcon className="h-4 w-4 text-violet-300" />
                    </div>
                    <p className="mt-3 text-2xl font-bold">{value}</p>
                    <p className="mt-1 text-xs text-zinc-500">{metric.helper}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.03}>
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <div>
              <Card className="shine h-full">
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                  <div>
                    <p className="metric-label">Demo moment for judges</p>
                    <h2 className="mt-2 text-2xl font-bold">Execute a 3-recipient payout batch and watch usage billing record automatically.</h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">
                      The dashboard ties the product story together: Dodo subscription, USDC treasury, invoice approval, Solana proof, and compliance export.
                    </p>
                  </div>
                  <Button onClick={() => executePayouts.mutate()} disabled={executePayouts.isPending}>
                    <Zap className="h-4 w-4" />
                    Run judge demo
                  </Button>
                </div>
              </Card>
            </div>
            <Card>
              <p className="metric-label">Integration stack</p>
              <div className="mt-4 space-y-3">
                {integrationStack.map((item) => {
                  const TypedIcon = item.icon;
                  return (
                    <div key={item.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                      <span className="flex items-center gap-2 text-sm text-zinc-300"><TypedIcon className="h-4 w-4 text-violet-300" />{item.label}</span>
                      <Badge tone="emerald">{item.status}</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </FadeIn>

        <div className="grid gap-4 lg:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <FadeIn key={stat.label} delay={index * 0.04}>
                <Card className="shine min-h-44">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-violet-500/10 ring-1 ring-violet-400/20">
                      <Icon className="h-5 w-5 text-violet-300" />
                    </div>
                    {stat.label === "Pending Invoices" && <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.7)]" />}
                  </div>
                  <p className="metric-label">{stat.label}</p>
                  {stat.value ? <p className="mt-3 text-2xl font-bold">{stat.value}</p> : <Skeleton className="mt-3 h-8 w-32" />}
                  <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300"><TrendingUp className="h-3 w-3" />{stat.helper}</div>
                  {stat.label === "This Month Spend" && <div className="mt-2"><Sparkline /></div>}
                </Card>
              </FadeIn>
            );
          })}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Treasury Panel</CardTitle>
                <p className="mt-1 text-sm text-zinc-400">Solana USDC wallet, treasury runway, and recent funding activity</p>
              </div>
              <Button onClick={() => setTopUpOpen(true)}>Top Up Treasury</Button>
            </CardHeader>
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="metric-label">Wallet address</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-sm">
                  {truncateHash(treasuryData?.wallet ?? treasury.wallet, 12, 8)}
                  <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(treasuryData?.wallet ?? treasury.wallet)}><Copy className="h-4 w-4" /></Button>
                  <Link href={`https://explorer.solana.com/address/${treasuryData?.wallet ?? treasury.wallet}?cluster=devnet`} target="_blank"><ExternalLink className="h-4 w-4 text-zinc-400" /></Link>
                </div>
                <div className="mt-6 rounded-lg bg-emerald-500/10 p-4">
                  <p className="text-sm text-emerald-200">Runway estimate</p>
                  <p className="mt-2 text-3xl font-bold">5.8 months</p>
                  <p className="mt-1 text-xs text-zinc-500">Based on current monthly payout velocity</p>
                </div>
              </div>
              <div className="space-y-3">
                {treasury.topUps.map((topUp) => (
                  <div key={topUp.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
                    <div><p className="font-medium">{formatUSDC(topUp.amount)}</p><p className="text-zinc-500">{topUp.source}</p></div>
                    <span className="text-zinc-400">{topUp.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Risk Monitor</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              {[
                ["KYC completion", "87%", "6 verified, 1 pending, 1 rejected"],
                ["Treasury utilization", "42%", "Healthy for next payout cycle"],
                ["Invoice risk", "Low", "Only 4 pending review items"],
              ].map(([label, value, helper]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <p className="metric-label">{label}</p>
                    <Badge tone={value === "Low" ? "emerald" : "violet"}>{value}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-zinc-400">{helper}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card id="contractors">
          <CardHeader>
            <CardTitle>Contractor Roster</CardTitle>
            <Button onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4" />Add Contractor</Button>
          </CardHeader>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
            <Input placeholder="Search contractors" value={search} onChange={(event) => { setSearch(event.target.value); setContractorPage(1); }} />
            <Select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setContractorPage(1); }}><option>All</option><option>Active</option><option>Invited</option><option>Paused</option></Select>
          </div>
          <div className="scrollbar-soft overflow-x-auto">
            <Table>
              <thead><tr><Th>Name</Th><Th>Country</Th><Th>Payout</Th><Th>KYC</Th><Th>Last Paid</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
              <tbody>
                {paginatedContractors.map((contractor) => (
                  <tr key={contractor.id}>
                    <Td><div className="flex items-center gap-3"><Avatar name={contractor.name} />{contractor.name}</div></Td>
                    <Td>{contractor.flag} {contractor.country}</Td>
                    <Td><Badge tone={contractor.payoutPreference === "USDC" ? "violet" : "blue"}>{contractor.payoutPreference}</Badge></Td>
                    <Td><Badge tone={statusTone[contractor.kycStatus]}>{contractor.kycStatus}</Badge></Td>
                    <Td>{contractor.lastPaid}</Td>
                    <Td><Badge tone={statusTone[contractor.status]}>{contractor.status}</Badge></Td>
                    <Td><Button size="sm" variant="ghost">View</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
            <span>Page {contractorPage} of {totalContractorPages} - {filteredContractors.length} contractors</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={contractorPage === 1} onClick={() => setContractorPage((page) => Math.max(1, page - 1))}>Previous</Button>
              <Button size="sm" variant="ghost" disabled={contractorPage === totalContractorPages} onClick={() => setContractorPage((page) => Math.min(totalContractorPages, page + 1))}>Next</Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card id="invoices">
            <CardHeader><CardTitle>Invoice Queue</CardTitle><Tabs tabs={["Pending", "Approved", "Rejected", "Paid"]} value={invoiceTab} onChange={setInvoiceTab} /></CardHeader>
            <div className="scrollbar-soft overflow-x-auto">
              <Table>
                <thead><tr><Th>Contractor</Th><Th>Amount</Th><Th>Submitted</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
                <tbody>
                  {shownInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <Td>{invoice.contractor}</Td><Td>{formatUSDC(invoice.amount)}</Td><Td>{invoice.submittedAt}</Td>
                      <Td><Badge tone={statusTone[invoice.status]}>{invoice.status}</Badge></Td>
                      <Td>
                        {invoice.status === "Pending" ? <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => approve.mutate(invoice.id)}>Approve</Button><Button size="sm" variant="danger" onClick={() => setRejectId(invoice.id)}>Reject</Button></div> : invoice.status === "Approved" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : "-"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>

          <Card id="payouts">
            <CardHeader><CardTitle>Payout Queue</CardTitle><Button onClick={() => executePayouts.mutate()} disabled={executePayouts.isPending}><Zap className="h-4 w-4" />Execute Batch Payout</Button></CardHeader>
            <p className="mb-4 text-sm text-zinc-400">Estimated gas fee: 0.00021 SOL - {payoutQueue.length} recipients</p>
            <div className="space-y-3">
              {payoutQueue.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
                  <div><p className="font-medium">{invoice.contractor}</p><p className="text-sm text-zinc-500">{invoice.id}</p></div>
                  <div className="text-right"><p>{formatUSDC(invoice.amount)}</p><Link className="text-xs text-violet-300" target="_blank" href="https://explorer.solana.com/?cluster=devnet">devnet explorer</Link></div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>FX Visibility</CardTitle><span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" /></CardHeader>
          <div className="grid gap-3 md:grid-cols-5">
            {fxRates.map((rate) => (
              <div key={rate.pair} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="metric-label">{rate.pair}</p>
                <p className="mt-3 text-2xl font-bold">{rate.rate}</p>
                <p className={rate.change >= 0 ? "text-sm text-emerald-300" : "text-sm text-red-300"}>{rate.change >= 0 ? "+" : ""}{rate.change}% 24h</p>
                <p className="mt-3 text-xs text-zinc-500">{rate.refreshedAt}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Dialog open={topUpOpen} title="Top Up Treasury" onOpenChange={setTopUpOpen}>
        <div className="grid place-items-center gap-4 text-center">
          <div className="grid h-36 w-36 place-items-center rounded-lg border border-violet-400/30 bg-violet-500/10 text-violet-200">QR</div>
          <p className="break-all font-mono text-sm text-zinc-300">{treasury.wallet}</p>
          <Button onClick={() => navigator.clipboard.writeText(treasury.wallet)}><Copy className="h-4 w-4" />Copy address</Button>
        </div>
      </Dialog>
      <Dialog open={inviteOpen} title="Invite Contractor" onOpenChange={setInviteOpen}>
        <div className="space-y-3"><Input placeholder="Contractor email" /><Select><option>USDC wallet payout</option><option>Local currency payout</option></Select><Button className="w-full">Send invite</Button></div>
      </Dialog>
      <Dialog open={Boolean(rejectId)} title="Reject Invoice" onOpenChange={() => setRejectId(null)}>
        <div className="space-y-4"><Textarea placeholder="Reason for rejection" /><Button variant="danger" onClick={() => rejectId && reject.mutate({ id: rejectId, reason: "Needs corrected line items" })}>Reject invoice</Button></div>
      </Dialog>
    </AppShell>
  );
}
