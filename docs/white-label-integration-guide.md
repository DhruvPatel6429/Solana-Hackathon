# White-Label Integration Guide

## Capability
The platform supports tenant-specific branded configuration through partner integration metadata.

## Configuration Domains
- Branding payload (`brandedConfiguration`)
- Embedded dashboard enablement (`embeddingEnabled`)
- Partner payout API toggles (`payoutApiEnabled`)

## Embedding Security
- Embedded views must use organization-scoped JWT or scoped API key.
- Do not share admin keys in browser contexts.
- Route all partner interactions through tenant middleware.

## Rollout Pattern
1. Create partner integration.
2. Add branding config.
3. Validate scoped API key access.
4. Activate webhook subscriptions.
5. Run enterprise certification.
