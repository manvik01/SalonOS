# Booking Reference Independent Review

Reviewed 3 November 2026 by a ChatGPT validation agent separate from the implementing agent. This report covers local source files, not a published commit or production deployment.

## Result

**PASS for the limited reference-model test scope:** 16 tests passed, zero failed, skipped or cancelled. This is not application UAT or production-readiness approval.

Environment: Node.js `v24.22.1`. Working directory: repository root. Commands executed: `node --version`, `npm test` (runs `node --test`) and `sha256sum` for the baseline below. The npm environment emitted an unrelated `http-proxy` configuration warning; test execution exited successfully.

## Execution baseline

| Local source | SHA256 |
|---|---|
| src/domain/booking.mjs | 845b988daec46283f39dcff5fef3b32dc50c899f3d3763ff96b8b53a534066d1 |
| test/booking.test.mjs | 0f09feb26c350d33a893b717a23aecca93299cc76b4a86cc57280c2499cdfd8a |
| test/booking.review.test.mjs | 0f4b7e02bb9bc95ef7f643e4c456fc9d1adfad5c5c835a1f4317f4b985d7c7a9 |
| package.json | 26b7c4146f9bdc10ca8639fdadcc333d6542481e4440f5d793f28f492c5de8ac |

## Tested scope

Tests cover same-process competing requests for staff/resources, half-open adjacency, tenant-scoped lookup/conflicts/idempotency, idempotency input mismatch, sequential services and cleanup, staff qualifications, required resources, availability/blocked intervals, versioned rescheduling, preservation of an original booking after failed rescheduling, copied snapshots, timezone validation and malformed commands.

Four tests were added independently in `test/booking.review.test.mjs`. Two initially reproduced defects; both now pass after implementing-agent fixes. The other independent checks prove returned-object mutation cannot corrupt stored idempotency responses and a malformed reschedule preserves the appointment. Sequential items cannot self-overlap in this model because each item starts after the prior item's cleanup interval.

## Findings and verification

| Finding | Initial severity and reproduction | Fix inspected and verified |
|---|---|---|
| Nonexistent date accepted | Medium: `2026-02-30T09:00:00Z` silently became `2026-03-02T09:00:00.000Z` | Timestamp parser now validates calendar components, leap-year month length, clock fields and timezone before `Date.parse`; regression rejects the nonexistent date with `INVALID` |
| Null command raised uncontrolled exception | Low: `create('A', null, key)` raised raw `TypeError` | Object guards now reject null create/reschedule commands and malformed service items; null-create regression returns controlled `INVALID` |

Neither finding remains open within the tested scope. Further API schema and configuration validation remain required during implementation.

## Remaining production blockers

- State is in memory; process restart loses it. Same-process atomic code is not database concurrency protection, multi-process safety or distributed idempotency.
- Tenant IDs are supplied to the reference methods. Tests demonstrate scoped data behavior, not authenticated tenant membership, authorization or database row-level security.
- No HTTP API, browser UI, persistent schema, production migrations, complete client validation, policy windows, booking holds/expiry or cancellation lifecycle exists in this reference.
- No money ledger, payment provider, checkout, inventory, messaging or reconciliation integration has been implemented by these files.
- No load, browser accessibility, backup/restore, external-provider or deployment tests were executed.
- Full PRD requirement coverage and the end-to-end book-to-checkout business journey remain unverified.

Recommendation: suitable as a reviewed starting reference and regression fixture set for the next implementation task. Do not deploy or represent it as a business-ready scheduling service.
