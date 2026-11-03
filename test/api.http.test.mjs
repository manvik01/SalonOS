import test, { after, afterEach, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSchedulingServer, listen } from '../src/api/http.mjs';
import { closePools, createTestPools, resetDatabase } from './helpers/postgres.mjs';
import { seedWorld } from './helpers/seed.mjs';
import { bookingRequest, ids, PASSWORD } from './helpers/ids.mjs';

let pools;
let world;
let server;
let port;

const request = async (method, path, { token, body, headers } = {}) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  pools = await createTestPools();
});

beforeEach(async () => {
  await resetDatabase(pools.migrator);
  world = await seedWorld(pools.migrator, pools.app, { clock: () => new Date('2026-11-10T08:00:00Z') });
  server = createSchedulingServer({ auth: world.auth, scheduling: world.scheduling });
  port = await listen(server);
});

afterEach(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

after(async () => {
  if (pools) await closePools(pools);
});

test('HTTP login and appointment create use the session tenant', async () => {
  const login = await request('POST', '/v1/auth/login', {
    body: { email: 'desk-a@example.test', password: PASSWORD, tenantId: ids.tenantA },
  });
  assert.equal(login.status, 200);
  const created = await request('POST', '/v1/appointments', {
    token: login.body.token,
    headers: { 'idempotency-key': 'http-1' },
    body: bookingRequest(),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.tenantId, ids.tenantA);
  const fetched = await request('GET', `/v1/appointments/${created.body.id}`, { token: world.tokens.deskB.token });
  assert.equal(fetched.status, 404);
  assert.equal(fetched.body.code, 'NOT_FOUND');
});

test('HTTP denies receptionist restricted-note and payout routes', async () => {
  const deniedNote = await request('GET', `/v1/restricted-notes/${ids.noteA}`, { token: world.tokens.deskA.token });
  assert.equal(deniedNote.status, 403);
  const deniedPayout = await request('POST', '/v1/payout-settings', { token: world.tokens.deskA.token, body: {} });
  assert.equal(deniedPayout.status, 403);
  const recovery = await request('POST', '/v1/auth/recovery', { body: { email: 'nobody@example.test' } });
  assert.equal(recovery.status, 200);
  assert.equal(recovery.body.ok, true);
});
