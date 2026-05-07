"use client";

import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { payouts } from "@/lib/mock-data";
import { formatUSDC, truncateHash } from "@/lib/utils";

const tone = { Verified: "emerald", Pending: "amber", Rejected: "red" } as const;

export default function CompliancePage() {
  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="metric-label">Compliance</p><h1 className="mt-2 text-3xl font-bold">Audit trail</h1></div>
          <div className="flex gap-2"><Button variant="ghost"><Download className="h-4 w-4" />Export CSV</Button><Button><Download className="h-4 w-4" />Export PDF</Button></div>
        </div>
        <Card>
          <CardHeader><CardTitle>Payout ledger</CardTitle></CardHeader>
          <div className="mb-4 grid gap-3 md:grid-cols-4"><Input type="date" /><Input type="date" /><Input placeholder="Search contractor" /><Select><option>All KYC statuses</option><option>Verified</option><option>Pending</option><option>Rejected</option></Select></div>
          {payouts.length === 0 ? <EmptyState title="No payouts yet" description="Process your first invoice to see audit trail." /> : (
            <div className="scrollbar-soft overflow-x-auto">
              <Table>
                <thead><tr><Th>#</Th><Th>Contractor</Th><Th>Amount</Th><Th>Currency</Th><Th>Date</Th><Th>Invoice ID</Th><Th>TX Hash</Th><Th>KYC</Th></tr></thead>
                <tbody>
                  {payouts.map((payout, index) => (
                    <tr key={payout.id}><Td>{index + 1}</Td><Td>{payout.contractor}</Td><Td>{formatUSDC(payout.amount)}</Td><Td>{payout.currency}</Td><Td>{payout.date}</Td><Td>{payout.invoiceId}</Td><Td><Link className="inline-flex items-center gap-1 font-mono text-violet-300" href={`https://explorer.solana.com/tx/${payout.txHash}?cluster=devnet`} target="_blank">{truncateHash(payout.txHash)}<ExternalLink className="h-3 w-3" /></Link></Td><Td><Badge tone={tone[payout.kycStatus]}>{payout.kycStatus}</Badge></Td></tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
