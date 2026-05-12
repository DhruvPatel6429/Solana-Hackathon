"use client";

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { getRequiredAuthHeaders } from "@/lib/auth/client";

type DemoSeedResponse = {
  success: boolean;
  summary: {
    company: { id: string; name: string; created: boolean };
    contractors: { created: number; existing: number; total: number };
    invoices: { created: number; existing: number; total: number };
  };
};

type InvoiceListResponse = {
  invoices: Array<{ id: string }>;
};

type InvoiceApproveResponse = {
  success: boolean;
  txHash?: string;
  txSignature?: string;
  payout?: {
    solanaTxSignature?: string;
  };
};

type SubmitInvoiceResponse = {
  success: boolean;
  invoice: {
    id: string;
    status: string;
    submittedAt: string;
  };
};

type StatusLogEntry = {
  id: string;
  timestamp: string;
  symbol: "✓" | "✗" | "⚠";
  message: string;
  txSignature?: string;
  txUrl?: string;
};

const isJudgeModeEnabled = process.env.NEXT_PUBLIC_JUDGE_MODE === "true";

function shortTx(signature: string): string {
  if (signature.length <= 12) {
    return signature;
  }
  return `${signature.slice(0, 3)}x...${signature.slice(-3)}`;
}

export function JudgeDemoPanel() {
  const [logs, setLogs] = useState<StatusLogEntry[]>([]);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const isBusy = activeAction !== null;

  const appendLog = useCallback(
    (
      message: string,
      options?: {
        symbol?: StatusLogEntry["symbol"];
        txSignature?: string;
        txUrl?: string;
      },
    ) => {
      const timestamp = new Date().toLocaleTimeString("en-GB", { hour12: false });
      setLogs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          timestamp,
          symbol: options?.symbol ?? "✓",
          message,
          txSignature: options?.txSignature,
          txUrl: options?.txUrl,
        },
      ]);
    },
    [],
  );

  const runJsonRequest = useCallback(async <T,>(
    url: string,
    init?: RequestInit,
  ): Promise<T> => {
    const authHeaders = await getRequiredAuthHeaders();
    const response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage =
        typeof payload?.error === "string"
          ? payload.error
          : `Request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return payload as T;
  }, []);

  const fetchFirstPendingInvoice = useCallback(async (): Promise<string | null> => {
    const data = await runJsonRequest<InvoiceListResponse>(
      "/api/invoices?status=PENDING&page=1&pageSize=1",
    );
    return data.invoices[0]?.id ?? null;
  }, [runJsonRequest]);

  const actions = useMemo(
    () => ({
      seedDemoData: async () => {
        setActiveAction("seed");
        try {
          const result = await runJsonRequest<DemoSeedResponse>("/api/demo/seed", {
            method: "POST",
          });
          appendLog(
            `Seed complete. Company ${result.summary.company.created ? "created" : "exists"}; contractors +${result.summary.contractors.created}, invoices +${result.summary.invoices.created}.`,
          );
        } catch (error) {
          appendLog(
            `Seed failed: ${error instanceof Error ? error.message : String(error)}`,
            { symbol: "✗" },
          );
        } finally {
          setActiveAction(null);
        }
      },
      submitInvoice: async () => {
        setActiveAction("submit");
        try {
          const result = await runJsonRequest<SubmitInvoiceResponse>(
            "/api/demo/submit-invoice",
            { method: "POST" },
          );
          appendLog(
            `Invoice ${result.invoice.id} marked as submitted (status: ${result.invoice.status}).`,
          );
        } catch (error) {
          appendLog(
            `Submit failed: ${error instanceof Error ? error.message : String(error)}`,
            { symbol: "✗" },
          );
        } finally {
          setActiveAction(null);
        }
      },
      approveAndReleaseEscrow: async () => {
        setActiveAction("approve");
        try {
          const invoiceId = await fetchFirstPendingInvoice();
          if (!invoiceId) {
            appendLog("No pending invoice found to approve.", { symbol: "⚠" });
            return;
          }

          const result = await runJsonRequest<InvoiceApproveResponse>(
            `/api/invoices/${invoiceId}/approve`,
            {
              method: "PATCH",
            },
          );
          const txSignature =
            result.txSignature ?? result.txHash ?? result.payout?.solanaTxSignature;

          if (!txSignature) {
            appendLog(`Invoice ${invoiceId} approved.`);
            return;
          }

          const txUrl = `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`;
          appendLog(`Invoice approved. TX: ${shortTx(txSignature)}`, {
            txSignature,
            txUrl,
          });
        } catch (error) {
          appendLog(
            `Approve failed: ${error instanceof Error ? error.message : String(error)}`,
            { symbol: "✗" },
          );
        } finally {
          setActiveAction(null);
        }
      },
      downloadAuditCsv: async () => {
        setActiveAction("audit");
        try {
            const authHeaders = await getRequiredAuthHeaders();
            const response = await fetch("/api/audit/export?format=csv", {
            method: "GET",
            headers: {
                ...authHeaders,
            },
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const message =
              typeof payload?.error === "string"
                ? payload.error
                : `Request failed with status ${response.status}`;
            throw new Error(message);
          }

          const content = await response.text();
          const blob = new Blob([content], { type: "text/csv; charset=utf-8" });
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          const filename = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
          link.href = objectUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);

          appendLog(`Audit CSV downloaded: ${filename}.`);
        } catch (error) {
          appendLog(
            `Audit export failed: ${error instanceof Error ? error.message : String(error)}`,
            { symbol: "✗" },
          );
        } finally {
          setActiveAction(null);
        }
      },
    }),
    [appendLog, fetchFirstPendingInvoice, runJsonRequest],
  );

  if (!isJudgeModeEnabled) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Judge Demo</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        <Button onClick={actions.seedDemoData} disabled={isBusy}>
          Seed Demo Data
        </Button>
        <Button onClick={actions.submitInvoice} disabled={isBusy}>
          Submit Invoice
        </Button>
        <Button onClick={actions.approveAndReleaseEscrow} disabled={isBusy}>
          Approve + Release Escrow
        </Button>
        <Button onClick={actions.downloadAuditCsv} disabled={isBusy}>
          Download Audit CSV
        </Button>
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-zinc-900 p-4">
        <p className="metric-label mb-3">Status log</p>
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">No actions run yet.</p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-2">
            {logs.map((entry) => (
              <p key={entry.id} className="text-sm text-zinc-200">
                {entry.symbol} {entry.timestamp} — {entry.message}
                {entry.txUrl ? (
                  <>
                    {" "}
                    →{" "}
                    <a
                      href={entry.txUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-300 underline"
                    >
                      View on Explorer
                    </a>
                  </>
                ) : null}
              </p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
