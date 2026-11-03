# SalonOS

Salon management portal specification plus a persistent, tenant-safe scheduling command layer. This is not a production web portal. Checkout, payments, and a staff UI are out of scope for SAL-002.

## Product documents

- [Product requirements](docs/SalonOS_PRD.md)
- [MVP scope and delivery plan](docs/SalonOS_MVP.md)
- [Technical design document](docs/SalonOS_TDD.md)
- [Proposed usage manual](docs/SalonOS_Usage_Manual.md)
- [Agent team and Grok handoff instructions](docs/SalonOS_Agent_Team_and_Grok_Handoff.md)
- [Starting requirements backlog](docs/SalonOS_Starting_Backlog.json)
- [Joint build queue and Grok kickoff prompt](docs/delivery/COLLABORATION.md)
- [Independent booking reference review](docs/validation/booking-reference-review.md)
- [Architecture decision records](docs/architecture/ADRs.md)
- [Migrations and forward recovery](docs/architecture/migrations-and-recovery.md)
- [SAL-002 handoff](docs/delivery/handoffs/SAL-002.md)

## What is implemented

- In-memory `ReferenceScheduler` remains a behavioral fixture (`src/domain/booking.mjs`).
- PostgreSQL 16 is the authoritative store for appointments, items, reservations, catalog snapshots, memberships and sessions.
- Authenticated `/v1` JSON commands (`src/api/http.mjs`) resolve tenant membership from a session token. Request-supplied tenant ids are not trusted.
- Staff skills, shifts, leave/breaks, buffers, idempotency, optimistic reschedule versions, expired-hold retirement and exclusion constraints are enforced in the scheduling transaction.

Not implemented: responsive booking UI, cash checkout, live payments, production identity provider/MFA mail, recurring/group/parallel booking.

## Tests

Requires Node.js 20 or later.

Domain fixture tests (no database):

```bash
npm run test:domain
```

Full suite, including Postgres concurrency and tenant-isolation tests:

1. Start PostgreSQL 16 (`docker compose up -d postgres` or `scripts/setup-local-postgres.sh`).
2. Copy `.env.example` URLs into the environment. Docker users typically migrate as `postgres://postgres:postgres@127.0.0.1:5432/salonos_test`.
3. `npm install` (or `npm ci`)
4. `npm test`

Synthetic passwords in tests and setup scripts are fixtures only.
