CREATE TABLE locations (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Singapore',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE booking_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  slot_interval_minutes integer NOT NULL DEFAULT 15 CHECK (slot_interval_minutes > 0),
  min_notice_minutes integer NOT NULL DEFAULT 0 CHECK (min_notice_minutes >= 0),
  max_advance_days integer NOT NULL DEFAULT 365 CHECK (max_advance_days > 0),
  hold_minutes integer NOT NULL DEFAULT 5 CHECK (hold_minutes > 0)
);

CREATE TABLE staff (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  display_name text NOT NULL,
  user_id uuid REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE resources (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  display_name text NOT NULL,
  kind text NOT NULL DEFAULT 'room',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE services (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  name text NOT NULL,
  current_version integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE service_versions (
  tenant_id uuid NOT NULL,
  service_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  buffer_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'SGD',
  resource_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, service_id, version),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id)
);

ALTER TABLE services
  ADD CONSTRAINT services_current_version_fk
  FOREIGN KEY (tenant_id, id, current_version)
  REFERENCES service_versions (tenant_id, service_id, version)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE staff_skills (
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  service_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, staff_id, service_id),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id)
);

CREATE TABLE resource_services (
  tenant_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  service_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, resource_id, service_id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES resources (tenant_id, id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id)
);

CREATE TABLE availability_windows (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('staff', 'resource', 'location')),
  subject_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CHECK (starts_at < ends_at)
);

CREATE TABLE blocked_intervals (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('staff', 'resource')),
  subject_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN ('leave', 'break', 'other')),
  PRIMARY KEY (tenant_id, id),
  CHECK (starts_at < ends_at)
);

CREATE TABLE occupancy_locks (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  resource_kind text NOT NULL CHECK (resource_kind IN ('staff', 'resource')),
  resource_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, resource_kind, resource_id)
);

CREATE TABLE clients (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE restricted_notes (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  client_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id)
);
