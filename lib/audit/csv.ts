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

export function buildGenericCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsv(row[column])).join(","));
  }
  return lines.join("\n");
}
