"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PaymentHistoryChart } from "@/components/charts";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { invoices } from "@/lib/mock-data";
import { formatUSDC, truncateHash } from "@/lib/utils";

const tone = { Pending: "amber", Approved: "blue", Paid: "emerald", Rejected: "red" } as const;

export default function ContractorPortalPage() {
  const [onboarding, setOnboarding] = useState(false);
  const [step, setStep] = useState(1);
  const [preference, setPreference] = useState("USDC");
  const myInvoices = invoices.filter((invoice) => invoice.contractor === "Maya Chen");

  return (
    <AppShell contractor>
      <div className="space-y-6 px-4 py-6 md:px-8">
        {onboarding ? (
          <Card>
            <p className="metric-label">Contractor onboarding</p>
            <h1 className="mt-2 text-3xl font-bold">Set up your payout profile</h1>
            <Progress value={step * 33.33} className="my-6" />
            {step === 1 && <div className="grid gap-3 md:grid-cols-3"><Input placeholder="Legal name" /><Select><option>IN India</option><option>SG Singapore</option><option>BR Brazil</option><option>PH Philippines</option></Select><Input placeholder="Tax ID" /></div>}
            {step === 2 && <div className="grid gap-4 md:grid-cols-2"><button onClick={() => setPreference("USDC")} className="rounded-lg border border-violet-400 bg-violet-500/10 p-5 text-left"><Wallet className="mb-3 h-8 w-8" />USDC Wallet</button><button onClick={() => setPreference("FIAT")} className="rounded-lg border border-white/10 bg-white/5 p-5 text-left">Local Currency</button>{preference === "USDC" ? <Button>Connect Phantom / Solflare</Button> : <Input placeholder="Bank account number" />}</div>}
            {step === 3 && <div className="rounded-lg border border-white/10 bg-white/5 p-5"><p className="font-medium">Review payout profile</p><p className="mt-2 text-sm text-zinc-400">Maya Chen · Singapore · {preference} payout</p></div>}
            <div className="mt-6 flex justify-between"><Button variant="ghost" disabled={step === 1} onClick={() => setStep(step - 1)}>Back</Button><Button onClick={() => step === 3 ? setOnboarding(false) : setStep(step + 1)}>{step === 3 ? "Confirm" : "Continue"}</Button></div>
          </Card>
        ) : (
          <>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div className="flex items-center gap-4"><Avatar name="Maya Chen" className="h-14 w-14" /><div><p className="metric-label">Contractor portal</p><h1 className="text-3xl font-bold">Welcome back, Maya</h1></div></div>
              <div className="flex gap-3"><Button variant="ghost" onClick={() => setOnboarding(true)}>Edit payout profile</Button><Link href="/contractor/invoices/new"><Button>Submit Invoice</Button></Link></div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card><p className="metric-label">Current balance</p><p className="mt-3 text-4xl font-bold">4,200 USDC</p></Card>
              <Card><p className="metric-label">Last payout</p><p className="mt-3 text-4xl font-bold">3,800 USDC</p></Card>
            </div>
            <Card>
              <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
              <div className="scrollbar-soft overflow-x-auto">
                <Table>
                  <thead><tr><Th>ID</Th><Th>Description</Th><Th>Amount</Th><Th>Status</Th><Th>Proof</Th></tr></thead>
                  <tbody>
                    {myInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <Td>{invoice.id}</Td><Td>{invoice.description}</Td><Td>{formatUSDC(invoice.amount)}</Td><Td><Badge tone={tone[invoice.status]}>{invoice.status}</Badge></Td>
                        <Td>{invoice.txHash ? <Link className="inline-flex items-center gap-1 text-violet-300" href={`https://explorer.solana.com/tx/${invoice.txHash}?cluster=devnet`} target="_blank">{truncateHash(invoice.txHash)}<ExternalLink className="h-3 w-3" /></Link> : "-"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
            <Card><CardHeader><CardTitle>Payment History</CardTitle></CardHeader><PaymentHistoryChart /></Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
