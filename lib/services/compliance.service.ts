import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

const DEFAULT_LARGE_PAYOUT_ALERT_USDC = Number(process.env.COMPLIANCE_LARGE_PAYOUT_ALERT_USDC ?? "10000");
const DEFAULT_SUSPICIOUS_PAYOUT_ALERT_USDC = Number(process.env.COMPLIANCE_SUSPICIOUS_PAYOUT_ALERT_USDC ?? "50000");
const DEFAULT_SINGLE_APPROVAL_LIMIT_USDC = Number(process.env.COMPLIANCE_SINGLE_APPROVAL_LIMIT_USDC ?? "25000");

export type ComplianceHookResult = {
  blocked: boolean;
  requiresManualApproval: boolean;
  alerts: Array<{ id: string; severity: string; scope: string }>;
};

async function resolveOrganizationId(companyId?: string): Promise<string | null> {
  if (!companyId) return null;
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true },
  });
  return company?.organizationId ?? null;
}

async function createComplianceAlert(input: {
  organizationId?: string | null;
  companyId?: string | null;
  scope: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  entityType?: string;
  entityId?: string;
  thresholdRule?: string;
  amountUsdc?: number;
  metadata?: Record<string, unknown>;
}) {
  if (!input.organizationId) {
    return null;
  }

  return db.complianceAlert.create({
    data: {
      organizationId: input.organizationId,
      companyId: input.companyId ?? null,
      scope: input.scope,
      severity: input.severity,
      status: "OPEN",
      entityType: input.entityType,
      entityId: input.entityId,
      thresholdRule: input.thresholdRule,
      amountUsdc: input.amountUsdc?.toString(),
      metadata: input.metadata ?? {},
    },
  });
}

export async function evaluatePayoutCompliance(input: {
  companyId?: string;
  invoiceId: string;
  amountUsdc: number;
  wallet: string;
}): Promise<ComplianceHookResult> {
  const organizationId = await resolveOrganizationId(input.companyId);
  const alerts: Array<{ id: string; severity: string; scope: string }> = [];

  if (input.amountUsdc >= DEFAULT_LARGE_PAYOUT_ALERT_USDC) {
    const alert = await createComplianceAlert({
      organizationId,
      companyId: input.companyId,
      scope: "LARGE_TRANSACTION_ALERT",
      severity: input.amountUsdc >= DEFAULT_SUSPICIOUS_PAYOUT_ALERT_USDC ? "CRITICAL" : "HIGH",
      entityType: "Invoice",
      entityId: input.invoiceId,
      thresholdRule: `amount_usdc>=${DEFAULT_LARGE_PAYOUT_ALERT_USDC}`,
      amountUsdc: input.amountUsdc,
      metadata: {
        wallet: input.wallet,
        sanctionsScreening: "integration_hook_pending",
        amlScreening: "integration_hook_pending",
      },
    });

    if (alert) {
      alerts.push({ id: alert.id, severity: alert.severity, scope: alert.scope });
    }
  }

  const requiresManualApproval = input.amountUsdc >= DEFAULT_SINGLE_APPROVAL_LIMIT_USDC;

  if (requiresManualApproval) {
    const alert = await createComplianceAlert({
      organizationId,
      companyId: input.companyId,
      scope: "MANUAL_APPROVAL_THRESHOLD",
      severity: "HIGH",
      entityType: "Invoice",
      entityId: input.invoiceId,
      thresholdRule: `amount_usdc>=${DEFAULT_SINGLE_APPROVAL_LIMIT_USDC}`,
      amountUsdc: input.amountUsdc,
      metadata: {
        wallet: input.wallet,
        treasuryGovernance: "dual_control_required",
      },
    });

    if (alert) {
      alerts.push({ id: alert.id, severity: alert.severity, scope: alert.scope });
    }
  }

  return {
    blocked: false,
    requiresManualApproval,
    alerts,
  };
}

export async function recordAmlFlag(input: {
  organizationId: string;
  companyId?: string;
  scope: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  return createComplianceAlert({
    organizationId: input.organizationId,
    companyId: input.companyId,
    scope: input.scope,
    severity: "CRITICAL",
    entityType: input.entityType,
    entityId: input.entityId,
    thresholdRule: "aml_hook",
    metadata: {
      ...input.details,
      amlIntegrationStatus: "hook_recorded",
    },
  });
}

export async function listComplianceAlerts(organizationId: string, companyId?: string) {
  return db.complianceAlert.findMany({
    where: {
      organizationId,
      ...(companyId ? { companyId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function upsertGovernancePolicy(input: {
  organizationId: string;
  companyId?: string;
  policyType: string;
  value: Record<string, unknown>;
  createdByUserId?: string;
}) {
  const existing = await db.governancePolicy.findFirst({
    where: {
      organizationId: input.organizationId,
      companyId: input.companyId ?? null,
      policyType: input.policyType,
      status: "ACTIVE",
    },
  });

  if (existing) {
    return db.governancePolicy.update({
      where: { id: existing.id },
      data: {
        value: input.value,
        createdByUserId: input.createdByUserId,
      },
    });
  }

  return db.governancePolicy.create({
    data: {
      organizationId: input.organizationId,
      companyId: input.companyId ?? null,
      policyType: input.policyType,
      value: input.value,
      createdByUserId: input.createdByUserId,
      status: "ACTIVE",
    },
  });
}
