import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '../src/persistence/pool.mjs';
import { DATABASE_URL } from './helpers/env.mjs';
import { closePools, createTestPools, resetDatabase } from './helpers/postgres.mjs';
import { seedWorld } from './helpers/seed.mjs';
import { bookingRequest, ids, PASSWORD, time } from './helpers/ids.mjs';

const code = expected => error => error.code === expected;
let pools;
let world;

before(async () => {
  pools = await createTestPools();
});

beforeEach(async () => {
  await resetDatabase(pools.migrator);
  world = await seedWorld(pools.migrator, pools.app, { clock: () => new Date('2026-11-10T08:00:00Z') });
});

after(async () => {
  if (pools) await closePools(pools);
});

test('login does not reveal whether an email exists', async () => {
  await assert.rejects(world.auth.login('missing@example.test', 'nope'), code('UNAUTHORIZED'));
  await assert.rejects(world.auth.login('desk-a@example.test', 'wrong-password'), code('UNAUTHORIZED'));
  const recoveryUnknown = await world.auth.requestRecovery('missing@example.test');
  const recoveryKnown = await world.auth.requestRecovery('desk-a@example.test');
  assert.deepEqual(recoveryUnknown, recoveryKnown);
});

test('login is rate limited after repeated failures', async () => {
  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(world.auth.login('desk-a@example.test', 'wrong-password'), code('UNAUTHORIZED'));
  }
  await assert.rejects(world.auth.login('desk-a@example.test', 'wrong-password'), code('RATE_LIMITED'));
  await assert.rejects(world.auth.login('desk-a@example.test', PASSWORD), code('RATE_LIMITED'));
});

test('request tenantId cannot switch workspace', async () => {
  await assert.rejects(
    world.scheduling.create(world.ctx.deskA, { ...bookingRequest(), tenantId: ids.tenantB }, 'x'),
    code('FORBIDDEN'),
  );
});

test('receptionist is denied restricted notes, exports and payout changes', async () => {
  await assert.rejects(world.auth.readRestrictedNote(world.ctx.deskA, ids.noteA), code('FORBIDDEN'));
  await assert.rejects(world.auth.exportClients(world.ctx.deskA), code('FORBIDDEN'));
  await assert.rejects(world.auth.changePayoutSettings(world.ctx.deskA), code('FORBIDDEN'));
  const note = await world.auth.readRestrictedNote(world.ctx.ownerA, ids.noteA);
  assert.equal(note.body, 'sensitive');
  const denied = await pools.migrator.query(
    `SELECT action, outcome FROM audit_events WHERE actor_user_id = $1 AND outcome = 'denied' ORDER BY action`,
    [ids.deskA],
  );
  assert.deepEqual(denied.rows.map(row => row.action), ['clients.export', 'payouts.change', 'restricted_note.read']);
});

test('tenant A cannot read or mutate tenant B objects by guessing ids', async () => {
  const booked = await world.scheduling.create(world.ctx.deskB, bookingRequest(), 'b');
  await assert.rejects(world.scheduling.get(world.ctx.deskA, booked.id), code('NOT_FOUND'));
  await assert.rejects(world.scheduling.reschedule(world.ctx.deskA, booked.id, { start: time('10'), expectedVersion: 1 }), code('NOT_FOUND'));
  await assert.rejects(world.auth.readRestrictedNote(world.ctx.ownerB, ids.noteA), code('NOT_FOUND'));
});

test('database rejects cross-tenant foreign keys and RLS hides other tenant rows', async () => {
  const onlyB = randomUUID();
  await pools.migrator.query(
    `INSERT INTO clients (tenant_id, id, display_name) VALUES ($1,$2,'only B')`,
    [ids.tenantB, onlyB],
  );
  await assert.rejects(pools.migrator.query(
    `INSERT INTO appointments (tenant_id, id, location_id, client_id, state, starts_at, ends_at)
     VALUES ($1,$2,$3,$4,'confirmed','2026-11-10T09:00:00Z','2026-11-10T10:00:00Z')`,
    [ids.tenantA, randomUUID(), ids.location, onlyB],
  ), error => error.code === '23503');

  const booked = await world.scheduling.create(world.ctx.deskB, bookingRequest(), 'iso');
  const appClient = createClient(DATABASE_URL);
  await appClient.connect();
  try {
    await appClient.query('SELECT set_config($1, $2, false)', ['app.tenant_id', ids.tenantA]);
    const hidden = await appClient.query('SELECT id FROM appointments WHERE id = $1', [booked.id]);
    assert.equal(hidden.rowCount, 0);
    await assert.rejects(appClient.query(
      `INSERT INTO clients (tenant_id, id, display_name) VALUES ($1,$2,'x')`,
      [ids.tenantB, randomUUID()],
    ), error => error.code === '42501');
  } finally {
    await appClient.end();
  }
});

test('invitations expire or revoke and disabling staff preserves appointments', async () => {
  const invitation = await world.auth.invite(world.ctx.ownerA, { email: 'stylist@example.test', role: 'practitioner' });
  await world.auth.revokeInvite(world.ctx.ownerA, invitation.id);
  await assert.rejects(world.auth.acceptInvite(invitation.token, { password: PASSWORD, displayName: 'Stylist' }), code('NOT_FOUND'));
  const live = await world.auth.invite(world.ctx.ownerA, { email: 'stylist2@example.test', role: 'practitioner' });
  const accepted = await world.auth.acceptInvite(live.token, { password: PASSWORD, displayName: 'Stylist 2' });
  const booked = await world.scheduling.create(world.ctx.deskA, bookingRequest(), 'keep');
  await world.auth.disableMembership(world.ctx.ownerA, accepted.userId);
  await world.auth.disableMembership(world.ctx.ownerA, ids.deskA);
  await assert.rejects(world.auth.resolveSession(world.tokens.deskA.token), code('UNAUTHORIZED'));
  const kept = await world.scheduling.get(world.ctx.ownerA, booked.id);
  assert.equal(kept.id, booked.id);
  const staff = await pools.migrator.query('SELECT id FROM staff WHERE tenant_id = $1 AND id = $2', [ids.tenantA, ids.alice]);
  assert.equal(staff.rowCount, 1);
});
