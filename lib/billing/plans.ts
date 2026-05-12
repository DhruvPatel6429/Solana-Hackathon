export type BillingPlanTier = "starter" | "growth" | "enterprise";

export type BillingPlan = {
  tier: BillingPlanTier;
  displayName: string;
  productIdEnv: string;
  priceIdEnv: string;
  monthlyLabel: string;
  limits: {
    contractors: number | "custom";
    payrollRuns: number | "custom";
    invoices: number | "custom";
    treasuryOperations: number | "custom";
  };
  features: string[];
  uiLabel: string;
};

export const billingPlans = {
  starter: {
    tier: "starter",
    displayName: "Starter",
    productIdEnv: "DODO_STARTER_PRODUCT_ID",
    priceIdEnv: "DODO_STARTER_PRICE_ID",
    monthlyLabel: "$49/mo",
    limits: {
      contractors: 5,
      payrollRuns: 10,
      invoices: 25,
      treasuryOperations: 25,
    },
    features: ["Hosted checkout", "USDC treasury", "Webhook billing sync", "CSV audit export"],
    uiLabel: "For first global teams",
  },
  growth: {
    tier: "growth",
    displayName: "Growth",
    productIdEnv: "DODO_GROWTH_PRODUCT_ID",
    priceIdEnv: "DODO_GROWTH_PRICE_ID",
    monthlyLabel: "$149/mo",
    limits: {
      contractors: 50,
      payrollRuns: 100,
      invoices: 500,
      treasuryOperations: 500,
    },
    features: ["Batch payouts", "Usage reporting", "Compliance ledger", "Dodo customer portal"],
    uiLabel: "For scaling payroll operations",
  },
  enterprise: {
    tier: "enterprise",
    displayName: "Enterprise",
    productIdEnv: "DODO_ENTERPRISE_PRODUCT_ID",
    priceIdEnv: "DODO_ENTERPRISE_PRICE_ID",
    monthlyLabel: "Custom",
    limits: {
      contractors: "custom",
      payrollRuns: "custom",
      invoices: "custom",
      treasuryOperations: "custom",
    },
    features: ["Custom limits", "Governance policies", "Recovery controls", "Priority operations"],
    uiLabel: "For regulated global teams",
  },
} satisfies Record<BillingPlanTier, BillingPlan>;

export const billingPlanList = Object.values(billingPlans);

export function normalizePlanTier(value: string): BillingPlanTier | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "starter" || normalized === "growth" || normalized === "enterprise") {
    return normalized;
  }
  return null;
}

export function getBillingPlan(value: string): BillingPlan {
  const tier = normalizePlanTier(value);
  if (!tier) {
    throw new Error(`Unsupported billing plan: ${value}`);
  }
  return billingPlans[tier];
}

export function getBillingPlanByProductId(productId?: string | null): BillingPlan | null {
  if (!productId) return null;
  return billingPlanList.find((plan) => process.env[plan.productIdEnv]?.trim() === productId) ?? null;
}

export function resolveBillingPlanProductId(plan: BillingPlan): string {
  const productId = process.env[plan.productIdEnv]?.trim();
  if (!productId) {
    throw new Error(`[dodo] ${plan.productIdEnv} is required to create ${plan.displayName} checkout.`);
  }
  return productId;
}

export function resolveBillingPlanPriceId(plan: BillingPlan): string | null {
  return process.env[plan.priceIdEnv]?.trim() || null;
}
