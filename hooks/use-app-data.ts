"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";

export function useTreasuryBalance() {
  return useQuery({ queryKey: ["treasury"], queryFn: api.treasuryBalance });
}

export function useContractors() {
  return useQuery({ queryKey: ["contractors"], queryFn: api.contractors });
}

export function useInvoices() {
  return useQuery({ queryKey: ["invoices"], queryFn: api.invoices });
}

export function useFxRates() {
  return useQuery({ queryKey: ["fx-rates"], queryFn: api.fxRates, refetchInterval: 60_000 });
}

export function useInvoiceActions() {
  const queryClient = useQueryClient();
  const pushToast = useAppStore((state) => state.pushToast);

  const approve = useMutation({
    mutationFn: api.approveInvoice,
    onSuccess: () => {
      pushToast({ type: "success", message: "Invoice approved and escrow release queued." });
      api.reportUsage("invoice", "invoice-approval").catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.rejectInvoice(id, reason),
    onSuccess: () => {
      pushToast({ type: "info", message: "Invoice rejected with reason saved." });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return { approve, reject };
}

export function useExecutePayouts() {
  const pushToast = useAppStore((state) => state.pushToast);
  return useMutation({
    mutationFn: api.executePayouts,
    onSuccess: (data) => {
      api.reportUsage("payout", data.txSignature).catch(() => undefined);
      pushToast({ type: "success", message: `Batch payout executed: ${data.txSignature.slice(0, 8)}...` });
    },
  });
}
