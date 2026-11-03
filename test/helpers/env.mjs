export const MIGRATE_DATABASE_URL = process.env.MIGRATE_DATABASE_URL
  || 'postgres://salonos_migrator:salonos_migrator@127.0.0.1:5432/salonos_test';
export const DATABASE_URL = process.env.DATABASE_URL
  || 'postgres://salonos_app:salonos_app@127.0.0.1:5432/salonos_test';
