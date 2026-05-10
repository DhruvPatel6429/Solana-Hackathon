"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState } from "react";

type WalletRuntimeState = {
  connected: boolean;
  publicKey: string | null;
  walletName: string | null;
};

const WalletRuntimeContext = createContext<WalletRuntimeState>({
  connected: false,
  publicKey: null,
  walletName: null,
});

export function useWalletRuntime() {
  return useContext(WalletRuntimeContext);
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );
  const walletRuntime = useMemo<WalletRuntimeState>(
    () => ({
      connected: false,
      publicKey: null,
      walletName: "Adapter not configured",
    }),
    [],
  );

  return (
    <WalletRuntimeContext.Provider value={walletRuntime}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WalletRuntimeContext.Provider>
  );
}
