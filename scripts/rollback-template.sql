-- Production rollback template.
-- Fill in the exact migration ID and verified reverse statements during an incident.
-- Always take a PITR snapshot before running rollback SQL.

BEGIN;

-- Example:
-- UPDATE "Payout" SET "status" = 'FAILED' WHERE "id" = '<payout-id>' AND "status" = 'PENDING';

COMMIT;
