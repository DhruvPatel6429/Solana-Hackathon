"use client";

import { useMemo } from "react";
import { Wallet, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWalletRuntime } from "@/components/providers";

function shortAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function WalletConnect() {
  const { connected, publicKey, walletName } = useWalletRuntime();
  const address = useMemo(() => publicKey ?? undefined, [publicKey]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500"
        onClick={() => {
          window.alert(
            "Wallet adapter package is not installed in this environment. Configure adapter dependencies to enable live wallet connect UI.",
          );
        }}
      >
        Wallet Adapter Setup
      </Button>
      {connected && address ? (
        <Badge tone="emerald" className="gap-1">
          <WalletCards className="h-3 w-3" />
          {walletName ?? "Wallet"} {shortAddress(address)}
        </Badge>
      ) : (
        <Badge tone="amber" className="gap-1">
          <Wallet className="h-3 w-3" />
          Wallet disconnected
        </Badge>
      )}
    </div>
  );
}
