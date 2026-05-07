import type { KycStatus } from "./contractor";

export type PayoutCurrency = "USDC" | "USD" | "EUR" | "INR" | "BRL" | "PHP";

export type Payout = {
  id: string;
  contractor: string;
  amount: number;
  currency: PayoutCurrency;
  date: string;
  invoiceId: string;
  txHash: string;
  kycStatus: KycStatus;
};
