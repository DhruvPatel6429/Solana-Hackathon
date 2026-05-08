"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatUSDC, truncateHash } from "@/lib/utils";

const tone = { Verified: "emerald", Pending: "amber", Rejected: "red" } as const;

export default function CompliancePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [kycStatus, setKycStatus] = useState<"All" | "Verified" | "Pending" | "Rejected">("All");

  const queryParams = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
      kycStatus,
    }),
    [from, to, search, kycStatus],
  );

  const { data: payouts = [] } = useQuery({
    queryKey: ["compliance-payouts", queryParams],
    queryFn: () => api.payouts(queryParams),
  });

  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="metric-label">Compliance</p><h1 className="mt-2 text-3xl font-bold">Audit trail</h1></div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => api.downloadAuditCsv(queryParams)}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button disabled title="PDF export is planned for next sprint.">
              <Download className="h-4 w-4" />
              Export PDF (Soon)
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader><CardTitle>Payout ledger</CardTitle></CardHeader>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            <Input placeholder="Search contractor" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select value={kycStatus} onChange={(event) => setKycStatus(event.target.value as "All" | "Verified" | "Pending" | "Rejected")}>
              <option>All</option>
              <option>Verified</option>
              <option>Pending</option>
              <option>Rejected</option>
            </Select>
          </div>
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
