const DEFAULT_CLUSTER = "devnet";

type ExplorerEntityType = "tx" | "address";

function clusterValue(cluster?: string | null) {
  return cluster?.trim() || process.env.NEXT_PUBLIC_SOLANA_CLUSTER || DEFAULT_CLUSTER;
}

export function getSolanaExplorerUrl(
  type: ExplorerEntityType,
  value: string,
  cluster?: string | null,
): string {
  const resolvedCluster = clusterValue(cluster);
  const encodedValue = encodeURIComponent(value);
  const encodedCluster = encodeURIComponent(resolvedCluster);
  return `https://explorer.solana.com/${type}/${encodedValue}?cluster=${encodedCluster}`;
}

export function getSolanaTxUrl(signature: string, cluster?: string | null): string {
  return getSolanaExplorerUrl("tx", signature, cluster);
}

export function getSolanaAddressUrl(address: string, cluster?: string | null): string {
  return getSolanaExplorerUrl("address", address, cluster);
}
