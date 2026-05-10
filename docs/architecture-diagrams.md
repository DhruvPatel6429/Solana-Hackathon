# Architecture Diagrams (Textual)

## Tenant Isolation
`Organization -> Company -> Contractor/Invoice/Payout/Billing/Treasury/Audit`

## Partner Integration
`PartnerIntegration -> PartnerWebhookSubscription -> Scoped ApiKey`

## Recovery
`Runtime Events -> FailedJob/DeadLetterWebhook -> Recovery Services -> ReconciliationAudit`

## Compliance
`Payout Flow -> Compliance Hooks -> ComplianceAlert + GovernancePolicy`
