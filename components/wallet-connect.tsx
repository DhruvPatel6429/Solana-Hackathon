"use client";

import { useMemo } from "react";
import { ExternalLink, Wallet, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWalletRuntime } from "@/components/providers";
import { getSolanaAddressUrl } from "@/lib/solana/explorer";

function shortAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function WalletConnect() {
  const { connected, publicKey, walletName, connecting, connect, disconnect } = useWalletRuntime();
  const address = useMemo(() => publicKey ?? undefined, [publicKey]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500"
        disabled={connecting}
        onClick={() => {
          if (connected) {
            disconnect().catch(() => undefined);
            return;
          }

          connect().catch((error) => {
            window.alert(error instanceof Error ? error.message : "Wallet connection failed.");
          });
        }}
      >
        {connecting ? "Connecting..." : connected ? "Disconnect Wallet" : "Connect Phantom"}
      </Button>
      {connected && address ? (
        <Badge tone="emerald" className="gap-1">
          <WalletCards className="h-3 w-3" />
          {walletName ?? "Wallet"} {shortAddress(address)}
        </Badge>
      ) : (
        <Badge tone="amber" className="gap-1">
          <Wallet className="h-3 w-3" />
          {walletName ?? "Wallet disconnected"}
        </Badge>
      )}
      {address ? (
        <a
          href={getSolanaAddressUrl(address)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 transition hover:text-violet-300"
        >
          View wallet
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
