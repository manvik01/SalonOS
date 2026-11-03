CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Singapore',
  currency text NOT NULL DEFAULT 'SGD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  mfa_enabled boolean NOT NULL DEFAULT false,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'receptionist', 'practitioner', 'inventory_clerk', 'finance', 'marketer')),
  status text NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
  invited_at timestamptz,
  invite_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES memberships (tenant_id, user_id)
);

CREATE TABLE invitations (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'receptionist', 'practitioner', 'inventory_clerk', 'finance', 'marketer')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES users(id),
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE auth_throttle (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  object_type text,
  object_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'error')),
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX sessions_user_tenant_idx ON sessions (tenant_id, user_id);
CREATE INDEX invitations_email_idx ON invitations (tenant_id, email);
CREATE INDEX audit_events_tenant_idx ON audit_events (tenant_id, created_at);
