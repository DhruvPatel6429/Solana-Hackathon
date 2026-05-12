"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, ExternalLink, Landmark, RadioTower } from "lucide-react";

import { FadeIn } from "@/components/animated";
import { AdminAuthCard } from "@/components/admin-auth-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuthSession } from "@/lib/auth/client";
import { getSolanaAddressUrl } from "@/lib/solana/explorer";
import { useAppStore } from "@/lib/store";
import { formatUSDC, truncateHash } from "@/lib/utils";

const STORAGE_KEY = "bp_onboarding_state_v1";
const tiers = ["Starter", "Growth", "Enterprise"] as const;
const totalSteps = 4;

type OnboardingState = {
  step: number;
  companyName: string;
  companySize: string;
  industry: string;
  selectedPlan: string;
  checkoutCompleted: boolean;
  threshold: number;
  autoApprove: boolean;
  payoutPreference: string;
  completed: boolean;
};

const defaultState: OnboardingState = {
  step: 1,
  companyName: "",
  companySize: "",
  industry: "",
  selectedPlan: "",
  checkoutCompleted: false,
  threshold: 2500,
  autoApprove: true,
  payoutPreference: "stable",
  completed: false,
};

function readStoredState(): OnboardingState {
  if (typeof window === "undefined") {
    return defaultState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }

    return { ...defaultState, ...(JSON.parse(raw) as Partial<OnboardingState>) };
  } catch {
    return defaultState;
  }
}

function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pushToast = useAppStore((state) => state.pushToast);
  const auth = useAuthSession();
  const [state, setState] = useState<OnboardingState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [checkoutLoadingTier, setCheckoutLoadingTier] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const nextState = readStoredState();
    setState(nextState);
    setHydrated(true);

  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const overviewQuery = useQuery({
    queryKey: ["company-overview", "onboarding"],
    queryFn: api.companyOverview,
    enabled: hydrated && auth.isAuthenticated && !auth.loading,
    refetchInterval: 15_000,
    retry: 0,
  });

  const checkoutTier = searchParams.get("checkout");
  const checkoutProvider = searchParams.get("provider");

  useEffect(() => {
    if (!hydrated || !checkoutTier || !checkoutProvider) {
      return;
    }

    const normalizedTier =
      tiers.find((tier) => tier.toLowerCase() === checkoutTier.toLowerCase()) ?? state.selectedPlan;
    setState((current) => ({
      ...current,
      selectedPlan: normalizedTier,
      checkoutCompleted: true,
      step: Math.max(current.step, 3),
    }));
    pushToast({
      type: "success",
      message: `${normalizedTier} billing checkout confirmed.`,
    });
  }, [checkoutProvider, checkoutTier, hydrated, pushToast, state.selectedPlan]);

  const treasuryWallet =
    overviewQuery.data?.company.treasuryWalletAddress ??
    overviewQuery.data?.treasury.walletAddress ?? "";
  const treasuryBalance = overviewQuery.data?.treasury.balanceUsdc ?? overviewQuery.data?.company.treasuryBalanceUsdc ?? 0;
  const treasuryFundingReady = treasuryBalance > 0;
  const canAdvanceFromStep1 =
    state.companyName.trim().length > 1 && state.companySize.trim() && state.industry.trim();
  const canAdvanceFromStep2 = Boolean(state.selectedPlan) && state.checkoutCompleted;
  const canAdvanceFromStep3 = Boolean(treasuryWallet);
  const canAdvanceFromStep4 = !submitting;

  const continueDisabled = useMemo(() => {
    if (submitting) return true;
    if (state.step === 1) return !canAdvanceFromStep1;
    if (state.step === 2) return !canAdvanceFromStep2;
    if (state.step === 3) return !canAdvanceFromStep3;
    return !canAdvanceFromStep4;
  }, [canAdvanceFromStep1, canAdvanceFromStep2, canAdvanceFromStep3, canAdvanceFromStep4, state.step, submitting]);

  async function checkout(tier: string) {
    if (checkoutLoadingTier || submitting) {
      return;
    }

    try {
      setCheckoutLoadingTier(tier);
      setState((current) => ({ ...current, selectedPlan: tier }));
      const result = await api.checkout(tier);
      pushToast({ type: "info", message: `Redirecting to ${tier} checkout.` });
      window.location.href = result.url;
    } catch (error) {
      pushToast({
        type: "error",
        message: error instanceof Error ? error.message : `Failed to start ${tier} checkout.`,
      });
    } finally {
      setCheckoutLoadingTier(null);
    }
  }

  function goBack() {
    setState((current) => ({ ...current, step: Math.max(1, current.step - 1) }));
  }

  function goForward() {
    setState((current) => ({ ...current, step: Math.min(totalSteps, current.step + 1) }));
  }

  async function finishOnboarding() {
    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);
      if (!auth.isAuthenticated) {
        throw new Error("Admin session is required to finish onboarding.");
      }

      await api.signup({
        companyName: state.companyName.trim(),
        planTier: state.selectedPlan || "Growth",
      });

      const nextState = { ...state, completed: true, step: totalSteps };
      setState(nextState);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      pushToast({ type: "success", message: "Company onboarding completed." });
      router.push("/dashboard?onboarding=complete");
    } catch (error) {
      pushToast({
        type: "error",
        message: error instanceof Error ? error.message : "Onboarding completion failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <main className="mx-auto grid min-h-[70vh] max-w-5xl place-items-center px-6 py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <FadeIn>
        <p className="metric-label">Company onboarding</p>
        <h1 className="mt-2 text-4xl font-bold">Launch your payroll treasury</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          Complete billing, treasury funding, and payout policy setup without leaving the product flow.
        </p>
        <Progress value={(state.step / totalSteps) * 100} className="mt-8" />
      </FadeIn>
      <Card className="mt-8">
        {state.step === 1 && (
          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                placeholder="Company name"
                value={state.companyName}
                onChange={(event) => setState((current) => ({ ...current, companyName: event.target.value }))}
              />
              <Select
                value={state.companySize}
                onChange={(event) => setState((current) => ({ ...current, companySize: event.target.value }))}
              >
                <option value="" disabled>Company size</option>
                <option>1-10</option>
                <option>11-50</option>
                <option>51-200</option>
                <option>200+</option>
              </Select>
              <Select
                className="md:col-span-2"
                value={state.industry}
                onChange={(event) => setState((current) => ({ ...current, industry: event.target.value }))}
              >
                <option value="" disabled>Industry</option>
                <option>AI SaaS</option>
                <option>Developer tools</option>
                <option>Creative services</option>
                <option>Financial infrastructure</option>
              </Select>
            </div>
            <AdminAuthCard
              companyName={state.companyName}
              planTier={state.selectedPlan || "Growth"}
              onAuthenticated={() => {
                overviewQuery.refetch();
              }}
            />
          </div>
        )}

        {state.step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              {tiers.map((tier) => {
                const selected = state.selectedPlan === tier;
                const loading = checkoutLoadingTier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => checkout(tier)}
                    disabled={checkoutLoadingTier !== null || submitting}
                    className={`rounded-lg border p-5 text-left transition ${
                      selected
                        ? "border-violet-400 bg-violet-500/10 shadow-[0_0_0_1px_rgba(167,139,250,0.35)]"
                        : "border-white/10 bg-white/5 hover:border-violet-400"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{tier}</h3>
                        <p className="mt-2 text-sm text-zinc-400">Powered by Dodo Payments</p>
                      </div>
                      {selected && state.checkoutCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                      ) : null}
                    </div>
                    <ul className="mt-5 space-y-2 text-sm text-zinc-300">
                      <li>Hosted checkout</li>
                      <li>Subscription webhooks</li>
                      <li>Usage reporting</li>
                    </ul>
                    <p className="mt-5 text-xs text-violet-300">
                      {loading
                        ? "Opening checkout..."
                        : selected && state.checkoutCompleted
                          ? "Checkout completed"
                          : "Select plan"}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
              {state.checkoutCompleted
                ? `Billing activated on ${state.selectedPlan}. Continue to treasury funding.`
                : "Select a plan to launch the hosted Dodo checkout. After returning, this step unlocks automatically."}
            </div>
          </div>
        )}

        {state.step === 3 && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="metric-label">Treasury wallet</p>
                  <p className="mt-1 text-sm text-zinc-400">Send devnet USDC here to activate payroll settlement.</p>
                </div>
                <a
                  href={getSolanaAddressUrl(treasuryWallet)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-violet-300"
                >
                  Explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(treasuryWallet)}`}
                alt="Treasury wallet QR code"
                className="mb-4 h-32 w-32 rounded-lg border border-white/10 bg-white p-2"
              />
              <p className="break-all font-mono text-sm text-zinc-300">{treasuryWallet}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  className="min-w-40"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(treasuryWallet)}
                >
                  <Copy className="h-4 w-4" />
                  Copy address
                </Button>
                <Button
                  className="min-w-40"
                  variant="secondary"
                  onClick={() => overviewQuery.refetch()}
                  disabled={overviewQuery.isFetching}
                >
                  <RadioTower className="h-4 w-4" />
                  {overviewQuery.isFetching ? "Refreshing..." : "Refresh balance"}
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="metric-label">Funding status</p>
                  <h3 className="mt-2 text-xl font-semibold">
                    {treasuryFundingReady ? formatUSDC(treasuryBalance) : "Waiting for funding..."}
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400">
                    {overviewQuery.data
                      ? "Helius webhooks and live treasury sync will update this balance automatically."
                      : "Sign in as an admin to connect this onboarding flow to real company treasury, billing, and webhook data."}
                  </p>
                </div>
                <Landmark className="h-10 w-10 text-emerald-300" />
              </div>
              <div className="mt-5 space-y-3">
                <div className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Webhook sync</span>
                    <span className="font-medium capitalize">{overviewQuery.data?.treasury.webhookSync ?? "pending"}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Last treasury update</span>
                    <span>{overviewQuery.data?.treasury.updatedAt ? new Date(overviewQuery.data.treasury.updatedAt).toLocaleString() : "Awaiting first sync"}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm">
                  <p className="mb-2 text-zinc-400">Latest treasury transactions</p>
                  <div className="space-y-2">
                    {(overviewQuery.data?.treasury.latestTransactions ?? []).slice(0, 3).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs">{truncateHash(tx.signature, 8, 6)}</span>
                        <span className={tx.direction === "INCOMING" ? "text-emerald-300" : "text-zinc-300"}>
                          {tx.direction === "INCOMING" ? "+" : "-"}
                          {formatUSDC(tx.amountUsdc)}
                        </span>
                      </div>
                    ))}
                    {!overviewQuery.data?.treasury.latestTransactions.length ? (
                      <p className="text-xs text-zinc-500">No treasury webhook activity yet.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {state.step === 4 && (
          <div className="grid gap-5">
            <label className="text-sm text-zinc-300">
              Approval threshold: {state.threshold.toLocaleString()} USDC
            </label>
            <input
              type="range"
              min="500"
              max="10000"
              step="250"
              value={state.threshold}
              onChange={(event) => setState((current) => ({ ...current, threshold: Number(event.target.value) }))}
            />
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={state.autoApprove}
                onChange={(event) => setState((current) => ({ ...current, autoApprove: event.target.checked }))}
              />
              Auto-approve invoices below threshold
            </label>
            <Select
              value={state.payoutPreference}
              onChange={(event) => setState((current) => ({ ...current, payoutPreference: event.target.value }))}
            >
              <option value="stable">Prefer stablecoin payout</option>
              <option value="local">Prefer local off-ramp</option>
              <option value="manual">Manual FX review</option>
            </Select>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              <p className="font-medium">Ready to launch</p>
              <p className="mt-2">
                Finishing onboarding will persist your company setup and redirect you to the dashboard so treasury, invoices, payouts, and webhook state are visible in one place.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <Button variant="ghost" disabled={state.step === 1 || submitting} onClick={goBack}>
            Back
          </Button>
          <Button
            disabled={continueDisabled}
            onClick={() => {
              if (state.step === totalSteps) {
                finishOnboarding().catch(() => undefined);
                return;
              }

              goForward();
            }}
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                Finishing...
              </>
            ) : state.step === totalSteps ? "Finish" : "Continue"}
          </Button>
        </div>
      </Card>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto grid min-h-[70vh] max-w-5xl place-items-center px-6 py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        </main>
      }
    >
      <OnboardingFlow />
    </Suspense>
  );
}
