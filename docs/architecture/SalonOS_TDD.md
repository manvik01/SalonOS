# SalonOS Technical Design Document

Version 1.0 · 3 November 2026 · Proposed architecture for PRD 1.0 and MVP 1.0

Related documents: [PRD](../product/SalonOS_PRD.md) · [MVP](../product/SalonOS_MVP.md) · [ADRs](ADRs.md) · [API contracts](api-contracts/README.md) · [operating model](../delivery/SalonOS_Virtual_Product_Delivery_Team.md)

TDD means Technical Design Document here. The design includes test strategy but is not an executed test report. Stack choices below are recommendations to validate during implementation, not an existing codebase.

## Architecture

Use a TypeScript modular monolith: responsive web client, authenticated server API, PostgreSQL system of record, durable asynchronous jobs, private attachment storage and adapters for payment/email. Next.js is a candidate UI/server framework; choose maintained versions at project setup. Keep domain logic independent of framework handlers. A separate worker process consumes jobs from a durable queue or a PostgreSQL-backed queue selected in an ADR.

Public booking exposes only published catalog and server-calculated slots. Staff console requires authenticated tenant membership. Provider webhooks enter a signature-verified intake service and durable inbox. No browser receives privileged database credentials or provider secrets.

Modules: Identity, Workspace, Catalog, Scheduling, CRM, Commerce, Payment, Benefits, Inventory, Team, Engagement, Reporting, PlatformBilling, Audit and Operations. Modules own their writes; shared transactions coordinate money, entitlements and stock. Platform subscription billing has separate objects and accounts from salon customer money.

## Identity and authorization

Resolve user and tenant membership from a validated session. Every command authorizes action, object and location scope; never trust a request-supplied tenant ID without membership validation. Use tenant_id on business tables, composite tenant-scoped foreign keys, explicit scoped queries and database row-level security as defense in depth where supported. Application DB roles must not bypass the intended policies. Include tenant scope in jobs, files, exports and cache keys.

Role policy separates booking, restricted notes, contact access, refunds, discounts, exports, role administration and payout settings. Owner requires MFA; sensitive settings require reauthentication. Disable staff sessions immediately while preserving historical attribution. Support access is an explicit time-limited, audited grant.

## Data contracts

| Aggregate | Main fields and constraints |
|---|---|
| Appointment | tenant, location, client, state, UTC times, policy snapshot, version and source |
| AppointmentItem | service/variant snapshot, price, duration, practitioner, resource and sequence |
| Reservation | tenant, occupied resource identity, half-open time range, held/confirmed status and expiry |
| Sale and SaleLine | currency, immutable commercial snapshots, discounts/tax, staff attribution, receipt ID and version |
| Payment | provider/method, external reference, amount, authoritative status and idempotency key |
| TenderAllocation | payment/deposit/credit source linked once to a sale, amount and reversal reference |
| Refund and CreditNote | original sale/payment/line references, bounded value, reason, approval and independent status |
| FinancialJournal | balanced debit/credit entries per currency, source key, effective/recorded time and reversal links |
| BenefitPurchase and Ledger | sold terms snapshot, credit lots/entitlements, reserved/consumed/restored movements and unique source keys |
| StockMovement | product, location, signed quantity, unit/cost, type, source reference and actor |
| ConsentEvent | client, channel, purpose, decision, source, timestamp and notice version |
| ProviderInbox and Outbox | unique event ID, tenant, type, payload reference, attempt count and processing state |

Use UTC timestamps and IANA location timezone for business-day interpretation. Money uses integer minor units plus currency; rates and fractional quantities use fixed decimal precision. Financial posting rules, tax treatment and account mapping require accountant review before production.

## Scheduling transaction

1. Validate service version, booking window, qualifications, shift, leave, resource and policy.
2. Derive actual occupied ranges including cleanup/buffers. R1 supports sequential services only.
3. Begin transaction, acquire locks in stable resource-ID order, recheck reservations and insert all required ranges atomically.
4. Enforce range exclusion for active reservations where feasible. Every practitioner and exclusive room/equipment has a reservation identity. Future capacity greater than one requires a separate capacity model.
5. Persist appointment, snapshot and outbox event; commit. A conflict rolls back all new reservations and returns 409 with refreshed availability.
6. Rescheduling replaces ranges within one transaction so failure preserves the original appointment.

Use half-open [start,end) intervals. Do not put a volatile now() predicate into a database exclusion constraint. Expiry worker and reservation transaction explicitly retire expired holds before acquisition, with row locks. Start with a configurable five-minute hold; client UI displays expiry but server time is authoritative.

Operational states: held → confirmed → arrived → in_service → completed, with controlled cancelled/no_show exits. Payment state is separate. A late deposit success after hold expiry creates an exception for refund/reassignment, never an overlapping booking.

## Checkout and ledger transaction

Server recomputes line totals, eligible discount allocation, taxes, tips and charges from the approved quote/version. Apply deposit once and validate permitted tender. Check currency and remaining balance. For prepaid/stock effects, lock rows in stable order and post unique source-key movements within the database transaction.

External provider calls cannot join the database transaction. Create and persist a payment intent/reference with idempotency key, call provider outside the locked transaction, and reconcile verified outcome. A browser redirect is not payment success. After confirmed capture, finalize immutable sale and allocations in a repeat-safe transaction. If local finalization fails after capture, exception processing resumes that same operation; never charge again to recover.

Enforce one receipt sequence per tenant, bounded refunds, no negative benefit balances and no duplicate session consumption. An authorized finalized part-paid sale remains receivable. Refunds create credit notes and tender reversals, not artificial unpaid debt. Provider refund status remains pending until verified. Corrections never delete original journals.

Each benefit unit is consumed at actual completed treatment by the default PRD rule, even if cash extras remain due; booking only reserves it. A manager-approved reversal restores once. Cancellation policy may propose a fee or consumption but requires explicit authorized action. New prepaid issuance activates only after confirmed payment. Gift-card redemptions exclude prepaid purchases by default.

## Provider inbox and outbox

Verify webhook signature and freshness using raw request bytes according to the selected provider's current contract. Persist provider/event ID under a unique constraint before acknowledging; process asynchronously. On retries, return the existing result. Do not assume events arrive in order; query authoritative provider status when contradictory. Persist source timestamps and processing history.

Outbox records business events in the same transaction as state change. Worker claims jobs with leases, retries transient failures with bounded backoff and moves permanent failures to a visible exception queue. Consumers deduplicate by business effect key. Example keys: payment provider reference, sale finalization, benefit purchase issuance, sale-line stock decrement, appointment/version/reminder type. Delivery failure cannot roll back a successful sale.

Scheduled reconciliation compares provider captures, refunds, disputes, fees and payouts with local records and raises/repairs missing events with audit history. Never include cash or manually recorded bank transfers in processor available balance.

## API conventions

Version under /v1. Commands use validated typed schemas; errors return code, safe message, field details and correlation ID. Return 403 for unauthorized actions, 409 for reservation/stale-version conflict, 422 for rule violations and 429 for rate limit. Do not reveal inaccessible object metadata.

POST /appointments requires client, service versions, start and allocations plus Idempotency-Key. PATCH requires expected version/If-Match. POST /sales/{id}/payments accepts amount and allowed method; response includes pending/succeeded/failed. POST /sales/{id}/finalize verifies authoritative totals and posting state. POST /refunds references original payment/lines with reason and approval. Benefit redemption is staff-authorized and source-key unique. Reports always include filter scope, metric version and data watermark.

Public booking should use expiring signed reservation/quote references, not client-search APIs. Uploads use scoped private URLs, file validation and malware scanning. Export download authorization expires and remains tied to requester permissions.

## Inventory and reporting

Inventory is movement-based. Retail sale, sellable return, damage and service consumption are separate event types. Use documented weighted-average cost; round consistently and preserve historical cost snapshots. A stockcount begins from a snapshot and reconciles intervening movements rather than replacing the current quantity blindly.

Reports use canonical SQL/domain definitions shared with exports. Collections differ from sales, earned prepaid value and payouts. Track prepaid liability roll-forward by instrument. Report business timezone and date basis explicitly. Lock approved periods and post late corrections in the next open period with original references; retain report snapshots needed to reproduce an approved close.

## Environments and delivery

Development and CI use synthetic fixtures and isolated DB. Staging has test payment/email accounts and cannot send to real clients. Production has distinct credentials in a secret manager, least-privilege service accounts and a protected release workflow. No CI deployment pipeline is created by this document.

Use expand/migrate/contract schema changes: add compatible fields, deploy compatible code, backfill and validate, then remove obsolete paths after a safe window. Destructive migration requires explicit approval and a verified export/restore plan. After external money movement, restoring old DB state alone is unsafe; reconcile provider records and perform controlled forward recovery.

Release manifest pins code SHA, schema migration version, PRD/manual versions, test artifacts, known issues and exact deployment target. G6 and G7 independently validate; G8 prepares staging/recovery evidence; founder authorizes production release. The team charter defines task state and handoff contracts.

## Verification strategy

| Layer | Required evidence |
|---|---|
| Domain | Money rounding, discount allocation, refund bounds, entitlement and state-transition tests |
| Database integration | Concurrent reservations, last-balance redemption, unique source keys, stock race and tenant foreign-key constraints |
| Provider contract | Signed webhook fixtures, replay/out-of-order events, unknown outcome, missing callback and reconciliation |
| API security | Role/location checks, tenant ID guessing, export/attachment ownership and disabled sessions |
| Browser journey | Setup → booking → completion → checkout → receipt → daily close; keyboard and mobile flow |
| Operations | Load results, backup restore, failed worker recovery, monitoring/alerts and rollback/forward recovery rehearsal |

Map results to PRD U01–U25 and each requirement ID. No runtime tests have yet run because this repository documentation does not implement the application.

## Launch objectives and unresolved ADRs

Proposed objectives from PRD: p95 ordinary read below 800ms and write below 1.5s excluding provider latency at stated test load; 99.9 percent monthly availability objective; RPO at most 15 minutes and RTO at most four hours demonstrated by restore. Measure before promising an SLA.

Resolve identity provider, exact framework/library versions, queue implementation, host/region, payment provider and supported tenders, sender channels, backup configuration, accountant-approved ledger/tax mapping and monthly budget before implementation freeze. Follow PRD and MVP scope; do not silently add marketplace, payroll, autonomous financial actions or unsupported multi-location behavior.
