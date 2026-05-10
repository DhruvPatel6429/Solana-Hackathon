-- Supabase/PostgreSQL RLS baseline for MVP one-user-one-company tenancy.
-- Apply after migrations in environments where JWT claims are available via auth.uid().

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contractor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TreasuryTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerWebhookSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GovernancePolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisasterRecoverySnapshot" ENABLE ROW LEVEL SECURITY;

-- Role assumptions:
-- - Company admins carry app_metadata.role = 'admin' in Supabase Auth.
-- - Contractors carry user_metadata.role = 'contractor' and user_metadata.contractorId.
-- - Server-side webhook processors and payout workers use the Supabase service role,
--   which bypasses RLS for trusted backend reconciliation only.

CREATE OR REPLACE FUNCTION current_auth_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  )
$$;

CREATE OR REPLACE FUNCTION current_contractor_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() -> 'user_metadata' ->> 'contractorId', '')
$$;

CREATE OR REPLACE FUNCTION current_organization_ids()
RETURNS TABLE (organization_id text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT c."organizationId"
  FROM "CompanyUser" cu
  JOIN "Company" c ON c."id" = cu."companyId"
  WHERE cu."userId" = auth.uid()::text
    AND c."organizationId" IS NOT NULL
$$;

CREATE POLICY "company_user_select_own_membership"
ON "CompanyUser"
FOR SELECT
USING ("userId" = auth.uid()::text);

CREATE POLICY "company_select_by_membership"
ON "Company"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "CompanyUser" cu
    WHERE cu."companyId" = "Company"."id"
      AND cu."userId" = auth.uid()::text
  )
);

CREATE POLICY "contractor_select_by_membership"
ON "Contractor"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "CompanyUser" cu
    WHERE cu."companyId" = "Contractor"."companyId"
      AND cu."userId" = auth.uid()::text
  )
);

CREATE POLICY "invoice_select_by_membership"
ON "Invoice"
FOR SELECT
USING (
  (
    current_auth_role() = 'admin'
    AND EXISTS (
      SELECT 1
      FROM "CompanyUser" cu
      WHERE cu."companyId" = "Invoice"."companyId"
        AND cu."userId" = auth.uid()::text
    )
  )
  OR (
    current_auth_role() = 'contractor'
    AND "Invoice"."contractorId" = current_contractor_id()
  )
);

CREATE POLICY "payout_select_by_membership"
ON "Payout"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "CompanyUser" cu
    WHERE cu."companyId" = "Payout"."companyId"
      AND cu."userId" = auth.uid()::text
  )
);

CREATE POLICY "billing_event_admin_select_by_membership"
ON "BillingEvent"
FOR SELECT
USING (
  current_auth_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM "CompanyUser" cu
    WHERE cu."companyId" = "BillingEvent"."companyId"
      AND cu."userId" = auth.uid()::text
  )
);

CREATE POLICY "treasury_transaction_admin_select_by_membership"
ON "TreasuryTransaction"
FOR SELECT
USING (
  current_auth_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM "CompanyUser" cu
    WHERE cu."companyId" = "TreasuryTransaction"."companyId"
      AND cu."userId" = auth.uid()::text
  )
);

CREATE POLICY "webhook_event_service_role_only"
ON "WebhookEvent"
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "audit_log_select_by_membership"
ON "AuditLog"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "CompanyUser" cu
    WHERE cu."companyId" = "AuditLog"."companyId"
      AND cu."userId" = auth.uid()::text
  )
);

CREATE POLICY "usage_event_select_by_membership"
ON "UsageEvent"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "CompanyUser" cu
    WHERE cu."companyId" = "UsageEvent"."companyId"
      AND cu."userId" = auth.uid()::text
  )
);

CREATE POLICY "organization_select_by_membership"
ON "Organization"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM current_organization_ids() ids
    WHERE ids.organization_id = "Organization"."id"
  )
);

CREATE POLICY "organization_member_select_by_org_membership"
ON "OrganizationMember"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM current_organization_ids() ids
    WHERE ids.organization_id = "OrganizationMember"."organizationId"
  )
);

CREATE POLICY "api_key_select_by_org_membership"
ON "ApiKey"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM current_organization_ids() ids
    WHERE ids.organization_id = "ApiKey"."organizationId"
  )
);

CREATE POLICY "partner_integration_select_by_org_membership"
ON "PartnerIntegration"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM current_organization_ids() ids
    WHERE ids.organization_id = "PartnerIntegration"."organizationId"
  )
);

CREATE POLICY "partner_webhook_subscription_select_by_org_membership"
ON "PartnerWebhookSubscription"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM current_organization_ids() ids
    WHERE ids.organization_id = "PartnerWebhookSubscription"."organizationId"
  )
);

CREATE POLICY "compliance_alert_select_by_org_membership"
ON "ComplianceAlert"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM current_organization_ids() ids
    WHERE ids.organization_id = "ComplianceAlert"."organizationId"
  )
);

CREATE POLICY "governance_policy_select_by_org_membership"
ON "GovernancePolicy"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM current_organization_ids() ids
    WHERE ids.organization_id = "GovernancePolicy"."organizationId"
  )
);

CREATE POLICY "disaster_recovery_snapshot_select_by_org_membership"
ON "DisasterRecoverySnapshot"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM current_organization_ids() ids
    WHERE ids.organization_id = "DisasterRecoverySnapshot"."organizationId"
  )
);
