-- Supabase/PostgreSQL RLS baseline for MVP one-user-one-company tenancy.
-- Apply after migrations in environments where JWT claims are available via auth.uid().

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contractor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageEvent" ENABLE ROW LEVEL SECURITY;

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
  EXISTS (
    SELECT 1
    FROM "CompanyUser" cu
    WHERE cu."companyId" = "Invoice"."companyId"
      AND cu."userId" = auth.uid()::text
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
