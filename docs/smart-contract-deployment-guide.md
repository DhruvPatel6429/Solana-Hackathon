# Smart Contract Deployment Guide

## Build

Run `npm run anchor:build`.

## Deploy

Run `npm run anchor:deploy` against devnet. After deploy:

1. Set `ESCROW_PROGRAM_ID` to the deployed program.
2. Add it to `ALLOWED_ESCROW_PROGRAM_IDS`.
3. Run `npm run verify-program`.
4. Run `npm run test:e2e:devnet` with seeded wallets.

## Runtime Verification

The payout path validates the configured program ID before escrow execution. Escrow recovery checks initialized but unreleased escrow accounts and can reconcile or release stuck funds.
