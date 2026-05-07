export type Contractor = {
  id: string;
  name: string;
  country: string;
  flag: string;
  payoutPreference: "USDC" | "FIAT";
  kycStatus: "Verified" | "Pending" | "Rejected";
  lastPaid: string;
  status: "Active" | "Invited" | "Paused";
};

export type Invoice = {
  id: string;
  contractorId: string;
  contractor: string;
  amount: number;
  currency: "USDC";
  submittedAt: string;
  status: "Pending" | "Approved" | "Rejected" | "Paid";
  txHash?: string;
  description: string;
};

export type Payout = {
  id: string;
  contractor: string;
  amount: number;
  currency: "USDC" | "USD" | "EUR" | "INR" | "BRL" | "PHP";
  date: string;
  invoiceId: string;
  txHash: string;
  kycStatus: Contractor["kycStatus"];
};

export const treasury = {
  balance: 184250.75,
  wallet: "7GkQmYp3nKJ2dVx8Lr9cFa4ZpWb6SuoN1HqTeR5Aa9Cd",
  topUps: [
    { id: "tu-1", amount: 42000, date: "2026-05-06", source: "Ramp Network" },
    { id: "tu-2", amount: 28000, date: "2026-05-02", source: "Circle Mint" },
    { id: "tu-3", amount: 18500, date: "2026-04-28", source: "Bank ACH" },
    { id: "tu-4", amount: 36000, date: "2026-04-19", source: "USDC wallet" },
    { id: "tu-5", amount: 22000, date: "2026-04-12", source: "Bank wire" },
  ],
};

export const contractors: Contractor[] = [
  { id: "ctr-1", name: "Maya Chen", country: "Singapore", flag: "SG", payoutPreference: "USDC", kycStatus: "Verified", lastPaid: "2026-05-01", status: "Active" },
  { id: "ctr-2", name: "Arjun Mehta", country: "India", flag: "IN", payoutPreference: "FIAT", kycStatus: "Verified", lastPaid: "2026-04-28", status: "Active" },
  { id: "ctr-3", name: "Lucas Pereira", country: "Brazil", flag: "BR", payoutPreference: "USDC", kycStatus: "Pending", lastPaid: "2026-04-21", status: "Invited" },
  { id: "ctr-4", name: "Sofia Garcia", country: "Mexico", flag: "MX", payoutPreference: "FIAT", kycStatus: "Verified", lastPaid: "2026-04-30", status: "Active" },
  { id: "ctr-5", name: "Nia Okafor", country: "Nigeria", flag: "NG", payoutPreference: "USDC", kycStatus: "Verified", lastPaid: "2026-05-03", status: "Active" },
  { id: "ctr-6", name: "Tom Becker", country: "Germany", flag: "DE", payoutPreference: "FIAT", kycStatus: "Pending", lastPaid: "2026-04-15", status: "Active" },
  { id: "ctr-7", name: "Lina Reyes", country: "Philippines", flag: "PH", payoutPreference: "FIAT", kycStatus: "Verified", lastPaid: "2026-04-26", status: "Active" },
  { id: "ctr-8", name: "Amara Diallo", country: "Senegal", flag: "SN", payoutPreference: "USDC", kycStatus: "Rejected", lastPaid: "2026-03-30", status: "Paused" },
];

export const invoices: Invoice[] = [
  { id: "INV-1001", contractorId: "ctr-1", contractor: "Maya Chen", amount: 4200, currency: "USDC", submittedAt: "2026-05-06", status: "Pending", description: "AI workflow implementation" },
  { id: "INV-1002", contractorId: "ctr-2", contractor: "Arjun Mehta", amount: 3150, currency: "USDC", submittedAt: "2026-05-05", status: "Approved", description: "Smart contract QA sprint" },
  { id: "INV-1003", contractorId: "ctr-3", contractor: "Lucas Pereira", amount: 2650, currency: "USDC", submittedAt: "2026-05-05", status: "Rejected", description: "Brand motion system" },
  { id: "INV-1004", contractorId: "ctr-4", contractor: "Sofia Garcia", amount: 5100, currency: "USDC", submittedAt: "2026-05-04", status: "Paid", txHash: "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM", description: "Growth analytics dashboard" },
  { id: "INV-1005", contractorId: "ctr-5", contractor: "Nia Okafor", amount: 7200, currency: "USDC", submittedAt: "2026-05-03", status: "Pending", description: "Backend payout reliability" },
  { id: "INV-1006", contractorId: "ctr-6", contractor: "Tom Becker", amount: 1900, currency: "USDC", submittedAt: "2026-05-02", status: "Approved", description: "Compliance copy review" },
  { id: "INV-1007", contractorId: "ctr-7", contractor: "Lina Reyes", amount: 2450, currency: "USDC", submittedAt: "2026-05-01", status: "Paid", txHash: "9xQeWvG816bUx9EPfU7m29WnS9BzP3bMhQ8JvDmK2A4", description: "Support ops tooling" },
  { id: "INV-1008", contractorId: "ctr-1", contractor: "Maya Chen", amount: 3800, currency: "USDC", submittedAt: "2026-04-27", status: "Paid", txHash: "5NfJb7mpS3Qd8bRZwVLJ4iZQ4HhELVcXbtJm67YskH", description: "Agent prompt evaluations" },
  { id: "INV-1009", contractorId: "ctr-2", contractor: "Arjun Mehta", amount: 2900, currency: "USDC", submittedAt: "2026-04-25", status: "Paid", txHash: "2z9dFqLq6n7vhR3oQ3qE4j3WwA6bi4nWBBdBLWQW77Y", description: "Anchor program tests" },
  { id: "INV-1010", contractorId: "ctr-4", contractor: "Sofia Garcia", amount: 4400, currency: "USDC", submittedAt: "2026-04-23", status: "Approved", description: "Lifecycle campaigns" },
  { id: "INV-1011", contractorId: "ctr-5", contractor: "Nia Okafor", amount: 6400, currency: "USDC", submittedAt: "2026-04-21", status: "Paid", txHash: "8Vu7b7kcxN7u2bBNLT7vd7ZKoZ6f9TPMwpC9xGvB7Y5", description: "Treasury indexing" },
  { id: "INV-1012", contractorId: "ctr-6", contractor: "Tom Becker", amount: 2100, currency: "USDC", submittedAt: "2026-04-18", status: "Rejected", description: "Policy localization" },
  { id: "INV-1013", contractorId: "ctr-7", contractor: "Lina Reyes", amount: 2300, currency: "USDC", submittedAt: "2026-04-16", status: "Paid", txHash: "6vUW9sZ3QH7hL5wPpUex5LJXJf2wSaVUyH7amKrkQnZ", description: "Contractor onboarding helpdesk" },
  { id: "INV-1014", contractorId: "ctr-8", contractor: "Amara Diallo", amount: 1800, currency: "USDC", submittedAt: "2026-04-14", status: "Pending", description: "Field research" },
  { id: "INV-1015", contractorId: "ctr-3", contractor: "Lucas Pereira", amount: 3100, currency: "USDC", submittedAt: "2026-04-10", status: "Paid", txHash: "3HSasZbM3i7e8vYQFzNAtpPwBt76uCsfKYGc2Lfa3tA", description: "Design systems tokens" },
];

export const payouts: Payout[] = invoices
  .filter((invoice) => invoice.status === "Paid")
  .slice(0, 10)
  .map((invoice, index) => ({
    id: `pay-${index + 1}`,
    contractor: invoice.contractor,
    amount: invoice.amount,
    currency: index % 3 === 0 ? "USDC" : index % 3 === 1 ? "INR" : "EUR",
    date: invoice.submittedAt,
    invoiceId: invoice.id,
    txHash: invoice.txHash ?? "7nP7xTbJq3Rbgc1FgxQ3cAsQf56nmX9Kn8qHHxdM8Zs",
    kycStatus: contractors.find((contractor) => contractor.id === invoice.contractorId)?.kycStatus ?? "Verified",
  }));

export const fxRates = [
  { pair: "USDC -> USD", rate: "1.000", change: 0.01 },
  { pair: "USDC -> EUR", rate: "0.921", change: -0.12 },
  { pair: "USDC -> INR", rate: "83.42", change: 0.28 },
  { pair: "USDC -> BRL", rate: "5.08", change: 0.18 },
  { pair: "USDC -> PHP", rate: "57.31", change: -0.09 },
];

export const monthlySpend = [
  { month: "Jan", Engineering: 18000, Design: 9000, Ops: 7000 },
  { month: "Feb", Engineering: 24000, Design: 12000, Ops: 8500 },
  { month: "Mar", Engineering: 21000, Design: 13500, Ops: 9300 },
  { month: "Apr", Engineering: 28000, Design: 15500, Ops: 11000 },
  { month: "May", Engineering: 32000, Design: 14200, Ops: 12600 },
];

export const paymentHistory = [
  { month: "Jan", received: 3200 },
  { month: "Feb", received: 4100 },
  { month: "Mar", received: 3800 },
  { month: "Apr", received: 5200 },
  { month: "May", received: 4200 },
];
