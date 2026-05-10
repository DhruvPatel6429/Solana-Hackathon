# Incident Response Guide

## Severity Examples

- Critical: on-chain payout confirmed but DB update failed.
- Critical: duplicate payout attempt detected.
- Critical: treasury balance mismatch over threshold.
- Warning: stale escrow older than threshold.
- Warning: webhook dead-letter backlog.

## Response Flow

1. Open `/operations`.
2. Check system health and reconciliation warnings.
3. Export `type=reconciliation` CSV for evidence.
4. Run payout reconciliation or webhook replay when safe.
5. For DB changes, take a PITR snapshot first.
6. Use `scripts/rollback-template.sql` only with incident-specific reviewed SQL.
7. Record final state in `ReconciliationAudit`.
