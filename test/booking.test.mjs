import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceScheduler } from '../src/domain/booking.mjs';

const time = hour => `2026-11-10T${hour}:00:00Z`;
const availability = [{ start: time('08'), end: time('18') }];
const makeTenant = id => ({ id,
  services: [{ id: 'cut', durationMinutes: 60, priceMinor: 5000, resourceRequired: true },
    { id: 'wash', durationMinutes: 30, bufferMinutes: 15, priceMinor: 2000 }],
  staff: ['alice', 'bob'].map(id => ({ id, serviceIds: ['cut', 'wash'], availability })),
  resources: [{ id: 'room', serviceIds: ['cut'], availability }] });
const setup = () => new ReferenceScheduler([makeTenant('A'), makeTenant('B')]);
const request = (start = time('09'), staffId = 'alice') => ({ clientId: 'client', start,
  items: [{ serviceId: 'cut', staffId, resourceId: 'room' }] });
const code = expected => error => error.code === expected;

test('simultaneous last-room requests produce one booking and one conflict', async () => {
  const scheduler = setup();
  const results = await Promise.allSettled([
    Promise.resolve().then(() => scheduler.create('A', request(), 'a')),
    Promise.resolve().then(() => scheduler.create('A', request(time('09'), 'bob'), 'b')),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'CONFLICT');
});

test('staff collision is rejected even without room reservation', async () => {
  const scheduler = setup();
  await scheduler.create('A', request(), 'a');
  await assert.rejects(scheduler.create('A', { clientId: 'client2', start: time('09'),
    items: [{ serviceId: 'wash', staffId: 'alice' }] }, 'b'), code('CONFLICT'));
});

test('half-open intervals allow adjacent appointments', async () => {
  const scheduler = setup();
  await scheduler.create('A', request(), 'a');
  const next = await scheduler.create('A', request(time('10')), 'b');
  assert.equal(next.items[0].start, time('10').replace('Z', '.000Z'));
});

test('idempotent concurrent retries return same object and changed input fails', async () => {
  const scheduler = setup();
  const [a, b] = await Promise.all([scheduler.create('A', request(), 'key'), scheduler.create('A', request(), 'key')]);
  assert.deepEqual(a, b);
  await assert.rejects(scheduler.create('A', request(time('10')), 'key'), code('IDEMPOTENCY_MISMATCH'));
});

test('tenant identities scope conflicts, idempotency and record lookup', async () => {
  const scheduler = setup();
  const a = await scheduler.create('A', request(), 'same');
  const b = await scheduler.create('B', request(), 'same');
  assert.notEqual(a.id, b.id);
  assert.throws(() => scheduler.get('B', a.id), code('NOT_FOUND'));
  await assert.rejects(scheduler.reschedule('B', a.id, { start: time('10'), expectedVersion: 1 }), code('NOT_FOUND'));
});

test('conflicting reschedule leaves original reservation and version intact', async () => {
  const scheduler = setup();
  const a = await scheduler.create('A', request(), 'a');
  await scheduler.create('A', request(time('11')), 'b');
  await assert.rejects(scheduler.reschedule('A', a.id, { start: time('11'), expectedVersion: 1 }), code('CONFLICT'));
  assert.deepEqual(scheduler.get('A', a.id), a);
  await assert.rejects(scheduler.create('A', request(), 'c'), code('CONFLICT'));
});

test('successful reschedule frees previous slot and rejects stale edits', async () => {
  const scheduler = setup();
  const a = await scheduler.create('A', request(), 'a');
  const moved = await scheduler.reschedule('A', a.id, { start: time('11'), expectedVersion: 1 });
  assert.equal(moved.version, 2);
  assert.equal(moved.items[0].priceMinor, 5000);
  await scheduler.create('A', request(), 'b');
  await assert.rejects(scheduler.reschedule('A', a.id, { start: time('12'), expectedVersion: 1 }), code('STALE_VERSION'));
});

test('sequential services reserve cleanup and permit different staff', async () => {
  const scheduler = setup();
  const a = await scheduler.create('A', { clientId: 'client', start: time('09'), items: [
    { serviceId: 'wash', staffId: 'alice' }, { serviceId: 'cut', staffId: 'bob', resourceId: 'room' },
  ] }, 'a');
  assert.equal(a.items[0].serviceEnd, '2026-11-10T09:30:00.000Z');
  assert.equal(a.items[1].start, '2026-11-10T09:45:00.000Z');
  await assert.rejects(scheduler.create('A', { clientId: 'other', start: '2026-11-10T09:30:00Z',
    items: [{ serviceId: 'wash', staffId: 'alice' }] }, 'b'), code('CONFLICT'));
});

test('staff qualification, missing resources and outside hours reject without mutation', async () => {
  const config = makeTenant('A');
  config.staff[0].serviceIds = ['wash'];
  const scheduler = new ReferenceScheduler([config]);
  await assert.rejects(scheduler.create('A', request(), 'a'), code('INVALID'));
  await assert.rejects(scheduler.create('A', { ...request(time('09'), 'bob'), items: [{ serviceId: 'cut', staffId: 'bob' }] }, 'b'), code('INVALID'));
  await assert.rejects(scheduler.create('A', request(time('18'), 'bob'), 'c'), code('UNAVAILABLE'));
  await scheduler.create('A', request(time('09'), 'bob'), 'a');
});

test('blocked leave or break interval is unavailable including cleanup', async () => {
  const config = makeTenant('A');
  config.staff[0].blocked = [{ start: '2026-11-10T09:30:00Z', end: time('10') }];
  const scheduler = new ReferenceScheduler([config]);
  await assert.rejects(scheduler.create('A', { clientId: 'client', start: time('09'),
    items: [{ serviceId: 'wash', staffId: 'alice' }] }, 'a'), code('UNAVAILABLE'));
});

test('inputs and returned records cannot mutate internal state or catalog snapshots', async () => {
  const config = makeTenant('A');
  const scheduler = new ReferenceScheduler([config]);
  config.services[0].priceMinor = 1;
  const a = await scheduler.create('A', request(), 'a');
  a.items[0].priceMinor = 2;
  assert.equal(scheduler.get('A', a.id).items[0].priceMinor, 5000);
});

test('timestamps require timezone and idempotency requires nonempty key', async () => {
  const scheduler = setup();
  await assert.rejects(scheduler.create('A', request('2026-11-10T09:00:00'), 'a'), code('INVALID'));
  await assert.rejects(scheduler.create('A', request(), ''), code('INVALID'));
});
