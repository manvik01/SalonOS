CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('app.tenant_id', true);
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
END;
$$;

REVOKE ALL ON FUNCTION app_current_tenant_id() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'salonos_app') THEN
    CREATE ROLE salonos_app LOGIN PASSWORD 'salonos_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    ALTER ROLE salonos_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION app_current_tenant_id() TO salonos_app;
