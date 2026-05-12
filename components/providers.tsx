"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthProvider } from "@/lib/auth/client";

type WalletRuntimeState = {
  connected: boolean;
  publicKey: string | null;
  walletName: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toBase58(): string } }>;
  disconnect: () => Promise<void>;
  on: (event: "connect" | "disconnect" | "accountChanged", handler: (publicKey?: { toBase58(): string } | null) => void) => void;
  off: (event: "connect" | "disconnect" | "accountChanged", handler: (publicKey?: { toBase58(): string } | null) => void) => void;
};

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider;
    };
    solana?: PhantomProvider;
  }
}

const WalletRuntimeContext = createContext<WalletRuntimeState>({
  connected: false,
  publicKey: null,
  walletName: null,
  connecting: false,
  connect: async () => undefined,
  disconnect: async () => undefined,
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
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>("Phantom");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const provider = window.phantom?.solana ?? window.solana;
    if (!provider?.isPhantom) {
      setWalletName("Phantom not detected");
      return;
    }

    const syncPublicKey = (nextPublicKey?: { toBase58(): string } | null) => {
      const address = nextPublicKey?.toBase58() ?? provider.publicKey?.toBase58() ?? null;
      setPublicKey(address);
      setWalletName("Phantom");
    };

    provider.connect({ onlyIfTrusted: true }).then(({ publicKey: trustedKey }) => {
      syncPublicKey(trustedKey);
    }).catch(() => undefined);

    const handleConnect = (nextPublicKey?: { toBase58(): string } | null) => {
      syncPublicKey(nextPublicKey);
      setConnecting(false);
    };
    const handleDisconnect = () => {
      setPublicKey(null);
      setConnecting(false);
    };

    provider.on("connect", handleConnect);
    provider.on("accountChanged", handleConnect);
    provider.on("disconnect", handleDisconnect);

    return () => {
      provider.off("connect", handleConnect);
      provider.off("accountChanged", handleConnect);
      provider.off("disconnect", handleDisconnect);
    };
  }, []);

  const walletRuntime = useMemo<WalletRuntimeState>(() => {
    const provider =
      typeof window === "undefined" ? undefined : window.phantom?.solana ?? window.solana;

    return {
      connected: Boolean(publicKey),
      publicKey,
      walletName,
      connecting,
      connect: async () => {
        if (!provider?.isPhantom) {
          throw new Error("Phantom wallet is not available in this browser.");
        }

        setConnecting(true);
        try {
          const response = await provider.connect();
          setPublicKey(response.publicKey?.toBase58() ?? provider.publicKey?.toBase58() ?? null);
          setWalletName("Phantom");
        } finally {
          setConnecting(false);
        }
      },
      disconnect: async () => {
        if (!provider?.isPhantom) {
          setPublicKey(null);
          return;
        }

        await provider.disconnect();
        setPublicKey(null);
      },
    };
  }, [connecting, publicKey, walletName]);

  return (
    <AuthProvider>
      <WalletRuntimeContext.Provider value={walletRuntime}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WalletRuntimeContext.Provider>
    </AuthProvider>
  );
}
