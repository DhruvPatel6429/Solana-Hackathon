export type KycStatus = "Verified" | "Pending" | "Rejected";
export type PayoutPreference = "USDC" | "FIAT";
export type ContractorStatus = "Active" | "Invited" | "Paused";

export type Contractor = {
  id: string;
  name: string;
  country: string;
  flag: string;
  payoutPreference: PayoutPreference;
  kycStatus: KycStatus;
  lastPaid: string;
  status: ContractorStatus;
};
