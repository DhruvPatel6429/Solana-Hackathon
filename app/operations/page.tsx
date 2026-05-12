"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, Clock3, RadioTower, ShieldCheck, WalletCards, Zap } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AdminAuthCard } from "@/components/admin-auth-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuthSession } from "@/lib/auth/client";

function numberFormat(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

export default function OperationsPage() {
  const queryClient = useQueryClient();
  const auth = useAuthSession();
  const [validationLog, setValidationLog] = useState<string[]>([]);
  const enabled = auth.isAuthenticated && !auth.loading;
  const health = useQuery({ queryKey: ["system-health"], queryFn: api.systemHealth, enabled, refetchInterval: 30_000 });
  const metrics = useQuery({ queryKey: ["system-metrics"], queryFn: api.systemMetrics, enabled, refetchInterval: 30_000 });
  const reconciliation = useQuery({ queryKey: ["reconciliation-report"], queryFn: api.reconciliationReport, enabled, refetchInterval: 30_000 });

  const recoverPayouts = useMutation({
    mutationFn: api.recoverPayouts,
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const replayWebhooks = useMutation({
    mutationFn: api.replayWebhooks,
    onSuccess: () => queryClient.invalidateQueries(),
  });

  async function runValidation(kind: "validate-anchor" | "live-payroll" | "batch" | "split" | "dodo" | "helius") {
    const label = kind
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    setValidationLog((current) => [`Running ${label}...`, ...current].slice(0, 8));

    try {
      const payload = await api.runValidation(kind);

      const summary = (payload.artifact as { summary?: { passed?: number; failed?: number } } | undefined)?.summary;
      setValidationLog((current) => [
        `${label} complete${summary ? `: ${summary.passed ?? 0} passed, ${summary.failed ?? 0} failed` : ""}`,
        ...current,
      ].slice(0, 8));
      queryClient.invalidateQueries();
    } catch (error) {
      setValidationLog((current) => [
        `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
        ...current,
      ].slice(0, 8));
    }
  }

  const checks = health.data?.checks ?? {};
  const payoutMetrics = metrics.data?.payouts ?? {};
  const treasuryMetrics = metrics.data?.treasury ?? {};
  const webhookMetrics = metrics.data?.webhooks ?? {};
  const escrowMetrics = metrics.data?.escrow ?? {};
  const openItems = reconciliation.data?.openItems ?? [];
  const deadLetters = reconciliation.data?.deadLetterWebhooks ?? [];
  const failedJobs = reconciliation.data?.failedJobs ?? [];

  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="metric-label">Enterprise operations</p>
            <h1 className="mt-2 text-3xl font-bold">Production control plane</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Health, payout recovery, webhook replay, treasury reconciliation, and audit warnings for real deployment operations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => queryClient.invalidateQueries()}>
              <Clock3 className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={() => recoverPayouts.mutate()} disabled={!enabled || recoverPayouts.isPending}>
              <Zap className="h-4 w-4" />
              Reconcile payouts
            </Button>
            <Button variant="secondary" onClick={() => replayWebhooks.mutate()} disabled={!enabled || replayWebhooks.isPending}>
              <Activity className="h-4 w-4" />
              Replay webhooks
            </Button>
          </div>
        </div>

        {!auth.loading && !auth.isAuthenticated ? (
          <AdminAuthCard
            onAuthenticated={() => {
              queryClient.invalidateQueries();
            }}
          />
        ) : null}

        {auth.isAuthenticated && (health.error || metrics.error || reconciliation.error) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            Operations APIs require an admin session. Please sign in with an admin account.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { label: "System health", value: health.data?.status ?? "UNKNOWN", icon: RadioTower, tone: health.data?.ok ? "emerald" : "red" },
            { label: "Payout success", value: `${Math.round((payoutMetrics.successRate ?? 0) * 100)}%`, icon: WalletCards, tone: (payoutMetrics.successRate ?? 0) >= 0.98 ? "emerald" : "amber" },
            { label: "Dead webhooks", value: numberFormat(checks.deadLetterWebhooks), icon: ShieldCheck, tone: checks.deadLetterWebhooks ? "red" : "emerald" },
            { label: "Open warnings", value: numberFormat(reconciliation.data?.summary?.open), icon: Activity, tone: reconciliation.data?.summary?.critical ? "red" : "amber" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.label}>
                <div className="flex items-center justify-between">
                  <p className="metric-label">{item.label}</p>
                  <Icon className="h-4 w-4 text-violet-300" />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <p className="text-2xl font-bold">{item.value}</p>
                  <Badge tone={item.tone as any}>{item.tone === "emerald" ? "OK" : "Watch"}</Badge>
                </div>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader><CardTitle>Operations Testing Center</CardTitle></CardHeader>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["validate-anchor", "Validate Anchor"],
              ["live-payroll", "Run Live Payroll"],
              ["batch", "Run Batch Payout"],
              ["split", "Run Split Payout"],
              ["dodo", "Run Dodo Validation"],
              ["helius", "Run Helius Validation"],
            ].map(([kind, label]) => (
              <Button key={kind} variant="secondary" onClick={() => runValidation(kind as any)} disabled={!enabled}>
                {label}
              </Button>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-300">
            {validationLog.length ? (
              <div className="space-y-2">
                {validationLog.map((entry, index) => (
                  <p key={`${entry}-${index}`}>{entry}</p>
                ))}
              </div>
            ) : (
              <p>Run phase4 checks from the browser. Each action invokes the existing backend script and reads the generated artifact.</p>
            )}
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Payout Monitoring</CardTitle></CardHeader>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-400">Confirmed</span><span>{numberFormat(payoutMetrics.confirmed)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Pending</span><span>{numberFormat(payoutMetrics.pending)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Failed</span><span>{numberFormat(payoutMetrics.failed)}</span></div>
            </div>
          </Card>
          <Card>
            <CardHeader><CardTitle>Treasury Dashboard</CardTitle></CardHeader>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-400">Total USDC</span><span>{numberFormat(treasuryMetrics.totalBalanceUsdc)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Wallets</span><span>{numberFormat(treasuryMetrics.wallets?.length)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Outstanding escrow</span><span>{numberFormat(escrowMetrics.outstandingBalanceUsdc)}</span></div>
            </div>
          </Card>
          <Card>
            <CardHeader><CardTitle>Webhook Events</CardTitle></CardHeader>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-400">Processed</span><span>{numberFormat(webhookMetrics.processed)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Failed</span><span>{numberFormat(webhookMetrics.failed)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Avg latency</span><span>{numberFormat(webhookMetrics.avgLatencyMs)} ms</span></div>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Reconciliation Warnings</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <thead><tr><Th>Scope</Th><Th>Entity</Th><Th>Severity</Th><Th>Status</Th><Th>Tx</Th><Th>Created</Th></tr></thead>
              <tbody>
                {openItems.map((item: any) => (
                  <tr key={item.id}>
                    <Td>{item.scope}</Td>
                    <Td>{item.entityType ?? "-"} {item.entityId ?? ""}</Td>
                    <Td><Badge tone={item.severity === "CRITICAL" ? "red" : "amber"}>{item.severity}</Badge></Td>
                    <Td>{item.status}</Td>
                    <Td className="font-mono text-xs">{item.txSignature ?? "-"}</Td>
                    <Td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Failed Payout Intervention</CardTitle></CardHeader>
            <div className="space-y-3">
              {failedJobs.map((job: any) => (
                <div key={job.id} className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm">
                  <div className="flex items-center justify-between"><span>{job.entityId}</span><Badge tone="amber">{job.status}</Badge></div>
                  <p className="mt-2 text-zinc-500">{job.lastError ?? "Queued for retry"}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader><CardTitle>Webhook Dead Letter Queue</CardTitle></CardHeader>
            <div className="space-y-3">
              {deadLetters.map((webhook: any) => (
                <div key={webhook.id} className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm">
                  <div className="flex items-center justify-between"><span>{webhook.provider} / {webhook.eventType ?? webhook.externalId}</span><Badge tone="red">{webhook.status}</Badge></div>
                  <p className="mt-2 text-zinc-500">{webhook.lastError ?? "Awaiting replay"}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Database Governance Signals</CardTitle><ShieldCheck className="h-4 w-4 text-violet-300" /></CardHeader>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm">Decimal audits: enforced via Prisma Decimal and migration validation</div>
            <div className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm">Indexes: payout, webhook, treasury, reconciliation hot paths covered</div>
            <div className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm">Backups: documented PITR + pre-deploy snapshot runbook</div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
