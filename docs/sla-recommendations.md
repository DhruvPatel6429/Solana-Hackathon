# SLA Recommendations

## Service Targets (Recommended)
- API availability: 99.9%
- Payout initiation API p95 latency: < 600ms (excluding chain finality)
- Webhook processing acknowledgement: < 5s
- Critical incident acknowledgement: < 15 minutes
- Recovery objective (RTO): < 2 hours
- Recovery point objective (RPO): < 15 minutes

## Commercial Notes
These targets should be converted into contractual SLAs only after baseline production telemetry is collected over multiple billing cycles.
