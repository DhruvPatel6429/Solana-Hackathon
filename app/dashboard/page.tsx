"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, ExternalLink, Globe2, Plus, Search, TrendingUp, Wallet, Zap } from "lucide-react";
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
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);

  const filteredContractors = contractors.filter((contractor) => {
    const matchesSearch = contractor.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || contractor.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
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

  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 md:px-8">
        <FadeIn>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="metric-label">Business dashboard</p>
              <h1 className="mt-2 text-3xl font-bold">Treasury command center</h1>
            </div>
            <Button onClick={() => setTopUpOpen(true)}>Top Up Treasury</Button>
          </div>
        </FadeIn>

        <div className="grid gap-4 lg:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <FadeIn key={stat.label} delay={index * 0.04}>
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <Icon className="h-5 w-5 text-violet-300" />
                    {stat.label === "Pending Invoices" && <span className="h-2 w-2 rounded-full bg-amber-400" />}
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

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Treasury Panel</CardTitle>
              <p className="mt-1 text-sm text-zinc-400">Solana USDC wallet and recent funding activity</p>
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

        <Card id="contractors">
          <CardHeader>
            <CardTitle>Contractor Roster</CardTitle>
            <Button onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4" />Add Contractor</Button>
          </CardHeader>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
            <Input placeholder="Search contractors" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option><option>Active</option><option>Invited</option><option>Paused</option></Select>
          </div>
          <div className="scrollbar-soft overflow-x-auto">
            <Table>
              <thead><tr><Th>Name</Th><Th>Country</Th><Th>Payout</Th><Th>KYC</Th><Th>Last Paid</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
              <tbody>
                {filteredContractors.map((contractor) => (
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
            <p className="mb-4 text-sm text-zinc-400">Estimated gas fee: 0.00021 SOL · {payoutQueue.length} recipients</p>
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
