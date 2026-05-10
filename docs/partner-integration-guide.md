# Partner Integration Guide

## Integration Surfaces
- `GET/POST/PATCH /api/partners`
- `GET/POST/PATCH /api/api-keys`
- `GET /api/organizations`

## API Key Security
- Keys are generated server-side, stored as SHA-256 hash, never returned again after issuance.
- Support for scoped permissions and explicit revocation/rotation.
- Key last-used metadata is persisted for governance.

## Webhook Subscription Model
Partner integrations can register target URLs with event scope sets and per-subscription shared secrets.

## Recommended Scopes
- `payouts:read`
- `payouts:write`
- `invoices:read`
- `webhooks:manage`
- `dashboard:embed`

## Auditability
Every key issuance and partner webhook registration should generate audit logs and reconciliation artifacts.
