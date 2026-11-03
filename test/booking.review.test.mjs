import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceScheduler } from '../src/domain/booking.mjs';

const setup = () => new ReferenceScheduler([{
  id: 'A',
  services: [{ id: 'cut', durationMinutes: 60, priceMinor: 100 }],
  staff: [{ id: 'alice', serviceIds: ['cut'], availability: [
    { start: '2026-01-01T00:00:00Z', end: '2027-01-01T00:00:00Z' },
  ] }],
  resources: [],
}]);
const request = start => ({ clientId: 'client', start, items: [{ serviceId: 'cut', staffId: 'alice' }] });
const invalid = error => error.code === 'INVALID';

test('review regression: nonexistent calendar dates are rejected rather than normalized', async () => {
  const scheduler = setup();
  await assert.rejects(scheduler.create('A', request('2026-02-30T09:00:00Z'), 'bad-date'), invalid);
});

test('review regression: null commands return a controlled validation error', async () => {
  await assert.rejects(setup().create('A', null, 'null'), invalid);
});

test('review: returned snapshot mutation cannot corrupt idempotency response', async () => {
  const scheduler = setup();
  const first = await scheduler.create('A', request('2026-11-10T09:00:00Z'), 'same');
  first.items[0].priceMinor = 999;
  const replay = await scheduler.create('A', request('2026-11-10T09:00:00Z'), 'same');
  assert.equal(replay.items[0].priceMinor, 100);
});

test('review: malformed reschedule does not change existing appointment', async () => {
  const scheduler = setup();
  const first = await scheduler.create('A', request('2026-11-10T09:00:00Z'), 'one');
  await assert.rejects(scheduler.reschedule('A', first.id, { start: 'not-a-date', expectedVersion: 1 }), invalid);
  assert.deepEqual(scheduler.get('A', first.id), first);
});
