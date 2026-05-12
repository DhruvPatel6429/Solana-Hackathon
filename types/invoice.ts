export type InvoiceStatus = "Pending" | "Approved" | "Rejected" | "Paid";

export type Invoice = {
  id: string;
  contractorId: string;
  contractor: string;
  amount: number;
  currency: "USDC";
  submittedAt: string;
  approvedAt?: string;
  status: InvoiceStatus;
  txHash?: string;
  description: string;
};
