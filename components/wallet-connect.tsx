"use client";

import { useMemo } from "react";
import { Wallet, WalletCards } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import { Badge } from "@/components/ui/badge";

function shortAddress(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function WalletConnect() {
  const { connected, publicKey, wallet } = useWallet();
  const address = useMemo(() => publicKey?.toBase58(), [publicKey]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <WalletMultiButton className="!rounded-lg !bg-violet-600 !px-4 !py-2 !text-sm !font-semibold hover:!bg-violet-500" />
      {connected && address ? (
        <Badge tone="emerald" className="gap-1">
          <WalletCards className="h-3 w-3" />
          {wallet?.adapter.name ?? "Wallet"} {shortAddress(address)}
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
