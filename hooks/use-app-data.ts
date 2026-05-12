"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthSession } from "@/lib/auth/client";
import { useAppStore } from "@/lib/store";

export function useTreasuryBalance() {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["treasury"],
    queryFn: api.treasuryBalance,
    enabled: auth.isAuthenticated && !auth.loading,
    refetchInterval: 20_000,
  });
}

export function useContractors() {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["contractors"],
    queryFn: api.contractors,
    enabled: auth.isAuthenticated && !auth.loading,
  });
}

export function useInvoices() {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["invoices"],
    queryFn: api.invoices,
    enabled: auth.isAuthenticated && !auth.loading,
  });
}

export function useFxRates() {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["fx-rates"],
    queryFn: api.fxRates,
    enabled: auth.isAuthenticated && !auth.loading,
    refetchInterval: 60_000,
  });
}

export function useInvoiceActions() {
  const queryClient = useQueryClient();
  const pushToast = useAppStore((state) => state.pushToast);

  const approve = useMutation({
    mutationFn: api.approveInvoice,
    onSuccess: () => {
      pushToast({ type: "success", message: "Invoice approved and queued for payroll." });
      api.reportUsage("invoice", "invoice-approval").catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["treasury"] });
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      queryClient.invalidateQueries({ queryKey: ["company-overview"] });
    },
    onError: (error) => {
      pushToast({
        type: "error",
        message: error instanceof Error ? error.message : "Invoice approval failed.",
      });
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.rejectInvoice(id, reason),
    onSuccess: () => {
      pushToast({ type: "info", message: "Invoice rejected with reason saved." });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error) => {
      pushToast({
        type: "error",
        message: error instanceof Error ? error.message : "Invoice rejection failed.",
      });
    },
  });

  return { approve, reject };
}

export function useExecutePayouts() {
  const pushToast = useAppStore((state) => state.pushToast);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.executePayouts,
    onSuccess: (data) => {
      api.reportUsage("payout", data.txSignature).catch(() => undefined);
      pushToast({ type: "success", message: `Batch payout executed: ${data.txSignature.slice(0, 8)}...` });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["treasury"] });
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      queryClient.invalidateQueries({ queryKey: ["company-overview"] });
    },
    onError: (error) => {
      pushToast({
        type: "error",
        message: error instanceof Error ? error.message : "Batch payout failed.",
      });
    },
  });
}
