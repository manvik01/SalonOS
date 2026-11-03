GRANT USAGE ON SCHEMA public TO salonos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO salonos_app;
GRANT EXECUTE ON FUNCTION app_current_tenant_id() TO salonos_app;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancy_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE restricted_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_isolation ON tenants
  FOR ALL TO salonos_app
  USING (id = app_current_tenant_id())
  WITH CHECK (id = app_current_tenant_id());

CREATE POLICY locations_isolation ON locations
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY booking_policies_isolation ON booking_policies
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY staff_isolation ON staff
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY resources_isolation ON resources
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY services_isolation ON services
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY service_versions_isolation ON service_versions
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY staff_skills_isolation ON staff_skills
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY resource_services_isolation ON resource_services
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY availability_windows_isolation ON availability_windows
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY blocked_intervals_isolation ON blocked_intervals
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY occupancy_locks_isolation ON occupancy_locks
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY clients_isolation ON clients
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY restricted_notes_isolation ON restricted_notes
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY appointments_isolation ON appointments
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY appointment_items_isolation ON appointment_items
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY reservations_isolation ON reservations
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY appointment_revisions_isolation ON appointment_revisions
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY command_idempotency_isolation ON command_idempotency
  FOR ALL TO salonos_app
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
