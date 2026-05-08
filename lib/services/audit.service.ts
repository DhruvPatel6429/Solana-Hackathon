import { createAuditLog } from "@/lib/db/queries/audit";
import type { Prisma } from "@prisma/client";

type AuditEventInput = {
  companyId: string;
  actorUserId?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function logSignupCreated(input: AuditEventInput) {
  return createAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "signup_created",
    metadata: input.metadata ?? ({} as Prisma.InputJsonValue),
  });
}

export async function logPayoutConfirmed(input: AuditEventInput) {
  return createAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "payout_confirmed",
    metadata: input.metadata ?? ({} as Prisma.InputJsonValue),
  });
}

export async function logPayoutFailed(input: AuditEventInput) {
  return createAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "payout_failed",
    metadata: input.metadata ?? ({} as Prisma.InputJsonValue),
  });
}

export async function logAuditExported(input: AuditEventInput) {
  return createAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "audit_exported",
    metadata: input.metadata ?? ({} as Prisma.InputJsonValue),
  });
}
