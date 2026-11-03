import { createClient } from '../src/persistence/pool.mjs';
import { expireHoldsForTenant } from '../src/scheduling/service.mjs';

const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('MIGRATE_DATABASE_URL or DATABASE_URL is required');
  process.exit(1);
}
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const client = createClient(url);
await client.connect();
try {
  const { rows } = await client.query('SELECT id FROM tenants');
  let retired = 0;
  for (const row of rows) {
    await client.query('BEGIN');
    try {
      retired += await expireHoldsForTenant(client, row.id, now);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log(`expired-hold retirement scanned ${rows.length} tenants at ${now.toISOString()} (lock keys touched: ${retired})`);
} finally {
  await client.end();
}
