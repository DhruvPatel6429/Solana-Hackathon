# Agent Change Map (chinmai3 branch)

This file lists the files changed by the agent on this branch and each file's responsibility.

| File | Responsibility | What changed |
| --- | --- | --- |
| `lib/auth/server.ts` | Single source of truth for API auth + tenant resolution. | Added source-of-truth header comment and enforced tenant membership-based context usage. |
| `app/api/contractors/route.ts` | List/create contractors for the authenticated company. | Replaced legacy `user_metadata` auth checks with tenant-context auth and company-derived scoping. |
| `app/api/contractors/[id]/route.ts` | Read/update/delete one contractor within tenant scope. | Migrated to tenant-context auth and tightened company-scoped operations. |
| `app/api/invoices/route.ts` | List/create invoices for tenant users/contractors/admins. | Replaced legacy auth pattern; ensured company ID comes from auth context; validated contractor-company ownership on create. |
| `app/api/invoices/[id]/route.ts` | Read/update one invoice with role-aware access. | Switched to tenant-context auth and tenant-safe invoice access checks. |
| `app/api/invoices/[id]/reject/route.ts` | Admin rejection of invoice + audit/email side effects. | Migrated auth to tenant-context and made reject flow company-scoped. |
| `app/api/invoices/approve/route.ts` | Legacy approve endpoint for invoice payout trigger. | Added tenant auth + admin gate; scoped invoice by authenticated company before payout. |
| `app/api/invoices/[id]/approve/route.ts` | Primary approve endpoint for invoice payout trigger. | Passed authenticated `companyId` into payout execution path for tenant safety. |
| `app/api/payouts/execute/route.ts` | Execute payout for an invoice. | Added tenant auth + admin check; stopped trusting request wallet/amount and now derives from tenant-scoped DB invoice/contractor data. |
| `lib/services/invoice.service.ts` | Invoice business rules and DB writes. | Added contractor-company ownership checks on create and company-scoped reject behavior. |
| `lib/services/payout.service.ts` | Payout orchestration + Solana transfer + DB status transitions. | Added optional `companyId` guard to block cross-tenant payout access. |
| `tests/integration/invoice-flow.test.ts` | Integration validation of invoice lifecycle. | Updated tests to include tenant membership and bearer auth under stricter auth model. |
| `tests/integration/payout-flow.test.ts` | Integration validation of payout lifecycle. | Updated tests to include tenant membership and bearer auth under stricter auth model. |
| `components/judge-demo-panel.tsx` | Judge-only admin UI panel for demo actions. | Added panel (env-gated) with buttons for seeding, submit, approve+release, audit CSV export, and live timestamped status log. |
| `app/api/demo/seed/route.ts` | Seed demo tenant data for judge flow. | Added judge-mode-gated, idempotent seed endpoint for demo company context (2 contractors, 3 pending invoices, summary response). |
| `app/api/demo/submit-invoice/route.ts` | Mark first pending invoice as submitted for demo flow. | Added judge-mode-gated endpoint to set `submittedAt` on first tenant-scoped pending invoice. |
| `app/dashboard/page.tsx` | Main admin dashboard composition. | Integrated the Judge Demo panel into the dashboard. |
| `README.md` | Judge-facing project documentation. | Rewrote README for judge demo flow, concise setup, stack table, and real-vs-demo behavior clarity. |
| `tsconfig.typecheck.tsbuildinfo` | TypeScript incremental cache artifact. | Auto-generated build metadata update from local typecheck run. |

