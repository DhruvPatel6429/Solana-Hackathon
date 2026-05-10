import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/utils/logger";

const db = prisma as any;

function nextRetry(attempts: number): Date {
  const seconds = Math.min(6 * 60 * 60, 2 ** Math.max(1, attempts) * 60);
  return new Date(Date.now() + seconds * 1000);
}

export class WebhookRecoveryService {
  async recordFailure(input: {
    provider: string;
    externalId?: string | null;
    eventType?: string | null;
    signature?: string | null;
    nonce?: string | null;
    payload: unknown;
    error: unknown;
    correlationId?: string;
  }) {
    const message = input.error instanceof Error ? input.error.message : String(input.error);
    const externalId = input.externalId ?? crypto.randomUUID();

    return db.deadLetterWebhook.upsert({
      where: {
        provider_externalId: {
          provider: input.provider,
          externalId,
        },
      },
      create: {
        provider: input.provider,
        externalId,
        eventType: input.eventType,
        signature: input.signature,
        nonce: input.nonce,
        payload: input.payload as any,
        status: "PENDING_REPLAY",
        attempts: 0,
        nextRetryAt: nextRetry(0),
        lastError: message,
        correlationId: input.correlationId,
      },
      update: {
        status: "PENDING_REPLAY",
        nextRetryAt: nextRetry(0),
        lastError: message,
        payload: input.payload as any,
      },
    });
  }

  async replayFailedWebhooks(limit = 25) {
    const rows = await db.deadLetterWebhook.findMany({
      where: {
        status: "PENDING_REPLAY",
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      orderBy: { receivedAt: "asc" },
      take: limit,
    });

    const results = [];
    for (const row of rows) {
      try {
        if (row.provider === "dodo") {
          const { handleDodoWebhook } = await import("@/lib/services/billing.service");
          await handleDodoWebhook({
            payload: JSON.stringify(row.payload),
            signature: row.signature,
            skipFreshnessCheck: true,
          });
        } else if (row.provider === "helius") {
          const { processHeliusTreasuryWebhook } = await import("@/lib/services/treasury.service");
          await processHeliusTreasuryWebhook(row.payload);
        } else {
          throw new Error(`Unsupported webhook provider ${row.provider}`);
        }

        await db.deadLetterWebhook.update({
          where: { id: row.id },
          data: { status: "REPLAYED", processedAt: new Date(), lastError: null },
        });
        results.push({ id: row.id, status: "REPLAYED" });
      } catch (error) {
        const attempts = row.attempts + 1;
        const permanent = attempts >= 10;
        const message = error instanceof Error ? error.message : String(error);
        await db.deadLetterWebhook.update({
          where: { id: row.id },
          data: {
            attempts,
            status: permanent ? "PERMANENT_FAILURE" : "PENDING_REPLAY",
            nextRetryAt: permanent ? null : nextRetry(attempts),
            lastError: message,
          },
        });
        logger.warn("Webhook replay failed", {
          webhookId: row.id,
          provider: row.provider,
          error: message,
        });
        results.push({ id: row.id, status: permanent ? "PERMANENT_FAILURE" : "PENDING_REPLAY" });
      }
    }

    return results;
  }
}

export const webhookRecoveryService = new WebhookRecoveryService();
