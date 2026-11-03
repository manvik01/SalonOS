import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATABASE_URL } from './helpers/env.mjs';
import { closePools, createTestPools, resetDatabase } from './helpers/postgres.mjs';
import { seedWorld } from './helpers/seed.mjs';
import { bookingRequest, ids, time } from './helpers/ids.mjs';

const workerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'workers/create-appointment.mjs');

const spawnWorker = ({ token, request, key }) => {
  const child = spawn(process.execPath, [workerPath], {
    env: {
      ...process.env,
      DATABASE_URL,
      SESSION_TOKEN: token,
      BOOKING_REQUEST: JSON.stringify(request),
      IDEMPOTENCY_KEY: key,
      NOW: '2026-11-10T08:00:00Z',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (stdout.includes('ready\n') || stdout.trim() === 'ready') readyResolve();
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise(resolve => {
    child.on('close', exitCode => {
      const line = stdout.trim().split('\n').filter(value => value.startsWith('{')).at(-1);
      resolve({ exitCode, result: line ? JSON.parse(line) : null, stdout, stderr });
    });
  });
  return {
    ready,
    done,
    go() {
      child.stdin.write('go\n');
      child.stdin.end();
    },
  };
};

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

test('two processes concurrently reserving same capacity yield exactly one commit', async () => {
  const workers = [
    spawnWorker({ token: world.tokens.deskA.token, request: bookingRequest(time('09'), ids.alice), key: 'proc-a' }),
    spawnWorker({ token: world.tokens.ownerA.token, request: bookingRequest(time('09'), ids.bob), key: 'proc-b' }),
  ];
  await Promise.all(workers.map(worker => worker.ready));
  for (const worker of workers) worker.go();
  const results = await Promise.all(workers.map(worker => worker.done));
  const ok = results.filter(row => row.result?.ok);
  const conflict = results.filter(row => row.result && row.result.ok === false);
  assert.equal(ok.length, 1, JSON.stringify(results, null, 2));
  assert.equal(conflict.length, 1, JSON.stringify(results, null, 2));
  assert.equal(conflict[0].result.code, 'CONFLICT');
  const appointments = await pools.migrator.query(
    `SELECT id, state FROM appointments WHERE tenant_id = $1 AND state IN ('held','confirmed')`,
    [ids.tenantA],
  );
  assert.equal(appointments.rowCount, 1);
  const overlaps = await pools.migrator.query(
    `SELECT r1.id
     FROM reservations r1
     JOIN reservations r2 ON r1.tenant_id = r2.tenant_id
       AND r1.resource_kind = r2.resource_kind
       AND r1.resource_id = r2.resource_id
       AND r1.id < r2.id
       AND r1.status IN ('held','confirmed')
       AND r2.status IN ('held','confirmed')
       AND tstzrange(r1.starts_at, r1.ends_at, '[)') && tstzrange(r2.starts_at, r2.ends_at, '[)')
     WHERE r1.tenant_id = $1`,
    [ids.tenantA],
  );
  assert.equal(overlaps.rowCount, 0);
});
