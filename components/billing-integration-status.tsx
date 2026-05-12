"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, CheckCircle2, Clock3, ExternalLink, Loader, Zap } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import { useAuthSession } from "@/lib/auth/client";

export function BillingIntegrationStatus() {
  const auth = useAuthSession();
  
  const reconciliation = useQuery({
    queryKey: ["billing-reconcile"],
    queryFn: () => api.reconcileBilling(),
    enabled: auth.isAuthenticated && !auth.loading,
    retry: 1,
    refetchInterval: 30_000,
  });

  const overview = useQuery({
    queryKey: ["company-overview"],
    queryFn: api.companyOverview,
    enabled: auth.isAuthenticated && !auth.loading,
    retry: 0,
    refetchInterval: 20_000,
  });

  const data = reconciliation.data;
  const companyData = overview.data;

  if (reconciliation.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing Integration</CardTitle>
        </CardHeader>
        <div className="space-y-3 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </Card>
    );
  }

  if (reconciliation.error) {
    return (
      <Card className="border-rose-500/30 bg-rose-500/10">
        <CardHeader>
          <CardTitle className="text-rose-200">Billing Status - Error</CardTitle>
        </CardHeader>
        <div className="space-y-2 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-rose-200">Failed to load billing state</p>
              <p className="text-xs text-rose-300 mt-1">
                {reconciliation.error instanceof Error ? reconciliation.error.message : "Unknown error"}
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const statusTone = {
    active: "emerald",
    trialing: "blue",
    pending_checkout: "amber",
    uninitialized: "red",
    failed: "red",
  } as const;

  const statusIcon = {
    active: CheckCircle2,
    trialing: Clock3,
    pending_checkout: Loader,
    uninitialized: AlertCircle,
    failed: AlertCircle,
  } as const;

  const tone = statusTone[data?.status as keyof typeof statusTone] || "red";
  const IconComponent = statusIcon[data?.status as keyof typeof statusIcon] || AlertCircle;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing Integration Status</CardTitle>
      </CardHeader>
      <div className="space-y-4 p-4">
        {/* Main Status */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconComponent className={`h-5 w-5 text-${tone}-400`} />
              <div>
                <p className="text-sm text-zinc-400">Subscription Status</p>
                <p className="text-lg font-semibold capitalize">{data?.status}</p>
              </div>
            </div>
            <Badge tone={tone as any} className="capitalize">
              {data?.status}
            </Badge>
          </div>
        </div>

        {/* Plan Info */}
        {data?.planTier && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-zinc-500">Current Plan</p>
              <p className="mt-1 font-semibold capitalize">{data.planTier}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-zinc-500">Plan Tier</p>
              <p className="mt-1 font-semibold">{companyData?.company.planTier || "-"}</p>
            </div>
          </div>
        )}

        {/* Subscription IDs */}
        {(data?.subscriptionId || data?.customerId) && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-semibold text-zinc-400">Dodo References</p>
            {data?.customerId && (
              <div className="font-mono text-xs">
                <p className="text-zinc-500">Customer ID</p>
                <p className="text-zinc-200 break-all">{data.customerId}</p>
              </div>
            )}
            {data?.subscriptionId && (
              <div className="font-mono text-xs mt-2">
                <p className="text-zinc-500">Subscription ID</p>
                <p className="text-zinc-200 break-all">{data.subscriptionId}</p>
              </div>
            )}
          </div>
        )}

        {/* Webhook Sync Status */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              <p className="text-xs font-medium text-zinc-400">Webhook Sync</p>
            </div>
            <Badge tone={companyData?.billing.webhookSync === "confirmed" ? "emerald" : "amber"}>
              {companyData?.billing.webhookSync || "pending"}
            </Badge>
          </div>
          {companyData?.billing.latestEventAt && (
            <p className="mt-2 text-xs text-zinc-500">
              Last sync: {new Date(companyData.billing.latestEventAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Latest Payment */}
        {data?.latestPaymentStatus && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-semibold text-zinc-400 mb-2">Latest Payment</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Status:</span>
                <Badge tone={data.latestPaymentStatus === "paid" ? "emerald" : "amber"}>
                  {data.latestPaymentStatus}
                </Badge>
              </div>
              {data.latestPaymentAmount && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Amount:</span>
                  <span className="font-semibold">
                    ${(data.latestPaymentAmount / 100).toFixed(2)} {data.latestPaymentCurrency || "USD"}
                  </span>
                </div>
              )}
              {data.latestPaymentAt && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Date:</span>
                  <span className="text-xs">{new Date(data.latestPaymentAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Discrepancies */}
        {data?.discrepancies && data.discrepancies.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-xs font-semibold text-amber-200 mb-2">Discrepancies Detected</p>
            <ul className="space-y-1 text-xs text-amber-100">
              {data.discrepancies.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Next Steps */}
        {data?.nextSteps && data.nextSteps.length > 0 && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
            <p className="text-xs font-semibold text-blue-200 mb-2">Recommended Actions</p>
            <ul className="space-y-1 text-xs text-blue-100">
              {data.nextSteps.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Billing Portal */}
        {data?.customerId && (
          <Link
            href={`https://checkout.dodopayments.com/portal/${data.customerId}`}
            target="_blank"
            className="block w-full rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-center text-sm font-medium text-violet-200 hover:bg-violet-500/20 transition-colors"
          >
            <div className="flex items-center justify-center gap-2">
              <Zap className="h-4 w-4" />
              Manage Subscription
              <ExternalLink className="h-3 w-3" />
            </div>
          </Link>
        )}
      </div>
    </Card>
  );
}
