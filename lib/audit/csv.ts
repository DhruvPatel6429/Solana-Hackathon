import type { PayoutListItem } from "@/lib/db/queries/payouts";

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

export function buildPayoutCsv(rows: PayoutListItem[]): string {
  const header = [
    "id",
    "contractor",
    "amount",
    "currency",
    "date",
    "invoiceId",
    "txHash",
    "kycStatus",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.contractor,
        row.amount.toFixed(2),
        row.currency,
        row.date,
        row.invoiceId,
        row.txHash,
        row.kycStatus,
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  return lines.join("\n");
}
