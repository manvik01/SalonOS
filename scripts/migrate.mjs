import { migrate } from '../src/persistence/migrate.mjs';

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error('MIGRATE_DATABASE_URL is required');
  process.exit(1);
}
await migrate(url);
console.log('migrations applied');
