"use client";

import { useState } from "react";
import { Copy, Landmark, QrCode } from "lucide-react";
import { FadeIn } from "@/components/animated";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { treasury } from "@/lib/mock-data";
import { useAppStore } from "@/lib/store";

const tiers = ["Starter", "Growth", "Enterprise"];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [threshold, setThreshold] = useState(2500);
  const pushToast = useAppStore((state) => state.pushToast);

  async function checkout(tier: string) {
    const result = await api.checkout(tier);
    pushToast({ type: "info", message: `Dodo checkout ready for ${tier}.` });
    window.location.href = result.url;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <FadeIn>
        <p className="metric-label">Company onboarding</p>
        <h1 className="mt-2 text-4xl font-bold">Launch your payroll treasury</h1>
        <Progress value={step * 25} className="mt-8" />
      </FadeIn>
      <Card className="mt-8">
        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Input placeholder="Company name" />
            <Select defaultValue=""><option value="" disabled>Company size</option><option>1-10</option><option>11-50</option><option>51-200</option></Select>
            <Select className="md:col-span-2" defaultValue=""><option value="" disabled>Industry</option><option>AI SaaS</option><option>Developer tools</option><option>Creative services</option></Select>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-4 md:grid-cols-3">
            {tiers.map((tier) => (
              <button key={tier} onClick={() => checkout(tier)} className="rounded-lg border border-white/10 bg-white/5 p-5 text-left transition hover:border-violet-400">
                <h3 className="text-lg font-semibold">{tier}</h3>
                <p className="mt-2 text-sm text-zinc-400">Powered by Dodo Payments</p>
                <ul className="mt-5 space-y-2 text-sm text-zinc-300"><li>Hosted checkout</li><li>Subscription webhooks</li><li>Usage reporting</li></ul>
              </button>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-5">
              <QrCode className="mb-4 h-24 w-24 text-violet-300" />
              <p className="break-all font-mono text-sm text-zinc-300">{treasury.wallet}</p>
              <Button className="mt-4" variant="ghost" onClick={() => navigator.clipboard.writeText(treasury.wallet)}><Copy className="h-4 w-4" />Copy address</Button>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-5">
              <Landmark className="mb-4 h-10 w-10 text-emerald-300" />
              <h3 className="font-semibold">Connect bank account</h3>
              <p className="mt-2 text-sm text-zinc-400">Use ACH or wire rails to mint USDC into your treasury.</p>
              <Button className="mt-6" variant="secondary">Connect bank</Button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="grid gap-5">
            <label className="text-sm text-zinc-300">Approval threshold: {threshold.toLocaleString()} USDC</label>
            <input type="range" min="500" max="10000" step="250" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4" defaultChecked /> Auto-approve invoices below threshold</label>
            <Select defaultValue="stable"><option value="stable">Prefer stablecoin payout</option><option value="local">Prefer local off-ramp</option><option value="manual">Manual FX review</option></Select>
          </div>
        )}
        <div className="mt-8 flex justify-between">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((value) => value - 1)}>Back</Button>
          <Button onClick={() => (step === 4 ? pushToast({ type: "success", message: "Company onboarding completed." }) : setStep((value) => value + 1))}>{step === 4 ? "Finish" : "Continue"}</Button>
        </div>
      </Card>
    </main>
  );
}
