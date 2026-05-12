"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BadgeDollarSign,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe2,
  Plus,
  RadioTower,
  Search,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

import { FadeIn } from "@/components/animated";
import { AdminAuthCard } from "@/components/admin-auth-card";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Sparkline } from "@/components/charts";
import { JudgeDemoPanel } from "@/components/judge-demo-panel";
import { Skeleton } from "@/components/skeleton";
import { WalletConnect } from "@/components/wallet-connect";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import {
  useContractors,
  useExecutePayouts,
  useFxRates,
  useInvoiceActions,
  useInvoices,
  useTreasuryBalance,
} from "@/hooks/use-app-data";
import { api } from "@/lib/api";
import { useAuthSession } from "@/lib/auth/client";
import { getSolanaAddressUrl, getSolanaTxUrl } from "@/lib/solana/explorer";
import { useAppStore } from "@/lib/store";
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
  const queryClient = useQueryClient();
  const pushToast = useAppStore((state) => state.pushToast);
  const auth = useAuthSession();
  const { data: treasuryData, isLoading: treasuryLoading } = useTreasuryBalance();
  const { data: contractors = [], isLoading: contractorsLoading, error: contractorsError } = useContractors();
  const { data: invoiceData = [], isLoading: invoicesLoading, error: invoicesError } = useInvoices();
  const {
    data: fxRates = [],
    isLoading: fxRatesLoading,
    error: fxRatesError,
  } = useFxRates();
  const { approve, reject } = useInvoiceActions();
  const executePayouts = useExecutePayouts();
  const overview = useQuery({
    queryKey: ["company-overview"],
    queryFn: api.companyOverview,
    enabled: auth.isAuthenticated && !auth.loading,
    retry: 0,
    refetchInterval: 20_000,
  });
  const payoutHistory = useQuery({
    queryKey: ["payouts"],
    queryFn: () => api.payouts(),
    enabled: auth.isAuthenticated && !auth.loading,
    retry: 0,
    refetchInterval: 20_000,
  });

  const [invoiceTab, setInvoiceTab] = useState("Pending");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [contractorPage, setContractorPage] = useState(1);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [contractorForm, setContractorForm] = useState({
    name: "",
    email: "",
    country: "",
    taxId: "",
    payoutPreference: "USDC" as "USDC" | "FIAT",
    walletAddress: "",
    preferredFiatCurrency: "USD",
  });
  const [invoiceForm, setInvoiceForm] = useState({
    contractorId: "",
    amountUsdc: "",
    description: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });

  const createContractor = useMutation({
    mutationFn: api.createContractor,
    onSuccess: () => {
      pushToast({ type: "success", message: "Contractor created successfully." });
      setInviteOpen(false);
      setContractorForm({
        name: "",
        email: "",
        country: "",
        taxId: "",
        payoutPreference: "USDC",
        walletAddress: "",
        preferredFiatCurrency: "USD",
      });
      queryClient.invalidateQueries({ queryKey: ["contractors"] });
      queryClient.invalidateQueries({ queryKey: ["company-overview"] });
    },
    onError: (error) => {
      pushToast({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to create contractor.",
      });
    },
  });

  const createInvoice = useMutation({
    mutationFn: api.createInvoice,
    onSuccess: () => {
      pushToast({ type: "success", message: "Invoice submitted to the approval queue." });
      setCreateInvoiceOpen(false);
      setInvoiceForm({
        contractorId: "",
        amountUsdc: "",
        description: "",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
      });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["company-overview"] });
    },
    onError: (error) => {
      pushToast({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to create invoice.",
      });
    },
  });

  const filteredContractors = contractors.filter((contractor) => {
    const matchesSearch = contractor.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || contractor.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pageSize = 5;
  const totalContractorPages = Math.max(1, Math.ceil(filteredContractors.length / pageSize));
  const paginatedContractors = filteredContractors.slice(
    (contractorPage - 1) * pageSize,
    contractorPage * pageSize,
  );
  const shownInvoices = invoiceData.filter((invoice) => invoice.status === invoiceTab);
  const payoutQueue = invoiceData.filter((invoice) => invoice.status === "Approved");
  const monthSpend = invoiceData
    .filter((invoice) => invoice.status === "Paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const payoutInvoiceIds = payoutQueue.map((invoice) => invoice.id);

  const planName = overview.data?.company.planTier ?? "Unknown";
  const billingStatus = overview.data?.billing.status ?? "unknown";
  const treasuryWallet = overview.data?.treasury.walletAddress ?? treasuryData?.wallet ?? "";
  const treasuryTransactions = overview.data?.treasury.latestTransactions ?? [];
  const recentWebhookEvents = overview.data?.webhooks.latestEvents ?? [];
  const recentPayouts = payoutHistory.data ?? [];
  const hasTreasuryWallet = Boolean(treasuryWallet);
  const approvalRate = invoiceData.length
    ? Math.round(
        (invoiceData.filter((invoice) => invoice.status === "Approved" || invoice.status === "Paid").length /
          invoiceData.length) *
          100,
      )
    : 0;
  const approvalSlaDays = useMemo(() => {
    const approvedInvoices = invoiceData.filter((invoice) => invoice.approvedAt && invoice.submittedAt !== "-");
    if (!approvedInvoices.length) {
      return null;
    }

    const totalDays = approvedInvoices.reduce((sum, invoice) => {
      const submittedAt = new Date(invoice.submittedAt).getTime();
      const approvedAt = new Date(invoice.approvedAt as string).getTime();
      if (Number.isNaN(submittedAt) || Number.isNaN(approvedAt)) {
        return sum;
      }
      return sum + Math.max(0, (approvedAt - submittedAt) / (1000 * 60 * 60 * 24));
    }, 0);

    return Number((totalDays / approvedInvoices.length).toFixed(1));
  }, [invoiceData]);

  const stats = useMemo(
    () => [
      {
        label: "Treasury Balance",
        value: treasuryLoading ? null : formatUSDC(treasuryData?.balance ?? overview.data?.treasury.balanceUsdc ?? 0),
        icon: Wallet,
        helper: "Live USDC funding visibility",
      },
      {
        label: "Active Contractors",
        value: contractorsLoading
          ? null
          : String(contractors.filter((contractor) => contractor.status === "Active").length),
        icon: Globe2,
        helper: "Ready for payroll execution",
      },
      {
        label: "Pending Invoices",
        value: invoicesLoading
          ? null
          : String(invoiceData.filter((invoice) => invoice.status === "Pending").length),
        icon: Search,
        helper: "Approval queue",
      },
      {
        label: "This Month Spend",
        value: invoicesLoading ? null : formatUSDC(monthSpend),
        icon: TrendingUp,
        helper: "Stablecoin payroll velocity",
      },
    ],
    [contractors, contractorsLoading, invoiceData, invoicesLoading, monthSpend, treasuryData?.balance, treasuryLoading],
  );

  const sparklineValues = useMemo(() => {
    const paidInvoices = invoiceData.filter((invoice) => invoice.status === "Paid" && invoice.submittedAt !== "-");
    if (!paidInvoices.length) {
      return [];
    }

    const today = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });

    return days.map((day) =>
      paidInvoices
        .filter((invoice) => invoice.submittedAt === day)
        .reduce((sum, invoice) => sum + invoice.amount, 0),
    );
  }, [invoiceData]);

  return (
    <AppShell>
      <div className="premium-grid space-y-6 px-4 py-6 md:px-8">
        <FadeIn>
          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#101018]/90 p-5 shadow-2xl shadow-black/20">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone="emerald">Devnet settlement ready</Badge>
                  <Badge tone="violet">{planName} plan</Badge>
                  <Badge tone={overview.data?.billing.webhookSync === "confirmed" ? "blue" : "amber"}>
                    Billing {overview.data?.billing.webhookSync ?? "pending"}
                  </Badge>
                </div>
                <p className="metric-label">Business dashboard</p>
                <h1 className="mt-2 text-4xl font-extrabold">Treasury command center</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                  Approve invoices, meter Dodo usage, execute Solana payouts, and verify webhook state from one finance cockpit.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <WalletConnect />
                <Button variant="ghost" onClick={() => queryClient.invalidateQueries()}>
                  <RadioTower className="h-4 w-4" />
                  Refresh
                </Button>
                <Button onClick={() => setTopUpOpen(true)}>Top Up Treasury</Button>
              </div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {[
                { label: "Approval SLA", value: approvalSlaDays === null ? "No approvals" : `${approvalSlaDays} days`, icon: ShieldCheck, helper: `${approvalRate}% invoices approved or paid` },
                { label: "Dodo billing", value: billingStatus, icon: BadgeDollarSign, helper: `${planName} subscription state` },
                { label: "Helius sync", value: overview.data?.treasury.webhookSync ?? "pending", icon: Activity, helper: "Treasury webhook ingestion" },
                { label: "Escrow queue", value: String(overview.data?.operations.activeEscrows ?? 0), icon: Zap, helper: "Awaiting settlement confirmation" },
              ].map((metric) => {
                const TypedIcon = metric.icon;
                return (
                  <div key={metric.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex items-center justify-between">
                      <p className="metric-label">{metric.label}</p>
                      <TypedIcon className="h-4 w-4 text-violet-300" />
                    </div>
                    <p className="mt-3 text-2xl font-bold capitalize">{metric.value}</p>
                    <p className="mt-1 text-xs text-zinc-500">{metric.helper}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.03}>
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="shine h-full">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                <div>
                  <p className="metric-label">Demo moment for judges</p>
                  <h2 className="mt-2 text-2xl font-bold">Execute a multi-recipient payroll batch and verify the proof immediately.</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    The UI now connects plan state, treasury funding, invoice approval, Solana settlement, and webhook sync in one workflow.
                  </p>
                </div>
                <Button
                  onClick={() => executePayouts.mutate(payoutInvoiceIds)}
                  disabled={executePayouts.isPending || payoutInvoiceIds.length === 0}
                >
                  <Zap className="h-4 w-4" />
                  Run judge demo
                </Button>
              </div>
            </Card>

            <Card>
              <p className="metric-label">Integration stack</p>
              <div className="mt-4 space-y-3">
                {[
                  ["Dodo checkout", billingStatus],
                  ["Helius treasury monitor", overview.data?.treasury.webhookSync ?? "pending"],
                  ["Solana devnet", treasuryData?.source === "solana" ? "connected" : "syncing"],
                ].map(([label, status]) => (
                  <div key={label} className="flex items-center justify-between rounded-lg border border-white/10 bg-zinc-900 px-3 py-2">
                    <span className="text-sm text-zinc-300">{label}</span>
                    <Badge tone="emerald" className="capitalize">{status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </FadeIn>

        <JudgeDemoPanel />

        {!auth.loading && !auth.isAuthenticated ? (
          <AdminAuthCard
            planTier="Growth"
            onAuthenticated={() => {
              queryClient.invalidateQueries();
            }}
          />
        ) : null}

        {auth.isAuthenticated && (contractorsError || invoicesError || overview.error) && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            {contractorsError && <p>Contractors failed to load: {contractorsError instanceof Error ? contractorsError.message : "Unknown error"}</p>}
            {invoicesError && <p>Invoices failed to load: {invoicesError instanceof Error ? invoicesError.message : "Unknown error"}</p>}
            {overview.error && <p>Company overview requires a valid admin session for this workspace.</p>}
          </div>
        )}

        {auth.isAuthenticated && (contractorsError || invoicesError || overview.error) ? (
          <AdminAuthCard
            companyName={overview.data?.company.name}
            planTier={overview.data?.company.planTier ?? "Growth"}
            onAuthenticated={() => {
              queryClient.invalidateQueries();
            }}
          />
        ) : null}

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
                    {stat.label === "Pending Invoices" ? (
                      <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.7)]" />
                    ) : null}
                  </div>
                  <p className="metric-label">{stat.label}</p>
                  {stat.value ? (
                    <div className="mt-3 flex items-center gap-2">
                      <p className="text-2xl font-bold">{stat.value}</p>
                      {stat.label === "Treasury Balance" && treasuryData?.source ? (
                        <Badge tone={treasuryData.source === "solana" ? "emerald" : "red"}>
                          {treasuryData.source === "solana" ? "LIVE" : "CACHE"}
                        </Badge>
                      ) : null}
                    </div>
                  ) : (
                    <Skeleton className="mt-3 h-8 w-32" />
                  )}
                  <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
                    <TrendingUp className="h-3 w-3" />
                    {stat.helper}
                  </div>
                  {stat.label === "This Month Spend" ? (
                    <div className="mt-2"><Sparkline values={sparklineValues} /></div>
                  ) : null}
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
                <p className="mt-1 text-sm text-zinc-400">Funding address, explorer verification, webhook sync, and recent treasury movements.</p>
              </div>
              <Button onClick={() => setTopUpOpen(true)}>Top Up Treasury</Button>
            </CardHeader>
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="metric-label">Wallet address</p>
                  {treasuryData?.source ? (
                    <Badge tone={treasuryData.source === "solana" ? "emerald" : "red"} className="text-xs">
                      {treasuryData.source === "solana" ? "LIVE" : "CACHE"}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-sm">
                  {truncateHash(treasuryWallet, 12, 8)}
                  <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(treasuryWallet)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Link href={getSolanaAddressUrl(treasuryWallet)} target="_blank">
                    <ExternalLink className="h-4 w-4 text-zinc-400" />
                  </Link>
                </div>
                {treasuryData?.error ? (
                  <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="text-xs text-rose-200">
                      <span className="font-semibold">Balance sync:</span> {treasuryData.error}
                    </p>
                  </div>
                ) : null}
                <div className="mt-6 rounded-lg bg-emerald-500/10 p-4">
                  <p className="text-sm text-emerald-200">Webhook status</p>
                  <p className="mt-2 text-3xl font-bold capitalize">{overview.data?.treasury.webhookSync ?? "pending"}</p>
                  <p className="mt-1 text-xs text-zinc-500">Helius updates treasury balances and reconciliation automatically.</p>
                </div>
                <div className="mt-4 rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Current plan</span>
                    <Badge tone="violet">{planName}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-zinc-400">Billing sync</span>
                    <Badge tone={overview.data?.billing.webhookSync === "confirmed" ? "emerald" : "amber"}>
                      {overview.data?.billing.webhookSync ?? "pending"}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {treasuryTransactions.length ? treasuryTransactions.map((entry: any) => (
                  <div key={entry.id ?? entry.signature} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{formatUSDC(entry.amountUsdc ?? entry.amount)}</p>
                      <p className="text-zinc-500">{entry.direction ?? entry.source}</p>
                    </div>
                    <div className="text-right">
                      <span className="block text-zinc-400">
                        {new Date(entry.createdAt ?? entry.date).toLocaleDateString()}
                      </span>
                      {entry.signature ? (
                        <Link className="text-xs text-violet-300" href={getSolanaTxUrl(entry.signature)} target="_blank">
                          Explorer
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-500">
                    Treasury activity will appear once transactions are detected.
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payroll Operations Center</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              {[
                ["Subscription", `${planName} / ${billingStatus}`, "Dodo hosted checkout plus webhook confirmation"],
                ["Pending invoices", String(overview.data?.operations.invoiceCounts.pending ?? invoiceData.filter((invoice) => invoice.status === "Pending").length), "Finance review required before payout"],
                ["Active escrows", String(overview.data?.operations.activeEscrows ?? 0), "Escrows awaiting Solana confirmation"],
                ["Failed payouts", String(overview.data?.operations.payoutCounts.failed ?? 0), "Retry from the operations control plane"],
              ].map(([label, value, helper]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-zinc-900 p-4">
                  <div className="flex items-center justify-between">
                    <p className="metric-label">{label}</p>
                    <Badge tone={label === "Failed payouts" && value !== "0" ? "red" : "emerald"}>{value}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-zinc-400">{helper}</p>
                </div>
              ))}
              <Link href="/operations" className="inline-flex text-sm text-violet-300 transition hover:text-violet-200">
                Open operations control plane
              </Link>
            </div>
          </Card>
        </div>

        <Card id="contractors">
          <CardHeader>
            <CardTitle>Contractor Roster</CardTitle>
            <div className="flex gap-2">
              <Button onClick={() => setInviteOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Contractor
              </Button>
              <Button variant="secondary" onClick={() => setCreateInvoiceOpen(true)}>
                <BadgeDollarSign className="h-4 w-4" />
                Create Invoice
              </Button>
            </div>
          </CardHeader>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
            <Input
              placeholder="Search contractors"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setContractorPage(1);
              }}
            />
            <Select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setContractorPage(1);
              }}
            >
              <option>All</option>
              <option>Active</option>
              <option>Invited</option>
              <option>Paused</option>
            </Select>
          </div>
          <div className="scrollbar-soft overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Country</Th>
                  <Th>Payout</Th>
                  <Th>KYC</Th>
                  <Th>Last Paid</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {paginatedContractors.map((contractor) => (
                  <tr key={contractor.id}>
                    <Td><div className="flex items-center gap-3"><Avatar name={contractor.name} />{contractor.name}</div></Td>
                    <Td>{contractor.flag} {contractor.country}</Td>
                    <Td><Badge tone={contractor.payoutPreference === "USDC" ? "violet" : "blue"}>{contractor.payoutPreference}</Badge></Td>
                    <Td><Badge tone={statusTone[contractor.kycStatus]}>{contractor.kycStatus}</Badge></Td>
                    <Td>{contractor.lastPaid}</Td>
                    <Td><Badge tone={statusTone[contractor.status]}>{contractor.status}</Badge></Td>
                  </tr>
                ))}
                {!paginatedContractors.length ? (
                  <tr>
                    <Td colSpan={6}>
                      <EmptyState
                        title="No contractors yet"
                        description="Create a contractor to start invoice approval and payroll execution."
                      />
                    </Td>
                  </tr>
                ) : null}
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
            <CardHeader>
              <CardTitle>Invoice Queue</CardTitle>
              <Tabs tabs={["Pending", "Approved", "Rejected", "Paid"]} value={invoiceTab} onChange={setInvoiceTab} />
            </CardHeader>
            <div className="scrollbar-soft overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Contractor</Th>
                    <Th>Amount</Th>
                    <Th>Submitted</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {shownInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <Td>{invoice.contractor}</Td>
                      <Td>{formatUSDC(invoice.amount)}</Td>
                      <Td>{invoice.submittedAt}</Td>
                      <Td><Badge tone={statusTone[invoice.status]}>{invoice.status}</Badge></Td>
                      <Td>
                        {invoice.status === "Pending" ? (
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => approve.mutate(invoice.id)}>
                              Approve
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setRejectId(invoice.id)}>
                              Reject
                            </Button>
                          </div>
                        ) : invoice.status === "Paid" && invoice.txHash ? (
                          <Link className="text-xs text-violet-300" target="_blank" href={getSolanaTxUrl(invoice.txHash)}>
                            Explorer
                          </Link>
                        ) : invoice.status === "Approved" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : (
                          "-"
                        )}
                      </Td>
                    </tr>
                  ))}
                  {!shownInvoices.length ? (
                    <tr>
                      <Td colSpan={5}>
                        <EmptyState
                          title={`No ${invoiceTab.toLowerCase()} invoices`}
                          description="Invoices appear here after they are created through the dashboard or contractor portal."
                        />
                      </Td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </div>
          </Card>

          <Card id="payouts">
            <CardHeader>
              <CardTitle>Payout Queue</CardTitle>
              <Button
                onClick={() => executePayouts.mutate(payoutInvoiceIds)}
                disabled={executePayouts.isPending || payoutInvoiceIds.length === 0}
              >
                <Zap className="h-4 w-4" />
                Execute Batch Payout
              </Button>
            </CardHeader>
            <p className="mb-4 text-sm text-zinc-400">Approve invoices to trigger escrow-backed payout release. Batch execution finalizes all approved recipients together.</p>
            <div className="space-y-3">
              {payoutQueue.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
                  <div>
                    <p className="font-medium">{invoice.contractor}</p>
                    <p className="text-sm text-zinc-500">{invoice.id}</p>
                  </div>
                  <div className="text-right">
                    <p>{formatUSDC(invoice.amount)}</p>
                    <span className="text-xs text-zinc-500">Escrow initialized on approve</span>
                  </div>
                </div>
              ))}
              {!payoutQueue.length ? (
                <div className="rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-400">
                  No approved invoices are waiting for batch payout.
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Visibility</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {recentWebhookEvents.slice(0, 6).map((event) => (
                <div key={event.id} className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>{event.provider} / {event.eventType}</span>
                    <Badge tone={event.processed ? "emerald" : "amber"}>{event.processed ? "processed" : "pending"}</Badge>
                  </div>
                  <p className="mt-2 text-zinc-500">
                    {new Date(event.createdAt).toLocaleString()}
                    {event.externalId ? ` • ${event.externalId}` : ""}
                  </p>
                </div>
              ))}
              {!recentWebhookEvents.length ? (
                <p className="text-sm text-zinc-500">Webhook history will appear here after Dodo and Helius deliveries land.</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Payout Proof</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {recentPayouts.slice(0, 5).map((payout) => (
                <div key={payout.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
                  <div>
                    <p className="font-medium">{payout.contractor}</p>
                    <p className="text-xs text-zinc-500">{payout.invoiceId}</p>
                  </div>
                  <div className="text-right">
                    <p>{formatUSDC(payout.amount)}</p>
                    <Link className="text-xs text-violet-300" href={getSolanaTxUrl(payout.txHash)} target="_blank">
                      {truncateHash(payout.txHash, 10, 6)}
                    </Link>
                  </div>
                </div>
              ))}
              {!recentPayouts.length ? (
                <p className="text-sm text-zinc-500">Confirmed Solana payout signatures will appear here once payroll executes.</p>
              ) : null}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>FX Visibility</CardTitle>
            {fxRatesLoading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" /> : null}
          </CardHeader>
          {fxRates.length ? (
            <div className="grid gap-3 md:grid-cols-5">
              {fxRates.map((rate) => (
                <div key={rate.pair} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="metric-label">{rate.pair}</p>
                  <p className="mt-3 text-2xl font-bold">{rate.rate}</p>
                  <p className="mt-3 text-xs text-zinc-500">Updated {rate.updatedAt}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="FX provider unavailable"
              description={
                fxRatesError instanceof Error
                  ? fxRatesError.message
                  : "Live FX quotes will appear here once the rate provider responds."
              }
            />
          )}
        </Card>
      </div>

      <Dialog open={topUpOpen} title="Top Up Treasury" onOpenChange={setTopUpOpen}>
        <div className="grid place-items-center gap-4 text-center">
          {hasTreasuryWallet ? (
            <>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(treasuryWallet)}`}
                alt="Treasury wallet QR code"
                className="h-36 w-36 rounded-lg border border-violet-400/30 bg-white p-2"
              />
              <p className="break-all font-mono text-sm text-zinc-300">{treasuryWallet}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={() => navigator.clipboard.writeText(treasuryWallet)}>
                  <Copy className="h-4 w-4" />
                  Copy address
                </Button>
                <Link href={getSolanaAddressUrl(treasuryWallet)} target="_blank" className="inline-flex">
                  <Button variant="secondary">
                    <ExternalLink className="h-4 w-4" />
                    Open explorer
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-400">
              Treasury wallet is not configured for this company yet.
            </div>
          )}
        </div>
      </Dialog>

      <Dialog open={inviteOpen} title="Add Contractor" onOpenChange={setInviteOpen}>
        <div className="space-y-3">
          <Input placeholder="Contractor name" value={contractorForm.name} onChange={(event) => setContractorForm((current) => ({ ...current, name: event.target.value }))} />
          <Input placeholder="Email" type="email" value={contractorForm.email} onChange={(event) => setContractorForm((current) => ({ ...current, email: event.target.value }))} />
          <Input placeholder="Country" value={contractorForm.country} onChange={(event) => setContractorForm((current) => ({ ...current, country: event.target.value }))} />
          <Input placeholder="Tax ID" value={contractorForm.taxId} onChange={(event) => setContractorForm((current) => ({ ...current, taxId: event.target.value }))} />
          <Select value={contractorForm.payoutPreference} onChange={(event) => setContractorForm((current) => ({ ...current, payoutPreference: event.target.value as "USDC" | "FIAT" }))}>
            <option value="USDC">USDC wallet payout</option>
            <option value="FIAT">Local currency payout</option>
          </Select>
          {contractorForm.payoutPreference === "USDC" ? (
            <Input placeholder="Solana wallet address" value={contractorForm.walletAddress} onChange={(event) => setContractorForm((current) => ({ ...current, walletAddress: event.target.value }))} />
          ) : (
            <Input placeholder="Preferred fiat currency" value={contractorForm.preferredFiatCurrency} onChange={(event) => setContractorForm((current) => ({ ...current, preferredFiatCurrency: event.target.value }))} />
          )}
          <Button
            className="w-full"
            disabled={createContractor.isPending}
            onClick={() => {
              createContractor.mutate({
                name: contractorForm.name.trim(),
                email: contractorForm.email.trim(),
                country: contractorForm.country.trim(),
                taxId: contractorForm.taxId.trim(),
                payoutPreference: contractorForm.payoutPreference,
                walletAddress: contractorForm.payoutPreference === "USDC" ? contractorForm.walletAddress.trim() : undefined,
                preferredFiatCurrency:
                  contractorForm.payoutPreference === "FIAT"
                    ? contractorForm.preferredFiatCurrency.trim()
                    : undefined,
              });
            }}
          >
            {createContractor.isPending ? "Creating..." : "Create contractor"}
          </Button>
        </div>
      </Dialog>

      <Dialog open={createInvoiceOpen} title="Create Invoice" onOpenChange={setCreateInvoiceOpen}>
        <div className="space-y-3">
          <Select value={invoiceForm.contractorId} onChange={(event) => setInvoiceForm((current) => ({ ...current, contractorId: event.target.value }))}>
            <option value="" disabled>Select contractor</option>
            {contractors.map((contractor) => (
              <option key={contractor.id} value={contractor.id}>{contractor.name}</option>
            ))}
          </Select>
          <Input placeholder="Amount in USDC" type="number" min="0" step="0.01" value={invoiceForm.amountUsdc} onChange={(event) => setInvoiceForm((current) => ({ ...current, amountUsdc: event.target.value }))} />
          <Input placeholder="Work period start" type="date" value={invoiceForm.startDate} onChange={(event) => setInvoiceForm((current) => ({ ...current, startDate: event.target.value }))} />
          <Input placeholder="Work period end" type="date" value={invoiceForm.endDate} onChange={(event) => setInvoiceForm((current) => ({ ...current, endDate: event.target.value }))} />
          <Textarea placeholder="Work summary / notes" value={invoiceForm.description} onChange={(event) => setInvoiceForm((current) => ({ ...current, description: event.target.value }))} />
          <Button
            className="w-full"
            disabled={createInvoice.isPending}
            onClick={() => {
              const amountUsdc = Number(invoiceForm.amountUsdc);
              createInvoice.mutate({
                contractorId: invoiceForm.contractorId,
                amountUsdc,
                workPeriodStart: invoiceForm.startDate,
                workPeriodEnd: invoiceForm.endDate,
                lineItems: [
                  {
                    description: invoiceForm.description.trim() || "Payroll invoice",
                    quantity: 1,
                    unitPrice: amountUsdc,
                  },
                ],
                notes: invoiceForm.description.trim(),
              });
            }}
          >
            {createInvoice.isPending ? "Submitting..." : "Submit invoice"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(rejectId)}
        title="Reject Invoice"
        onOpenChange={(open) => {
          if (!open) {
            setRejectId(null);
            setRejectReason("");
          }
        }}
      >
        <div className="space-y-4">
          <Textarea placeholder="Reason for rejection" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
          <Button
            variant="danger"
            disabled={!rejectId || !rejectReason.trim() || reject.isPending}
            onClick={() => {
              if (!rejectId) return;
              reject.mutate(
                { id: rejectId, reason: rejectReason.trim() },
                {
                  onSuccess: () => {
                    setRejectId(null);
                    setRejectReason("");
                  },
                },
              );
            }}
          >
            Reject invoice
          </Button>
        </div>
      </Dialog>
    </AppShell>
  );
}
