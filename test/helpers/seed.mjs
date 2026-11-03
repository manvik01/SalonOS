import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/identity/passwords.mjs';
import { AuthService } from '../../src/identity/auth.mjs';
import { CatalogService } from '../../src/scheduling/catalog.mjs';
import { SchedulingService } from '../../src/scheduling/service.mjs';
import { ids, PASSWORD, time } from './ids.mjs';

const window = { start: time('08'), end: time('18') };

const insertTenant = async (client, tenantId, name, passwordHash) => {
  await client.query(
    `INSERT INTO tenants (id, name) VALUES ($1,$2)`,
    [tenantId, name],
  );
  await client.query(
    `INSERT INTO booking_policies (tenant_id, hold_minutes, max_advance_days) VALUES ($1, 5, 3650)`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO locations (tenant_id, id, name) VALUES ($1,$2,'Main')`,
    [tenantId, ids.location],
  );
  const ownerId = tenantId === ids.tenantA ? ids.ownerA : ids.ownerB;
  const deskId = tenantId === ids.tenantA ? ids.deskA : ids.deskB;
  const ownerEmail = tenantId === ids.tenantA ? 'owner-a@example.test' : 'owner-b@example.test';
  const deskEmail = tenantId === ids.tenantA ? 'desk-a@example.test' : 'desk-b@example.test';
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1,$2,$3,$4), ($5,$6,$3,$7)`,
    [ownerId, ownerEmail, passwordHash, 'Owner', deskId, deskEmail, 'Desk'],
  );
  await client.query(
    `INSERT INTO memberships (tenant_id, user_id, role, status) VALUES
     ($1,$2,'owner','active'), ($1,$3,'receptionist','active')`,
    [tenantId, ownerId, deskId],
  );
  await client.query(
    `INSERT INTO staff (tenant_id, id, display_name) VALUES ($1,$2,'Alice'), ($1,$3,'Bob')`,
    [tenantId, ids.alice, ids.bob],
  );
  await client.query(
    `INSERT INTO resources (tenant_id, id, display_name) VALUES ($1,$2,'Room')`,
    [tenantId, ids.room],
  );
  await client.query(
    `INSERT INTO occupancy_locks (tenant_id, resource_kind, resource_id) VALUES
     ($1,'staff',$2), ($1,'staff',$3), ($1,'resource',$4)`,
    [tenantId, ids.alice, ids.bob, ids.room],
  );
  await client.query(
    `INSERT INTO services (tenant_id, id, name, current_version) VALUES ($1,$2,'Cut',1), ($1,$3,'Wash',1)`,
    [tenantId, ids.cut, ids.wash],
  );
  await client.query(
    `INSERT INTO service_versions (tenant_id, service_id, version, duration_minutes, buffer_minutes, price_minor, resource_required)
     VALUES ($1,$2,1,60,0,5000,true), ($1,$3,1,30,15,2000,false)`,
    [tenantId, ids.cut, ids.wash],
  );
  await client.query(
    `INSERT INTO staff_skills (tenant_id, staff_id, service_id) VALUES
     ($1,$2,$4), ($1,$2,$5), ($1,$3,$4), ($1,$3,$5)`,
    [tenantId, ids.alice, ids.bob, ids.cut, ids.wash],
  );
  await client.query(
    `INSERT INTO resource_services (tenant_id, resource_id, service_id) VALUES ($1,$2,$3)`,
    [tenantId, ids.room, ids.cut],
  );
  for (const [kind, subject] of [['staff', ids.alice], ['staff', ids.bob], ['resource', ids.room]]) {
    await client.query(
      `INSERT INTO availability_windows (tenant_id, id, subject_kind, subject_id, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenantId, randomUUID(), kind, subject, window.start, window.end],
    );
  }
  await client.query(
    `INSERT INTO clients (tenant_id, id, display_name) VALUES ($1,$2,'Client')`,
    [tenantId, ids.client],
  );
};

export async function seedWorld(migrator, app, { clock } = {}) {
  const passwordHash = hashPassword(PASSWORD);
  const client = await migrator.connect();
  try {
    await client.query('BEGIN');
    await insertTenant(client, ids.tenantA, 'Tenant A', passwordHash);
    await insertTenant(client, ids.tenantB, 'Tenant B', passwordHash);
    await client.query(
      `INSERT INTO restricted_notes (tenant_id, id, client_id, body) VALUES ($1,$2,$3,'sensitive')`,
      [ids.tenantA, ids.noteA, ids.client],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const auth = new AuthService(app, { clock, sessionTtlMs: 40 * 24 * 60 * 60 * 1000 });
  const deskA = await auth.login('desk-a@example.test', PASSWORD, ids.tenantA);
  const ownerA = await auth.login('owner-a@example.test', PASSWORD, ids.tenantA);
  const deskB = await auth.login('desk-b@example.test', PASSWORD, ids.tenantB);
  const ownerB = await auth.login('owner-b@example.test', PASSWORD, ids.tenantB);
  const session = token => ({ userId: token.userId, tenantId: token.tenantId, role: token.role });
  const options = { clock: clock ?? (() => new Date('2026-11-10T08:00:00Z')) };
  return {
    ids,
    auth,
    catalog: new CatalogService(app, auth),
    scheduling: new SchedulingService(app, auth, options),
    tokens: { deskA, ownerA, deskB, ownerB },
    ctx: {
      deskA: session(deskA),
      ownerA: session(ownerA),
      deskB: session(deskB),
      ownerB: session(ownerB),
    },
  };
}
