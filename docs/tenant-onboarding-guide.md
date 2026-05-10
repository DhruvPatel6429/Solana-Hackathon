# Tenant Onboarding Guide

## Purpose
This guide defines enterprise onboarding for multi-tenant organizations.

## Steps
1. Provision organization using `POST /api/organizations`.
2. Assign organization members (`OWNER`, `ADMIN`, `FINANCE`, `COMPLIANCE`, `VIEWER`) via `PATCH /api/organizations`.
3. Configure treasury and fee wallets per company.
4. Issue scoped API credentials via `/api/api-keys`.
5. Enable partner integration and webhook subscriptions via `/api/partners`.

## Isolation Guarantees
- `organizationId` and `companyId` are persisted across invoice, payout, treasury, billing, webhook, and audit domains.
- Tenant middleware blocks organization/company mismatch access.
- RLS templates include organization-level membership checks.

## Onboarding Checklist
- Organization created
- Company wallet separation configured
- Fee wallet configured
- API keys issued with least privilege scopes
- Compliance thresholds configured
- Recovery drill executed
