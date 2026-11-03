#!/usr/bin/env bash
set -euo pipefail
# Synthetic local/CI database only. Do not use these roles or passwords in production.
if command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo pg_ctlcluster 16 main start || true
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'salonos_migrator') THEN
    CREATE ROLE salonos_migrator LOGIN PASSWORD 'salonos_migrator' SUPERUSER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'salonos_app') THEN
    CREATE ROLE salonos_app LOGIN PASSWORD 'salonos_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END$$;
SELECT 'ok' FROM pg_database WHERE datname = 'salonos_test';
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='salonos_test'" | grep -q 1; then
  sudo -u postgres createdb -O salonos_migrator salonos_test
fi
sudo -u postgres psql -d salonos_test -c 'GRANT CONNECT ON DATABASE salonos_test TO salonos_app;'
echo "MIGRATE_DATABASE_URL=postgres://salonos_migrator:salonos_migrator@127.0.0.1:5432/salonos_test"
echo "DATABASE_URL=postgres://salonos_app:salonos_app@127.0.0.1:5432/salonos_test"
