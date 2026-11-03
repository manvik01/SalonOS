# SAL-002 migrations and forward recovery

Development/CI only. These notes are not a production cutover plan.

## Migrations in this slice

Applied in order by `node scripts/migrate.mjs` using `MIGRATE_DATABASE_URL` (table-owner / superuser role):

| File | Purpose |
|---|---|
| `001_extensions.sql` | `btree_gist`, `pgcrypto`, `app_current_tenant_id()`, `salonos_app` role |
| `002_identity.sql` | tenants, users, memberships, sessions, invitations, throttle, audit |
| `003_catalog_team.sql` | locations, policies, staff, resources, services, versions, skills, availability, clients, notes |
| `004_scheduling.sql` | appointments, items, reservations (exclusion), revisions, idempotency |
| `005_rls_grants.sql` | grants to `salonos_app` and tenant RLS policies |

The application role `salonos_app` has `NOBYPASSRLS`. Command transactions set `app.tenant_id` with `set_config(..., true)` so the setting is transaction-local.

## Expand / migrate / contract

This slice only **adds** tables, indexes, functions and policies. There is no destructive rewrite of existing production data (there is no production database). A later contract phase may drop the in-memory scheduler as an HTTP path; the reference class remains a test fixture.

## Crash and retry

- Uncommitted scheduling transactions roll back with PostgreSQL. Occupancy locks and exclusion constraints then show the previous committed state.
- Create retries with the same `(tenant_id, command, idempotency key)` and the same fingerprint return the stored appointment JSON. A different fingerprint is `IDEMPOTENCY_MISMATCH`.
- Do not restore a backup from before a confirmed reservation if later processes have already booked against live clocks; that is unsafe after real traffic. Forward recovery is: keep the newer database, retire expired holds, and replay idempotent commands.

## Expired holds

`now()` is not part of the exclusion constraint. `SchedulingService` retires `held` reservations with `expires_at <= clock` **after** locking occupancy rows and **before** insert. Operators may also run `node scripts/expire-holds.mjs` (uses migrator or app URL). Correctness of acquire does not require a daemon.

## Local / CI database

- Docker: `docker compose up -d postgres`, then set URLs from `.env.example` using user `postgres` as migrator.
- Apt/local: `scripts/setup-local-postgres.sh` then `npm run migrate` and `npm test`.
- GitHub Actions: Postgres 16 service, `npm ci && npm test`.
