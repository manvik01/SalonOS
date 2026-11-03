import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './pool.mjs';

const quoteIdent = name => `"${String(name).replaceAll('"', '""')}"`;

export async function migrate(connectionString) {
  const client = createClient(connectionString);
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
    const files = (await fs.readdir(dir)).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
      if (applied.rowCount) continue;
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        error.message = `Migration ${file} failed: ${error.message}`;
        throw error;
      }
    }
    const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
    await client.query(`GRANT CONNECT ON DATABASE ${quoteIdent(database)} TO salonos_app`);
    const appPassword = process.env.APP_DB_PASSWORD || 'salonos_app';
    await client.query(`ALTER ROLE salonos_app WITH LOGIN PASSWORD '${appPassword.replaceAll("'", "''")}'`);
  } finally {
    await client.end();
  }
}

export async function migrationIds(connectionString) {
  const client = createClient(connectionString);
  await client.connect();
  try {
    const { rows } = await client.query('SELECT id FROM schema_migrations ORDER BY id');
    return rows.map(row => row.id);
  } finally {
    await client.end();
  }
}
