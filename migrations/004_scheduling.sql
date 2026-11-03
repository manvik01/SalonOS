CREATE TABLE appointments (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  location_id uuid NOT NULL,
  client_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('held', 'confirmed', 'arrived', 'in_service', 'completed', 'cancelled', 'no_show')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source text NOT NULL DEFAULT 'staff',
  notes text,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancel_reason text,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id),
  CHECK (starts_at < ends_at)
);

CREATE TABLE appointment_items (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 0),
  service_id uuid NOT NULL,
  service_version integer NOT NULL,
  staff_id uuid NOT NULL,
  resource_id uuid,
  starts_at timestamptz NOT NULL,
  service_ends_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  buffer_minutes integer NOT NULL,
  price_minor integer NOT NULL,
  currency text NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, appointment_id, sequence),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, service_id, service_version) REFERENCES service_versions (tenant_id, service_id, version),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES resources (tenant_id, id)
);

CREATE TABLE reservations (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  resource_kind text NOT NULL CHECK (resource_kind IN ('staff', 'resource')),
  resource_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('held', 'confirmed', 'released', 'expired')),
  expires_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments (tenant_id, id) ON DELETE CASCADE,
  CHECK (starts_at < ends_at),
  CHECK (status <> 'held' OR expires_at IS NOT NULL)
);

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    resource_kind WITH =,
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status IN ('held', 'confirmed'));

CREATE TABLE appointment_revisions (
  tenant_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  actor_user_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, appointment_id, version),
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE command_idempotency (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  command text NOT NULL,
  key text NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'completed')),
  response jsonb,
  appointment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, command, key)
);

CREATE INDEX appointments_client_idx ON appointments (tenant_id, client_id);
CREATE INDEX reservations_appointment_idx ON reservations (tenant_id, appointment_id);
CREATE INDEX reservations_resource_idx ON reservations (tenant_id, resource_kind, resource_id);
