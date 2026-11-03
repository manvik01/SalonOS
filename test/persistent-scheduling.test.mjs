import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closePools, createTestPools, resetDatabase } from './helpers/postgres.mjs';
import { seedWorld } from './helpers/seed.mjs';
import { bookingRequest, ids, time } from './helpers/ids.mjs';

const code = expected => error => error.code === expected;
let pools;
let world;
let now;

before(async () => {
  pools = await createTestPools();
});

beforeEach(async () => {
  now = new Date('2026-11-10T08:00:00Z');
  await resetDatabase(pools.migrator);
  world = await seedWorld(pools.migrator, pools.app, { clock: () => now });
});

after(async () => {
  if (pools) await closePools(pools);
});

test('simultaneous last-room requests produce one booking and one conflict', async () => {
  const results = await Promise.allSettled([
    world.scheduling.create(world.ctx.deskA, bookingRequest(), 'a'),
    world.scheduling.create(world.ctx.deskA, bookingRequest(time('09'), ids.bob), 'b'),
  ]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'CONFLICT');
});

test('staff collision is rejected even without room reservation', async () => {
  await world.scheduling.create(world.ctx.deskA, bookingRequest(), 'a');
  await assert.rejects(world.scheduling.create(world.ctx.deskA, {
    clientId: ids.client, start: time('09'), items: [{ serviceId: ids.wash, staffId: ids.alice }],
  }, 'b'), code('CONFLICT'));
});

test('half-open intervals allow adjacent appointments', async () => {
  await world.scheduling.create(world.ctx.deskA, bookingRequest(), 'a');
  const next = await world.scheduling.create(world.ctx.deskA, bookingRequest(time('10')), 'b');
  assert.equal(next.items[0].start, time('10').replace('Z', '.000Z'));
});

test('idempotent concurrent retries return same object and changed input fails', async () => {
  const [a, b] = await Promise.all([
    world.scheduling.create(world.ctx.deskA, bookingRequest(), 'key'),
    world.scheduling.create(world.ctx.deskA, bookingRequest(), 'key'),
  ]);
  assert.deepEqual(a, b);
  await assert.rejects(world.scheduling.create(world.ctx.deskA, bookingRequest(time('10')), 'key'), code('IDEMPOTENCY_MISMATCH'));
});

test('tenant identities scope conflicts, idempotency and record lookup', async () => {
  const a = await world.scheduling.create(world.ctx.deskA, bookingRequest(), 'same');
  const b = await world.scheduling.create(world.ctx.deskB, bookingRequest(), 'same');
  assert.notEqual(a.id, b.id);
  await assert.rejects(world.scheduling.get(world.ctx.deskB, a.id), code('NOT_FOUND'));
  await assert.rejects(world.scheduling.reschedule(world.ctx.deskB, a.id, { start: time('10'), expectedVersion: 1 }), code('NOT_FOUND'));
});

test('conflicting reschedule leaves original reservation and version intact', async () => {
  const a = await world.scheduling.create(world.ctx.deskA, bookingRequest(), 'a');
  await world.scheduling.create(world.ctx.deskA, bookingRequest(time('11')), 'b');
  await assert.rejects(world.scheduling.reschedule(world.ctx.deskA, a.id, { start: time('11'), expectedVersion: 1 }), code('CONFLICT'));
  const still = await world.scheduling.get(world.ctx.deskA, a.id);
  assert.equal(still.version, 1);
  assert.equal(still.items[0].start, a.items[0].start);
  await assert.rejects(world.scheduling.create(world.ctx.deskA, bookingRequest(), 'c'), code('CONFLICT'));
});

test('successful reschedule frees previous slot and rejects stale edits', async () => {
  const a = await world.scheduling.create(world.ctx.deskA, bookingRequest(), 'a');
  const moved = await world.scheduling.reschedule(world.ctx.deskA, a.id, { start: time('11'), expectedVersion: 1 });
  assert.equal(moved.version, 2);
  assert.equal(moved.items[0].priceMinor, 5000);
  await world.scheduling.create(world.ctx.deskA, bookingRequest(), 'b');
  await assert.rejects(world.scheduling.reschedule(world.ctx.deskA, a.id, { start: time('12'), expectedVersion: 1 }), code('STALE_VERSION'));
});

test('sequential services reserve cleanup and permit different staff', async () => {
  const a = await world.scheduling.create(world.ctx.deskA, {
    clientId: ids.client, start: time('09'), items: [
      { serviceId: ids.wash, staffId: ids.alice },
      { serviceId: ids.cut, staffId: ids.bob, resourceId: ids.room },
    ],
  }, 'a');
  assert.equal(a.items[0].serviceEnd, '2026-11-10T09:30:00.000Z');
  assert.equal(a.items[1].start, '2026-11-10T09:45:00.000Z');
  await assert.rejects(world.scheduling.create(world.ctx.deskA, {
    clientId: ids.client, start: '2026-11-10T09:30:00Z', items: [{ serviceId: ids.wash, staffId: ids.alice }],
  }, 'b'), code('CONFLICT'));
});

test('staff qualification, missing resources and outside hours reject without mutation', async () => {
  const removed = await pools.migrator.query(
    'DELETE FROM staff_skills WHERE tenant_id = $1 AND staff_id = $2 AND service_id = $3 RETURNING staff_id',
    [ids.tenantA, ids.alice, ids.cut],
  );
  assert.equal(removed.rowCount, 1);
  await assert.rejects(world.scheduling.create(world.ctx.deskA, bookingRequest(), 'a'), code('INVALID'));
  await assert.rejects(world.scheduling.create(world.ctx.deskA, {
    ...bookingRequest(time('09'), ids.bob), items: [{ serviceId: ids.cut, staffId: ids.bob }],
  }, 'b'), code('INVALID'));
  await assert.rejects(world.scheduling.create(world.ctx.deskA, bookingRequest(time('18'), ids.bob), 'c'), code('UNAVAILABLE'));
  await world.scheduling.create(world.ctx.deskA, bookingRequest(time('09'), ids.bob), 'a');
});

test('blocked leave or break interval is unavailable including cleanup', async () => {
  await world.catalog.addBlockedInterval(world.ctx.ownerA, {
    subjectKind: 'staff', subjectId: ids.alice, start: '2026-11-10T09:30:00Z', end: time('10'), reason: 'leave',
  });
  await assert.rejects(world.scheduling.create(world.ctx.deskA, {
    clientId: ids.client, start: time('09'), items: [{ serviceId: ids.wash, staffId: ids.alice }],
  }, 'a'), code('UNAVAILABLE'));
  const slots = await world.scheduling.availability(world.ctx.deskA, {
    serviceId: ids.wash, start: time('09'), end: time('10'), staffId: ids.alice,
  });
  assert.equal(slots.length, 0);
});

test('versioned service snapshots survive later catalog edits', async () => {
  const booked = await world.scheduling.create(world.ctx.deskA, bookingRequest(), 'a');
  await world.catalog.updateService(world.ctx.ownerA, ids.cut, { priceMinor: 1, durationMinutes: 90 });
  const loaded = await world.scheduling.get(world.ctx.deskA, booked.id);
  assert.equal(loaded.items[0].priceMinor, 5000);
  assert.equal(loaded.items[0].durationMinutes, 60);
  assert.equal(loaded.items[0].serviceVersion, 1);
  const moved = await world.scheduling.reschedule(world.ctx.deskA, booked.id, { start: time('11'), expectedVersion: 1 });
  assert.equal(moved.items[0].priceMinor, 5000);
  assert.equal(moved.items[0].durationMinutes, 60);
});

test('expired holds cannot indefinitely block reservations', async () => {
  const hold = await world.scheduling.create(world.ctx.deskA, { ...bookingRequest(), hold: true }, 'hold');
  assert.equal(hold.state, 'held');
  now = new Date('2026-11-10T08:06:00Z');
  const next = await world.scheduling.create(world.ctx.deskA, bookingRequest(time('09'), ids.bob), 'next');
  assert.equal(next.state, 'confirmed');
  const expired = await world.scheduling.get(world.ctx.deskA, hold.id);
  assert.equal(expired.state, 'cancelled');
});

test('unexpired holds still occupy capacity', async () => {
  await world.scheduling.create(world.ctx.deskA, { ...bookingRequest(), hold: true }, 'hold');
  await assert.rejects(world.scheduling.create(world.ctx.deskA, bookingRequest(time('09'), ids.bob), 'next'), code('CONFLICT'));
});

test('any-staff assignment is persisted', async () => {
  const booked = await world.scheduling.create(world.ctx.deskA, {
    clientId: ids.client, start: time('09'), items: [{ serviceId: ids.cut, resourceId: ids.room }],
  }, 'any');
  assert.equal(booked.items[0].staffId, ids.alice);
});

test('recurring configuration is rejected', async () => {
  await assert.rejects(world.scheduling.create(world.ctx.deskA, { ...bookingRequest(), recurrence: { weekly: true } }, 'r'), code('UNSUPPORTED'));
});

test('states move through held confirmed arrived in_service completed and cancel releases the slot', async () => {
  const held = await world.scheduling.create(world.ctx.deskA, { ...bookingRequest(), hold: true }, 'h');
  const confirmed = await world.scheduling.transition(world.ctx.deskA, held.id, { state: 'confirmed', expectedVersion: held.version });
  const arrived = await world.scheduling.transition(world.ctx.deskA, held.id, { state: 'arrived', expectedVersion: confirmed.version });
  const service = await world.scheduling.transition(world.ctx.deskA, held.id, { state: 'in_service', expectedVersion: arrived.version });
  const done = await world.scheduling.transition(world.ctx.deskA, held.id, { state: 'completed', expectedVersion: service.version });
  assert.equal(done.state, 'completed');
  const other = await world.scheduling.create(world.ctx.deskA, bookingRequest(time('11')), 'c');
  const cancelled = await world.scheduling.transition(world.ctx.deskA, other.id, { state: 'cancelled', expectedVersion: 1, reason: 'client' });
  assert.equal(cancelled.state, 'cancelled');
  await world.scheduling.create(world.ctx.deskA, bookingRequest(time('11'), ids.bob), 'rebook');
});
