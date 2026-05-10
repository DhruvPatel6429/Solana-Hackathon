# Scaling Readiness

## Phase 5 Load Testing
Use `scripts/load-test-platform.ts` to generate `artifacts/load-test-report.json`.

## Coverage
- High-volume invoice writes
- Payout persistence throughput
- Batch reconciliation writes
- Dodo webhook storm processing
- Helius webhook storm processing
- Concurrent dashboard metrics/reconciliation reads

## Optimization Areas
- Bulk insertion paths for invoice ingestion
- Queue-backed webhook ingestion with backpressure
- Materialized metrics views and caching for dashboards
- Partitioning by organization/company for high-scale tenants
