import { createHash } from 'node:crypto';
import { BookingError, canonical, fail } from '../domain/plan.mjs';

export const advisoryLockId = parts => createHash('sha256').update(canonical(parts)).digest().readInt32BE(0);

export const mapDbError = error => {
  if (error instanceof BookingError) throw error;
  if (error.code === '23P01') fail('CONFLICT', 'Requested staff or resource already reserved');
  if (error.code === '23503') fail('INVALID', 'Related record is not in this tenant');
  if (error.code === '42501') fail('FORBIDDEN', 'Cross-tenant access denied');
  throw error;
};

export async function withTenantTx(pool, tenantId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already aborted */ }
    mapDbError(error);
  } finally {
    client.release();
  }
}
