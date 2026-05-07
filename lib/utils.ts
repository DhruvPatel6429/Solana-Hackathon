import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUSDC(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;
}

export function truncateHash(hash: string, head = 8, tail = 4) {
  if (hash.length <= head + tail) return hash;
  return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
}
