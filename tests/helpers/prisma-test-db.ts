type Row = Record<string, any>;

type TestTable = {
  rows: Row[];
};

type TestDb = {
  company: TestTable;
  companyUser: TestTable;
  contractor: TestTable;
  invoice: TestTable;
  payout: TestTable;
  auditLog: TestTable;
};

function now(): Date {
  return new Date();
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createDb(): TestDb {
  return {
    company: { rows: [] },
    companyUser: { rows: [] },
    contractor: { rows: [] },
    invoice: { rows: [] },
    payout: { rows: [] },
    auditLog: { rows: [] },
  };
}

function matchesWhere(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      "not" in expected
    ) {
      return row[key] !== expected.not;
    }

    return row[key] === expected;
  });
}

function applySelect(row: Row, select?: Row): Row {
  if (!select) {
    return { ...row };
  }

  return Object.fromEntries(
    Object.keys(select)
      .filter((key) => select[key])
      .map((key) => [key, row[key]]),
  );
}

function withInvoiceIncludes(db: TestDb, row: Row, include?: Row): Row {
  const result = { ...row };

  if (include?.contractor) {
    result.contractor = db.contractor.rows.find(
      (contractor) => contractor.id === row.contractorId,
    ) ?? null;
  }

  if (include?.payouts) {
    result.payouts = db.payout.rows.filter(
      (payout) => payout.invoiceId === row.id,
    );
  }

  return result;
}

function withPayoutIncludes(db: TestDb, row: Row, include?: Row): Row {
  const result = { ...row };

  if (include?.contractor) {
    const contractor = db.contractor.rows.find(
      (candidate) => candidate.id === row.contractorId,
    ) ?? null;

    if (contractor && include.contractor.select) {
      result.contractor = applySelect(contractor, include.contractor.select);
    } else {
      result.contractor = contractor;
    }
  }

  return result;
}

function sortPayouts(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const aTime = (a.executedAt ?? a.createdAt).getTime();
    const bTime = (b.executedAt ?? b.createdAt).getTime();
    return bTime - aTime;
  });
}

export async function installPrismaTestDb(): Promise<{
  db: TestDb;
  prisma: any;
  restore: () => void;
}> {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

  const { prisma } = await import("../../lib/db/prisma");
  const db = createDb();
  const restorers: Array<() => void> = [];

  function replace(target: Row, key: string, value: (...args: any[]) => unknown): void {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, {
      configurable: true,
      value,
      writable: true,
    });
    restorers.push(() => {
      if (descriptor) {
        Object.defineProperty(target, key, descriptor);
      } else {
        delete target[key];
      }
    });
  }

  replace(prisma, "$transaction", async (operations: Promise<unknown>[]) =>
    Promise.all(operations),
  );

  replace(prisma.company, "create", async ({ data }: any) => {
    const row = {
      id: data.id ?? id("company"),
      name: data.name,
      planTier: data.planTier ?? null,
      dodoCustomerId: data.dodoCustomerId ?? null,
      dodoSubscriptionId: data.dodoSubscriptionId ?? null,
      treasuryWalletAddress: data.treasuryWalletAddress ?? null,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };
    db.company.rows.push(row);
    return { ...row };
  });

  replace(prisma.companyUser, "create", async ({ data }: any) => {
    const row = {
      id: data.id ?? id("company_user"),
      companyId: data.companyId,
      userId: data.userId,
      createdAt: data.createdAt ?? now(),
    };
    db.companyUser.rows.push(row);
    return { ...row };
  });

  replace(prisma.companyUser, "findUnique", async ({ where }: any) => {
    const row = db.companyUser.rows.find((candidate) =>
      matchesWhere(candidate, where),
    );
    return row ? { ...row } : null;
  });

  replace(prisma.contractor, "create", async ({ data }: any) => {
    const row = {
      id: data.id ?? id("contractor"),
      companyId: data.companyId,
      name: data.name,
      country: data.country ?? null,
      taxId: data.taxId ?? null,
      payoutPreference: data.payoutPreference ?? "USDC",
      walletAddress: data.walletAddress ?? null,
      kycStatus: data.kycStatus ?? "VERIFIED",
      status: data.status ?? "Active",
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };
    db.contractor.rows.push(row);
    return { ...row };
  });

  replace(prisma.invoice, "create", async ({ data, include }: any) => {
    const row = {
      id: data.id ?? id("invoice"),
      companyId: data.companyId,
      contractorId: data.contractorId,
      amountUsdc: data.amountUsdc,
      status: data.status ?? "PENDING",
      invoiceHash: data.invoiceHash ?? null,
      description: data.description ?? null,
      submittedAt: data.submittedAt ?? now(),
      approvedAt: data.approvedAt ?? null,
      createdAt: data.createdAt ?? now(),
      updatedAt: data.updatedAt ?? now(),
    };
    db.invoice.rows.push(row);
    return withInvoiceIncludes(db, row, include);
  });

  replace(prisma.invoice, "findUnique", async ({ where, include, select }: any) => {
    const row = db.invoice.rows.find((candidate) =>
      matchesWhere(candidate, where),
    );

    if (!row) {
      return null;
    }

    return select
      ? applySelect(row, select)
      : withInvoiceIncludes(db, row, include);
  });

  replace(prisma.invoice, "findFirst", async ({ where, include, select }: any) => {
    const row = db.invoice.rows.find((candidate) =>
      matchesWhere(candidate, where),
    );

    if (!row) {
      return null;
    }

    return select
      ? applySelect(row, select)
      : withInvoiceIncludes(db, row, include);
  });

  replace(prisma.invoice, "update", async ({ where, data, include }: any) => {
    const row = db.invoice.rows.find((candidate) =>
      matchesWhere(candidate, where),
    );

    if (!row) {
      throw new Error("Invoice not found");
    }

    Object.assign(row, data, { updatedAt: now() });
    return withInvoiceIncludes(db, row, include);
  });

  replace(prisma.payout, "create", async ({ data }: any) => {
    const row = {
      id: data.id ?? id("payout"),
      companyId: data.companyId ?? null,
      contractorId: data.contractorId ?? null,
      invoiceId: data.invoiceId,
      contractorWallet: data.contractorWallet,
      amountUsdc: data.amountUsdc,
      currency: data.currency ?? "USDC",
      escrowPda: data.escrowPda ?? null,
      txSignature: data.txSignature ?? null,
      status: data.status,
      createdAt: data.createdAt ?? now(),
      executedAt: data.executedAt ?? null,
    };
    db.payout.rows.push(row);
    return { ...row };
  });

  replace(prisma.payout, "findUnique", async ({ where }: any) => {
    const row = db.payout.rows.find((candidate) =>
      matchesWhere(candidate, where),
    );
    return row ? { ...row } : null;
  });

  replace(prisma.payout, "findMany", async ({ where, include }: any = {}) => {
    const rows = db.payout.rows.filter((candidate) =>
      matchesWhere(candidate, where),
    );
    return sortPayouts(rows).map((row) => withPayoutIncludes(db, row, include));
  });

  replace(prisma.payout, "count", async ({ where }: any = {}) => {
    return db.payout.rows.filter((candidate) =>
      matchesWhere(candidate, where),
    ).length;
  });

  replace(prisma.payout, "update", async ({ where, data }: any) => {
    const row = db.payout.rows.find((candidate) =>
      matchesWhere(candidate, where),
    );

    if (!row) {
      throw new Error("Payout not found");
    }

    Object.assign(row, data);
    return { ...row };
  });

  replace(prisma.auditLog, "create", async ({ data }: any) => {
    const row = {
      id: data.id ?? id("audit"),
      companyId: data.companyId,
      action: data.action,
      actorUserId: data.actorUserId ?? data.actorId ?? null,
      metadata: data.metadata ?? null,
      createdAt: data.createdAt ?? now(),
    };
    db.auditLog.rows.push(row);
    return { ...row };
  });

  return {
    db,
    prisma,
    restore: () => {
      for (const restore of restorers.reverse()) {
        restore();
      }
    },
  };
}
