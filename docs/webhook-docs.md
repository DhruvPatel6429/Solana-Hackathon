# Webhook Documentation

## Dodo

Endpoint: `POST /api/webhooks/dodo`

Required production headers:
- `dodo-signature`
- `x-webhook-timestamp` or `dodo-timestamp`
- `x-webhook-nonce` or `dodo-nonce`

Failed webhooks are written to `DeadLetterWebhook` and can be replayed from `/operations`.

## Helius

Endpoint: `POST /api/webhooks/helius`

Required production headers:
- `x-helius-webhook-secret` or `authorization: Bearer <secret>`
- `x-webhook-timestamp` or `x-helius-timestamp`
- `x-webhook-nonce` or `x-helius-nonce`

Helius events update `TreasuryTransaction` and company treasury balance reconciliation.

## Partner Webhook Subscriptions

Enterprise partners can register outbound subscriptions through `POST /api/partners` with:
- `webhookTargetUrl`
- `eventTypes`
- `webhookSecret` (optional; generated if omitted)

Secrets are stored hashed (`secretHash`) and should be rotated periodically via partner governance controls.
