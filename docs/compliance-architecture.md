# Compliance Architecture

## Scope
Compliance controls are implemented as architecture hooks, governance policies, and alerting records.

## Implemented Components
- `ComplianceAlert` persistence model
- `GovernancePolicy` model
- Threshold-based payout compliance checks
- AML/sanctions integration hook points
- Manual approval threshold signaling

## Current Hooks
- `LARGE_TRANSACTION_ALERT`
- `MANUAL_APPROVAL_THRESHOLD`
- `recordAmlFlag` for external AML/sanctions provider callbacks

## Non-Claim Statement
This system does not claim built-in sanctions/KYB provider certification. It provides integration-ready hooks and governance data models.

## Recommended Integrations
- Sanctions screening provider webhook callback
- KYB verification provider job sync
- AML transaction scoring provider
