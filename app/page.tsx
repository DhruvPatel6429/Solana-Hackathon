import Link from "next/link";
import { Check, Play, Zap } from "lucide-react";
import { FadeIn } from "@/components/animated";
import { ParticleBackground } from "@/components/particle-background";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const features = [
  ["Instant Settlement", "Solana-speed USDC payouts with proof in seconds."],
  ["220+ Countries via Dodo", "Subscription and payment rails for a global customer base."],
  ["On-chain Audit Trail", "Every release, batch, and escrow movement is inspectable."],
  ["Automated Invoice Approval", "Rules handle small invoices while finance reviews exceptions."],
  ["Live FX Visibility", "Track USDC conversion exposure before contractors cash out."],
  ["Treasury Analytics", "Understand spend velocity by team, contractor, and currency."],
];

const pricing = [
  { name: "Starter", price: "$49/mo", items: ["5 contractors", "USDC treasury", "CSV exports"] },
  { name: "Growth", price: "$149/mo", items: ["50 contractors", "Batch payouts", "Dodo usage billing"] },
  { name: "Enterprise", price: "Custom", items: ["Custom limits", "Dedicated compliance", "Priority settlement ops"] },
];

export default function LandingPage() {
  return (
    <main>
      <section className="relative grid min-h-screen overflow-hidden px-6 py-10">
        <ParticleBackground />
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3 font-bold">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-violet-600 violet-glow">B</span>
            Borderless
          </Link>
          <div className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link href="/dashboard">Dashboard</Link>
          </div>
        </nav>
        <div className="mx-auto grid w-full max-w-5xl place-items-center text-center">
          <FadeIn>
            <Badge tone="violet" className="mb-5">Solana + USDC + Dodo Payments</Badge>
            <h1 className="mx-auto max-w-4xl text-5xl font-extrabold tracking-normal text-white md:text-7xl">
              Pay Your Global Team in Seconds. Not Days.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-300">
              One USDC treasury. Instant Solana settlement. Zero wire fees.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/onboarding"><Button size="lg">Start Free Trial</Button></Link>
              <Link href="/dashboard"><Button size="lg" variant="ghost"><Play className="h-4 w-4" />Watch Demo</Button></Link>
            </div>
          </FadeIn>
        </div>
        <div className="mx-auto w-full max-w-5xl self-end pb-4">
          <div className="glass-panel rounded-lg px-5 py-4">
            <p className="mb-3 text-center text-xs uppercase tracking-widest text-zinc-500">Trusted by 120+ AI-native teams</p>
            <div className="grid grid-cols-2 gap-3 text-center text-sm text-zinc-400 md:grid-cols-5">
              {["NEURAL", "PROMPTIQ", "VECTOR", "ATLAS", "AGENTOS"].map((logo) => <span key={logo} className="rounded border border-white/10 py-3">{logo}</span>)}
            </div>
          </div>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="metric-label">Command center</p>
            <h2 className="mt-2 text-3xl font-bold">A treasury OS for remote teams</h2>
          </div>
          <Zap className="hidden h-10 w-10 text-emerald-400 md:block" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map(([title, body], index) => (
            <FadeIn key={title} delay={index * 0.03}>
              <Card className="min-h-44">
                <div className="mb-5 h-10 w-10 rounded bg-violet-500/15 text-2xl">{"* "}</div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{body}</p>
              </Card>
            </FadeIn>
          ))}
        </div>
      </section>
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-20">
        <p className="metric-label text-center">Pricing</p>
        <h2 className="mt-2 text-center text-3xl font-bold">Start with Dodo-hosted billing</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {pricing.map((tier) => (
            <Card key={tier.name} className={tier.name === "Growth" ? "violet-glow" : ""}>
              <h3 className="text-xl font-semibold">{tier.name}</h3>
              <p className="mt-4 text-4xl font-bold">{tier.price}</p>
              <ul className="my-6 space-y-3 text-sm text-zinc-300">
                {tier.items.map((item) => <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" />{item}</li>)}
              </ul>
              <Link href={`/onboarding?tier=${tier.name.toLowerCase()}`}><Button className="w-full">Subscribe Now</Button></Link>
            </Card>
          ))}
        </div>
      </section>
      <footer className="border-t border-white/10 px-6 py-8 text-center text-sm text-zinc-500">Borderless Payroll Copilot © 2026</footer>
    </main>
  );
}
