import { createPool } from '../../src/persistence/pool.mjs';
import { migrate } from '../../src/persistence/migrate.mjs';
import { DATABASE_URL, MIGRATE_DATABASE_URL } from './env.mjs';

const TRUNCATE = `
TRUNCATE TABLE
  command_idempotency,
  appointment_revisions,
  reservations,
  appointment_items,
  appointments,
  occupancy_locks,
  restricted_notes,
  clients,
  blocked_intervals,
  availability_windows,
  staff_skills,
  resource_services,
  service_versions,
  services,
  staff,
  resources,
  booking_policies,
  locations,
  invitations,
  sessions,
  memberships,
  tenants,
  users,
  auth_throttle,
  audit_events
RESTART IDENTITY CASCADE`;

export async function createTestPools() {
  await migrate(MIGRATE_DATABASE_URL);
  const migrator = createPool(MIGRATE_DATABASE_URL);
  const app = createPool(DATABASE_URL);
  return { migrator, app };
}

export async function resetDatabase(migrator) {
  await migrator.query(TRUNCATE);
}

export async function closePools(pools) {
  await Promise.all([pools.migrator.end(), pools.app.end()]);
}
