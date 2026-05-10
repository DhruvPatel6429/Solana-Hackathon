# Production Database Governance

## Migration Validation

CI runs Prisma generation, typecheck, tests, build, and a schema migration diff. Production applies migrations with:

`npm run db:migrate:prod`

## Backup Strategy

- Enable managed Postgres point-in-time recovery.
- Take a manual snapshot before each production migration.
- Retain daily backups for at least 30 days during pilots.
- Test restore into a staging database monthly.

## Rollback

Use `scripts/rollback-template.sql` only after:

1. Capturing a fresh snapshot.
2. Identifying the exact failed migration or bad data write.
3. Reviewing reverse SQL with a second engineer.
4. Running the SQL against staging.

## Decimal Consistency

Run `npm run db:audit` to detect negative invoice or payout amounts and duplicate transaction signatures. All application money writes convert amounts to strings before Prisma Decimal persistence.

## Index Optimization

Hot paths are indexed:
- tenant payout status and creation date
- escrow PDA
- webhook provider/external ID
- treasury wallet/signature
- reconciliation status/severity/scope

Review slow query logs weekly during pilots and add narrowly scoped indexes only for repeated slow queries.
