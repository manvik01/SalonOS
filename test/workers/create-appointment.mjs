import { AuthService } from '../../src/identity/auth.mjs';
import { createPool } from '../../src/persistence/pool.mjs';
import { SchedulingService } from '../../src/scheduling/service.mjs';

const write = line => process.stdout.write(`${line}\n`);

process.stdout.write('ready\n');
await new Promise(resolve => {
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', resolve);
});

const pool = createPool(process.env.DATABASE_URL);
try {
  const auth = new AuthService(pool, { sessionTtlMs: 40 * 24 * 60 * 60 * 1000 });
  const scheduling = new SchedulingService(pool, auth, {
    clock: () => new Date(process.env.NOW || '2026-11-10T08:00:00Z'),
  });
  const session = await auth.resolveSession(process.env.SESSION_TOKEN);
  const created = await scheduling.create(session, JSON.parse(process.env.BOOKING_REQUEST), process.env.IDEMPOTENCY_KEY);
  write(JSON.stringify({ ok: true, id: created.id, state: created.state }));
} catch (error) {
  write(JSON.stringify({ ok: false, code: error.code || 'ERROR', message: error.message }));
} finally {
  await pool.end();
}
