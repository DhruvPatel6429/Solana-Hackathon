import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireAuthenticatedUser } from "@/lib/auth/server";
import { requireTenantRequestContext } from "@/lib/tenancy/context";
import {
  addOrganizationMember,
  getOrganizationByCompany,
  listOrganizationMembers,
  provisionOrganization,
} from "@/lib/tenancy/organizations";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRequestContext(request, { allowApiKey: false });

    const organization = await db.organization.findUnique({
      where: { id: tenant.organizationId },
      include: {
        companies: {
          select: {
            id: true,
            name: true,
            planTier: true,
            treasuryWalletAddress: true,
            feeWalletAddress: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const members = await listOrganizationMembers(tenant.organizationId);

    return Response.json({
      success: true,
      organization,
      members,
    });
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
    const user = await requireAuthenticatedUser(request);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return Response.json({ success: false, error: "name is required." }, { status: 400 });
    }

    const provisioned = await provisionOrganization({
      name,
      ownerUserId: user.userId,
      companyName: typeof body.companyName === "string" ? body.companyName : undefined,
      planTier: typeof body.planTier === "string" ? body.planTier : undefined,
      treasuryWalletAddress:
        typeof body.treasuryWalletAddress === "string" ? body.treasuryWalletAddress : undefined,
      feeWalletAddress: typeof body.feeWalletAddress === "string" ? body.feeWalletAddress : undefined,
    });

    return Response.json({ success: true, ...provisioned }, { status: 201 });
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
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "add_member") {
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      const role = typeof body.role === "string" ? body.role.trim().toUpperCase() : "VIEWER";
      if (!userId) {
        return Response.json({ success: false, error: "userId is required." }, { status: 400 });
      }

      const member = await addOrganizationMember({
        organizationId: tenant.organizationId,
        userId,
        role: role as "OWNER" | "ADMIN" | "FINANCE" | "COMPLIANCE" | "VIEWER",
      });

      return Response.json({ success: true, member });
    }

    if (action === "update_company_settings") {
      const companyId = typeof body.companyId === "string" ? body.companyId : tenant.companyId;
      if (!companyId) {
        return Response.json({ success: false, error: "companyId is required." }, { status: 400 });
      }

      const company = await getOrganizationByCompany(companyId);
      if (!company || company.organizationId !== tenant.organizationId) {
        return Response.json({ success: false, error: "Company not found in tenant." }, { status: 404 });
      }

      const updated = await db.company.update({
        where: { id: companyId },
        data: {
          treasuryWalletAddress:
            typeof body.treasuryWalletAddress === "string" ? body.treasuryWalletAddress : undefined,
          feeWalletAddress: typeof body.feeWalletAddress === "string" ? body.feeWalletAddress : undefined,
          planTier: typeof body.planTier === "string" ? body.planTier : undefined,
        },
      });

      return Response.json({ success: true, company: updated });
    }

    return Response.json({ success: false, error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
