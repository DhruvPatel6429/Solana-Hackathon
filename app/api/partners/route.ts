import { createHash, randomUUID } from "node:crypto";

import { toHttpErrorResponse } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { requireTenantRequestContext } from "@/lib/tenancy/context";

const db = prisma as any;

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRequestContext(request, {
      allowApiKey: true,
      allowedScopes: ["webhooks:manage"],
    }).catch(async () => requireTenantRequestContext(request, { allowApiKey: false }));

    const integrations = await db.partnerIntegration.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(tenant.companyId ? { companyId: tenant.companyId } : {}),
      },
      include: {
        webhookSubscriptions: {
          select: {
            id: true,
            targetUrl: true,
            eventTypes: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ success: true, integrations });
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const tenant = await requireTenantRequestContext(request, { allowApiKey: false });
    const partnerName = typeof body.partnerName === "string" ? body.partnerName.trim() : "";

    if (!partnerName) {
      return Response.json({ success: false, error: "partnerName is required." }, { status: 400 });
    }

    const integration = await db.partnerIntegration.create({
      data: {
        organizationId: tenant.organizationId,
        companyId: tenant.companyId,
        partnerName,
        partnerReference: typeof body.partnerReference === "string" ? body.partnerReference : null,
        embeddingEnabled: Boolean(body.embeddingEnabled),
        payoutApiEnabled: body.payoutApiEnabled === false ? false : true,
        brandedConfiguration:
          body.brandedConfiguration && typeof body.brandedConfiguration === "object"
            ? body.brandedConfiguration
            : null,
      },
    });

    let webhookSubscription = null;

    if (typeof body.webhookTargetUrl === "string" && body.webhookTargetUrl.trim()) {
      const secret =
        typeof body.webhookSecret === "string" && body.webhookSecret.trim()
          ? body.webhookSecret.trim()
          : randomUUID();

      webhookSubscription = await db.partnerWebhookSubscription.create({
        data: {
          organizationId: tenant.organizationId,
          companyId: tenant.companyId,
          partnerIntegrationId: integration.id,
          targetUrl: body.webhookTargetUrl,
          eventTypes: Array.isArray(body.eventTypes) ? body.eventTypes : ["payout.confirmed", "invoice.approved"],
          secretHash: hashSecret(secret),
          status: "ACTIVE",
        },
      });

      await db.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          companyId: tenant.companyId,
          action: "partner_webhook_subscribed",
          actorUserId: tenant.userId,
          metadata: {
            partnerIntegrationId: integration.id,
            webhookSubscriptionId: webhookSubscription.id,
            targetUrl: webhookSubscription.targetUrl,
          },
        },
      }).catch(() => undefined);

      return Response.json(
        {
          success: true,
          integration,
          webhookSubscription: {
            ...webhookSubscription,
            webhookSecret: secret,
          },
        },
        { status: 201 },
      );
    }

    return Response.json({ success: true, integration, webhookSubscription }, { status: 201 });
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const tenant = await requireTenantRequestContext(request, { allowApiKey: false });
    const integrationId = typeof body.integrationId === "string" ? body.integrationId : "";

    if (!integrationId) {
      return Response.json({ success: false, error: "integrationId is required." }, { status: 400 });
    }

    const existing = await db.partnerIntegration.findFirst({
      where: {
        id: integrationId,
        organizationId: tenant.organizationId,
        ...(tenant.companyId ? { companyId: tenant.companyId } : {}),
      },
    });

    if (!existing) {
      return Response.json({ success: false, error: "Partner integration not found." }, { status: 404 });
    }

    const updated = await db.partnerIntegration.update({
      where: { id: integrationId },
      data: {
        embeddingEnabled:
          typeof body.embeddingEnabled === "boolean" ? body.embeddingEnabled : undefined,
        payoutApiEnabled:
          typeof body.payoutApiEnabled === "boolean" ? body.payoutApiEnabled : undefined,
        brandedConfiguration:
          body.brandedConfiguration && typeof body.brandedConfiguration === "object"
            ? body.brandedConfiguration
            : undefined,
      },
    });

    if (body.revokeWebhookSubscriptionId && typeof body.revokeWebhookSubscriptionId === "string") {
      await db.partnerWebhookSubscription.update({
        where: { id: body.revokeWebhookSubscriptionId },
        data: {
          status: "REVOKED",
        },
      });
    }

    return Response.json({ success: true, integration: updated });
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
