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
