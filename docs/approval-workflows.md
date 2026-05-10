# Approval Workflows

## Payout Approval Threshold Workflow

1. Invoice is submitted and approved by admin.
2. Compliance hook evaluates payout amount thresholds.
3. If amount exceeds `COMPLIANCE_SINGLE_APPROVAL_LIMIT_USDC`, create `MANUAL_APPROVAL_THRESHOLD` alert.
4. Finance/compliance approvers review alert before treasury execution window.
5. Approved payouts proceed through escrow lifecycle and reconciliation.

## Treasury Governance Workflow

1. Treasury wallet and fee wallet are configured per company.
2. Governance policy updates are persisted through admin compliance endpoint.
3. High-value outgoing flows are reconciled and audited.
4. Recovery services monitor pending/failed states and queue retries.

## Webhook Governance Workflow

1. Inbound webhooks are signature and replay validated.
2. Failures move to dead-letter queues.
3. Replay attempts are tracked and audited.
4. Persistent failures trigger reconciliation and incident response.
