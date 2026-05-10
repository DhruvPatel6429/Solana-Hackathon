"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Check,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  Globe2,
  Landmark,
  LockKeyhole,
  Play,
  RadioTower,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react";
import { FadeIn } from "@/components/animated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ParticleBackground = dynamic(
  () => import("@/components/particle-background").then((module) => module.ParticleBackground),
  { ssr: false },
);

const proofStats = [
  ["2.1s", "median Solana settlement"],
  ["0", "wire fees per batch"],
  ["220+", "countries via Dodo rails"],
  ["100%", "auditable payout trail"],
];

const features = [
  { icon: Zap, title: "Instant Settlement", body: "Execute a batch and hand every contractor a devnet proof link before the finance meeting ends." },
  { icon: Globe2, title: "220+ Countries via Dodo", body: "Sell subscriptions globally while contractors choose USDC wallet or local currency off-ramp." },
  { icon: LockKeyhole, title: "On-chain Audit Trail", body: "Invoice approval, escrow release, payout hash, and billing usage events stay connected." },
  { icon: FileCheck2, title: "Automated Invoice Approval", body: "Route high-value invoices to humans and let rules approve routine contractor work." },
  { icon: CircleDollarSign, title: "Live FX Visibility", body: "Track USDC to USD, EUR, INR, BRL, and PHP with 60-second refresh and usage metering." },
  { icon: ShieldCheck, title: "Treasury Analytics", body: "Monitor spend velocity, currency mix, approval lag, and treasury runway from one cockpit." },
];

const flow = [
  ["Subscribe", "Company starts on a Dodo hosted checkout session."],
  ["Fund", "Treasury receives USDC into a Solana wallet."],
  ["Approve", "Invoices move through policy checks and admin review."],
  ["Settle", "Batch payout executes and stores on-chain proof."],
];

const integrations = [
  { label: "Dodo checkout", icon: Landmark },
  { label: "USDC treasury", icon: WalletCards },
  { label: "Solana proof", icon: Banknote },
  { label: "Compliance export", icon: ShieldCheck },
];

const pricing = [
  { name: "Starter", price: "$49/mo", accent: "For the first global team", items: ["5 contractors", "USDC treasury", "CSV exports", "Dodo checkout"] },
  { name: "Growth", price: "$149/mo", accent: "Best for serious operators", items: ["50 contractors", "Batch payouts", "Usage billing", "Compliance ledger"] },
  { name: "Enterprise", price: "Custom", accent: "For scaled finance teams", items: ["Custom limits", "Dedicated compliance", "Priority settlement ops", "Private deployment"] },
];

export default function LandingPage() {
  return (
    <main className="overflow-hidden">
      <section className="relative min-h-screen px-6 py-8">
        <ParticleBackground />
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3 font-bold">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-violet-600 violet-glow">B</span>
            Borderless
          </Link>
          <div className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
            <a href="#proof">Proof</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link href="/dashboard">Dashboard</Link>
          </div>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              Open demo
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </nav>

        <div className="mx-auto grid min-h-[calc(100vh-72px)] w-full max-w-7xl items-center gap-10 py-14 lg:grid-cols-[0.92fr_1.08fr]">
          <FadeIn>
            <Badge tone="violet" className="mb-5">
              <Sparkles className="mr-1 h-3 w-3" />
              Solana + USDC + Dodo Payments
            </Badge>
            <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-normal text-white md:text-7xl">
              Pay Your Global Team in Seconds. Not Days.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
              Borderless Payroll Copilot gives finance teams one USDC treasury, instant Solana settlement, Dodo-powered SaaS billing, and an audit trail judges can click.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/onboarding">
                <Button size="lg">
                  Start Free Trial
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="ghost">
                  <Play className="h-4 w-4" />
                  Watch Demo
                </Button>
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              {proofStats.map(([value, label]) => (
                <div key={label} className="glass-panel rounded-lg p-4">
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-zinc-500">{label}</p>
                </div>
              ))}
            </div>
          </FadeIn>

          <FadeIn delay={0.08}>
            <div className="hero-console gradient-border rounded-lg p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="metric-label">Live treasury cockpit</p>
                  <p className="mt-1 text-xl font-bold">Growth plan demo company</p>
                </div>
                <Badge tone="emerald">Devnet live</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/20 p-4 md:col-span-2">
                  <p className="metric-label">Treasury balance</p>
                  <p className="mt-3 text-5xl font-extrabold">184,250.75</p>
                  <p className="mt-2 text-sm text-emerald-300">USDC ready for contractor payouts</p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {["USDC funded", "Rules checked", "Batch queued"].map((item) => (
                      <div key={item} className="rounded border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                        <Check className="mr-1 inline h-3 w-3" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="metric-label">Dodo billing</p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-3 text-sm"><BadgeCheck className="h-4 w-4 text-emerald-300" /> Subscription active</div>
                    <div className="flex items-center gap-3 text-sm"><RadioTower className="h-4 w-4 text-violet-300" /> Usage metered</div>
                    <div className="flex items-center gap-3 text-sm"><ShieldCheck className="h-4 w-4 text-sky-300" /> Webhook verified</div>
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="metric-label">Batch payout route</p>
                  <span className="text-xs text-zinc-500">Estimated gas 0.00021 SOL</span>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  {flow.map(([title, body], index) => (
                    <div key={title} className="relative rounded-lg bg-white/[0.04] p-4">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-600 text-xs font-bold">{index + 1}</span>
                      <h3 className="mt-4 font-semibold">{title}</h3>
                      <p className="mt-2 text-xs leading-5 text-zinc-400">{body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <section id="proof" className="border-y border-white/10 bg-white/[0.025] px-6 py-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-[1fr_2fr] md:items-center">
          <div>
            <p className="metric-label">Judge-ready proof</p>
            <h2 className="mt-2 text-2xl font-bold">Not a landing page. A working treasury flow.</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center text-sm text-zinc-400 md:grid-cols-5">
            {["SOLANA", "USDC", "DODO", "PRISMA", "RECHARTS"].map((logo) => (
              <span key={logo} className="rounded-lg border border-white/10 bg-black/20 py-4 font-semibold tracking-widest">
                {logo}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="metric-label">Command center</p>
            <h2 className="mt-2 max-w-2xl text-4xl font-bold">Everything a finance admin needs to approve, settle, and prove payroll.</h2>
          </div>
          <Zap className="hidden h-10 w-10 text-emerald-400 md:block" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <FadeIn key={feature.title} delay={index * 0.03}>
                <Card className="group min-h-56 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-violet-950/30">
                  <div className="mb-5 grid h-11 w-11 place-items-center rounded-lg bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/20">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{feature.body}</p>
                </Card>
              </FadeIn>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <p className="metric-label">Settlement narrative</p>
            <h2 className="mt-2 text-3xl font-bold">A full demo loop in under three minutes.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {flow.map(([title, body], index) => (
                <div key={title} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <span className="text-sm text-violet-300">0{index + 1}</span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <p className="metric-label">Integrations</p>
            <div className="mt-5 space-y-4">
              {integrations.map((item) => {
                const TypedIcon = item.icon;
                return (
                  <div key={item.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span className="flex items-center gap-3 text-sm"><TypedIcon className="h-4 w-4 text-violet-300" />{item.label}</span>
                    <Badge tone="emerald">Ready</Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-6 py-20">
        <p className="metric-label text-center">Pricing</p>
        <h2 className="mt-2 text-center text-4xl font-bold">Dodo-backed billing from day one.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {pricing.map((tier) => (
            <Card key={tier.name} className={tier.name === "Growth" ? "violet-glow scale-[1.02]" : ""}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{tier.name}</h3>
                {tier.name === "Growth" && <Badge tone="violet">Popular</Badge>}
              </div>
              <p className="mt-2 text-sm text-zinc-400">{tier.accent}</p>
              <p className="mt-6 text-4xl font-bold">{tier.price}</p>
              <ul className="my-6 space-y-3 text-sm text-zinc-300">
                {tier.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href={`/onboarding?tier=${tier.name.toLowerCase()}`}>
                <Button className="w-full">Subscribe Now</Button>
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-sm text-zinc-500">
        Borderless Payroll Copilot - 2026
      </footer>
    </main>
  );
}
