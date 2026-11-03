# Architecture Decision Records

Status: accepted for SAL-002 development. These decisions apply to the modular command layer on branch `build/sal-002-persistent-scheduling`. They do not authorize production hosting, live credentials, or a merge to `main`.

## ADR-001: Application runtime and module boundaries

**Date:** 2026-11-03  
**Status:** Accepted  
**Requirements:** TDD architecture, CAL02–CAL05, SAL-002 scope

### Context

The technical design calls for a TypeScript modular monolith: responsive web client, authenticated server API, PostgreSQL system of record, durable jobs, and adapters. The reviewed booking reference on `ce983c2` is an in-memory single-process model with a Node.js ESM test harness and no framework. SAL-002 must replace that reference as the authoritative scheduling path without delivering the full staff UI (SAL-003) or checkout (SAL-004).

### Decision

1. **Runtime.** Node.js 20+ (CI and local: Node 20 or 22). ESM modules. PostgreSQL 16 is the system of record. The `pg` driver is the only new runtime database dependency in this slice.
2. **Language.** TypeScript is the approved application language for the eventual staff/client apps. This slice ships Node ESM JavaScript with the same module boundaries so the existing `node --test` harness remains the runner and the reviewed `src/domain/booking.mjs` fixture stays loadable without a compile step. A later PR may rename files to `.ts` without changing folders or imports of domain rules.
3. **Not in this PR.** Next.js, a browser UI, a durable job product queue, object storage, and payment/email adapters. SAL-002 delivers a modular **domain + persistence + HTTP command layer**.
4. **Module boundaries.** Writes stay inside the owning module. HTTP handlers validate transport, resolve a session, and call module services. Domain planning and error codes do not import `pg` or `node:http`.

| Module | Owns | This slice |
|---|---|---|
| Identity | User, membership, session, invitation, password verifier, throttle | Implemented for scheduling authz |
| Catalog | Service, service version, resource eligibility | Versioned snapshots for booking |
| Team | Staff, skills, shifts, leave/breaks | Validation inputs for reservations |
| CRM | Client identity used by appointments | Tenant-scoped client rows; ownership checks |
| Scheduling | Appointment, appointment item, reservation, availability, hold expiry | Authoritative path |
| Audit | Append-only authz denials and scheduling mutations | Minimal events |
| API | `/v1` JSON commands | Thin Node `node:http` server |
| Persistence | Migrations, pool, RLS session GUC | PostgreSQL 16 |

5. **Authoritative vs fixture.** `PersistentScheduler` (database transactions and constraints) is the development scheduling authority. `ReferenceScheduler` remains an in-memory behavioral fixture for regression tests. Shared interval/planning rules live in `src/domain/plan.mjs` so the two cannot silently diverge on duration, buffers, or half-open overlap.
6. **API.** Version under `/v1`. Commands use JSON bodies, `Authorization: Bearer`, `Idempotency-Key` on create, and `expectedVersion` / `If-Match` on patch. Errors return `code`, safe `message`, and `correlationId`. HTTP status: 401 unauthenticated, 403 unauthorized, 404 unknown-to-this-tenant, 409 conflict/stale/idempotency mismatch, 422 rule violation, 429 throttle.

### Consequences

- Independent QA can exercise scheduling without a UI.
- SAL-003 consumes these commands rather than embedding SQL.
- Introducing Next.js later must keep domain imports free of route handlers.

---

## ADR-002: Authentication and tenant isolation

**Date:** 2026-11-03  
**Status:** Accepted  
**Requirements:** WS02, WS03, CLI-ownership, U14, U15, TDD identity

### Context

The in-memory reference accepts a caller-supplied `tenantId`. That is not authentication. Production identity (managed IdP, owner MFA, mailed recovery) is not selected yet. SAL-002 still needs membership-checked commands, tenant-safe FKs, and RLS defense-in-depth so concurrent scheduling work cannot leak across tenants.

### Decision

1. **Session membership is the tenant source.** Login creates a session bound to `(user_id, tenant_id)` that must match an **active** membership. Commands take a session token. The service loads `AuthContext { userId, tenantId, role, membershipStatus }`. A request body `tenantId`, if present, must equal the session tenant; otherwise 403. Callers cannot select another tenant by header or object id.
2. **Never trust object ids without the session tenant.** Lookups always include `WHERE tenant_id = auth.tenantId`. Missing rows and cross-tenant ids both return `NOT_FOUND` with no metadata about the other tenant.
3. **Passwords and sessions (development).** Passwords are stored as `scrypt` hashes (`node:crypto`, N=16384, r=8, p=1, 16-byte salt, 32-byte key) in `scrypt$N$r$p$salt$hex` form. Session tokens are 32-byte values; only SHA-256 hashes are stored. Sessions expire (default 12 hours) and can be revoked. Disabling a membership or user sets `disabled_at` and revokes sessions for that tenant membership. This is **not** a production identity provider. A maintained IdP / MFA / emailed reset remains an open ADR for launch; SAL-002 records the gap rather than inventing a mailer.
4. **Invitations (WS02).** Owner/manager may invite by email + role. Invite tokens are stored hashed, expire (default 7 days), and can be revoked. Accepting creates/links a user and an active membership. Disabling a membership does not delete staff, appointments, or items (historical attribution remains).
5. **Login privacy and throttle (WS03).** Login and recovery always return generic messages. A dummy scrypt verify runs when the email is unknown so timing does not reveal accounts. Throttle key is `sha256(normalized_email)` with a 15-minute window and a cap of 5 failed attempts (`429 RATE_LIMITED`). Recovery does not disclose whether the email exists; outbound mail is **not** implemented.
6. **Roles used in this slice.** `owner`, `manager`, `receptionist`, `practitioner`. Receptionist may create/get/reschedule/cancel/no-show appointments for the session tenant and read ordinary client ids. Receptionist is **denied** restricted-note read, client export, and payout-settings changes (U14). Denials write an audit row (`outcome = denied`) without note bodies or secrets.
7. **Database tenancy.**
   - `tenant_id` on every business table.
   - Composite foreign keys `(tenant_id, …)` so a tenant A appointment cannot reference tenant B clients, services, staff, or resources.
   - RLS enabled on business tables. Policies compare `tenant_id` to `current_setting('app.tenant_id')::uuid`. The application role `salonos_app` has `NOBYPASSRLS`. Each command transaction runs `set_config('app.tenant_id', auth.tenantId, true)` before writes. Table owner / migrator is a separate role used only for migrations and test fixtures.
8. **Jobs, files, caches.** Not shipped here. Any future job must carry `tenant_id` from the producing transaction and must not accept a caller-supplied tenant to load credentials.

### Consequences

- Application bugs that omit a tenant predicate still fail RLS or composite FKs when using `salonos_app`.
- Tests must use the app role for command paths and the migrator role for schema and explicit FK-violation proofs.
- Production MFA, email verification, password-reset mail, and a managed IdP are known limitations.

---

## ADR-003: PostgreSQL reservation constraints, transactions and idempotency

**Date:** 2026-11-03  
**Status:** Accepted  
**Requirements:** CAL02–CAL05, U01, U02, TDD scheduling transaction

### Context

Same-process atomic JavaScript is not concurrency control. Two Node processes (or two API servers) must not confirm overlapping occupancy for the same staff or exclusive resource. Holds expire in five minutes by default. Exclusion constraints must not use a volatile `now()` predicate, which would make visibility time-dependent and unindexable as a stable invariant.

### Decision

1. **Intervals.** Half-open `[start, end)` stored as `timestamptz` plus `tstzrange(starts_at, ends_at, '[)')`. Adjacent appointments are valid. Occupied range includes service duration **and** cleanup/buffer.
2. **Sequential services only.** Items are planned back-to-back (next start = previous occupied end). Recurring, group, and parallel requests are rejected (`UNSUPPORTED`) rather than approximated (CAL09).
3. **Active occupancy.** Reservation `status IN ('held', 'confirmed')` occupies capacity. `expired` and `released` do not. Appointment operational states: `held → confirmed → arrived → in_service → completed`, with `cancelled` / `no_show` releasing reservations. Payment state is not stored here.
4. **Exclusion constraint.** `btree_gist` exclusion on `(tenant_id, resource_kind, resource_id, occupied_range)` **where status is held or confirmed**. No `now()` in the predicate. Conflicting inserts abort the transaction (`23P01` → `CONFLICT` / HTTP 409).
5. **Expired holds.** Server clock is injected (`clock.now()`), never the client's clock. Before acquire/reschedule, the transaction calls `retire_expired_holds(tenant_id, now)` which row-locks and sets `status = 'expired'` (and cancels still-`held` appointments) **before** inserting new ranges. A hold whose `expires_at <= now` cannot block a later reservation after this step. Default hold length is the tenant policy `hold_minutes` (5). UI expiry is informational.
6. **Lock order.** Occupancy lock rows `(tenant_id, resource_kind, resource_id)` are created with staff/resources. The transaction `INSERT … ON CONFLICT DO NOTHING` then `SELECT … ORDER BY resource_kind, resource_id FOR UPDATE` for every identity the command will occupy (union of old and new ids on reschedule). Resource kind sorts as text; ids as UUID text. This is the only lock order.
7. **Create transaction.**
   1. Resolve session tenant; load catalog, skills, shifts, leave, client, policy.
   2. Plan occupied ranges from the **current** service version (snapshot those fields onto items).
   3. `BEGIN`; set RLS GUC; advisory lock on idempotency key; occupancy locks in stable order; retire expired holds.
   4. If idempotency row completed: same fingerprint returns the stored body; different fingerprint → `IDEMPOTENCY_MISMATCH`.
   5. Recheck qualifications, shift coverage, leave/break overlap, then `INSERT` appointment, items, confirmed/held reservations, idempotency response; `COMMIT`.
   6. Any conflict/exclusion/validation error `ROLLBACK`s all new ranges.
8. **Idempotency.** Unique `(tenant_id, command, key)`. Fingerprint is canonical JSON of `{ clientId, start, items: [{ serviceId, staffId, resourceId }] }` after planning normalization (any-staff assignment is persisted and included). Concurrent retries of the same key take `pg_advisory_xact_lock` on a hash of `(tenant_id, command, key)` so they serialize and return one appointment.
9. **Reschedule.** Requires `expectedVersion`. On mismatch → `STALE_VERSION` without writes. On success, reservations for the appointment are set to `released` then replaced in the **same** transaction, items shifted by the start delta using **stored snapshots** (price/duration/buffer/service_version do not re-read the live catalog), `version` increments, original `id` is preserved. Failure rolls back; the original ranges remain. History is appended to `appointment_revisions`.
10. **Service snapshots.** `service_versions` are immutable. Catalog edits insert a new version and point `services.current_version` at it. Existing `appointment_items` keep `(service_id, service_version, price_minor, duration_minutes, buffer_minutes)`.
11. **Clock and recovery.** Application `now` is a parameter. After a crash, incomplete transactions roll back (PostgreSQL). Forward recovery: rerun the same idempotency key (same fingerprint returns the committed appointment; no second occupancy). Expired holds are retired on the next scheduling command or by `scripts/expire-holds.mjs`. Restoring a backup that predates confirmed reservations can resurrect double-bookings against later reality; do not restore blindly after production traffic (no production cutover in this PR). Expand/migrate/contract: this slice only **adds** tables.

### Consequences

- Multi-process tests must use two connections/processes against one database, not `Promise.all` in one in-memory map.
- Operators must run hold retirement frequently enough for UX; correctness of acquire does not depend on a daemon because acquire itself retires.
- Exclusion + occupancy locks together meet U01; skills/shift/leave checks meet U02.
