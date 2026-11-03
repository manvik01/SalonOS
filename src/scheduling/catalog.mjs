import { randomUUID } from 'node:crypto';
import { fail, text } from '../domain/plan.mjs';
import { withTenantTx } from '../persistence/tx.mjs';

const iso = value => new Date(value).toISOString();

const windowsFor = (rows, kind, id) => rows
  .filter(row => row.subject_kind === kind && row.subject_id === id)
  .map(row => ({ start: iso(row.starts_at), end: iso(row.ends_at), reason: row.reason }));

export async function loadCatalog(client, tenantId) {
  const tenant = await client.query('SELECT id, name FROM tenants WHERE id = $1', [tenantId]);
  const services = await client.query(
    `SELECT s.id, s.name, s.current_version AS version, v.duration_minutes, v.buffer_minutes, v.price_minor, v.resource_required, v.currency
     FROM services s
     JOIN service_versions v ON v.tenant_id = s.tenant_id AND v.service_id = s.id AND v.version = s.current_version
     WHERE s.tenant_id = $1 AND s.archived_at IS NULL`,
    [tenantId],
  );
  const staff = await client.query('SELECT id, display_name, active FROM staff WHERE tenant_id = $1', [tenantId]);
  const resources = await client.query('SELECT id, display_name, active FROM resources WHERE tenant_id = $1', [tenantId]);
  const skills = await client.query('SELECT staff_id, service_id FROM staff_skills WHERE tenant_id = $1', [tenantId]);
  const resourceServices = await client.query('SELECT resource_id, service_id FROM resource_services WHERE tenant_id = $1', [tenantId]);
  const windows = await client.query('SELECT subject_kind, subject_id, starts_at, ends_at FROM availability_windows WHERE tenant_id = $1', [tenantId]);
  const blocked = await client.query('SELECT subject_kind, subject_id, starts_at, ends_at, reason FROM blocked_intervals WHERE tenant_id = $1', [tenantId]);
  const policies = await client.query('SELECT slot_interval_minutes, min_notice_minutes, max_advance_days, hold_minutes FROM booking_policies WHERE tenant_id = $1', [tenantId]);
  const locations = await client.query('SELECT id, name FROM locations WHERE tenant_id = $1', [tenantId]);
  if (!tenant.rows[0]) fail('NOT_FOUND', 'Record not found');
  const skillMap = new Map();
  for (const row of skills.rows) {
    const list = skillMap.get(row.staff_id) ?? [];
    list.push(row.service_id);
    skillMap.set(row.staff_id, list);
  }
  const resourceMap = new Map();
  for (const row of resourceServices.rows) {
    const list = resourceMap.get(row.resource_id) ?? [];
    list.push(row.service_id);
    resourceMap.set(row.resource_id, list);
  }
  return {
    id: tenant.rows[0].id,
    name: tenant.rows[0].name,
    policy: policies.rows[0] ?? { slot_interval_minutes: 15, min_notice_minutes: 0, max_advance_days: 365, hold_minutes: 5 },
    locations: locations.rows,
    services: services.rows.map(row => ({
      id: row.id,
      name: row.name,
      version: row.version,
      durationMinutes: row.duration_minutes,
      bufferMinutes: row.buffer_minutes,
      priceMinor: row.price_minor,
      resourceRequired: row.resource_required,
      currency: row.currency,
    })),
    staff: staff.rows.filter(row => row.active).map(row => ({
      id: row.id,
      displayName: row.display_name,
      serviceIds: skillMap.get(row.id) ?? [],
      availability: windowsFor(windows.rows, 'staff', row.id),
      blocked: windowsFor(blocked.rows, 'staff', row.id),
    })),
    resources: resources.rows.filter(row => row.active).map(row => ({
      id: row.id,
      displayName: row.display_name,
      serviceIds: resourceMap.get(row.id) ?? [],
      availability: windowsFor(windows.rows, 'resource', row.id),
      blocked: windowsFor(blocked.rows, 'resource', row.id),
    })),
    locationWindows: windows.rows.filter(row => row.subject_kind === 'location')
      .map(row => ({ id: row.subject_id, start: iso(row.starts_at), end: iso(row.ends_at) })),
  };
}

export class CatalogService {
  constructor(pool, auth) {
    this.pool = pool;
    this.auth = auth;
  }

  async updateService(auth, serviceId, patch) {
    this.auth.assertCatalogWrite(auth);
    if (!text(serviceId) || !patch) fail('INVALID', 'Service update required');
    return withTenantTx(this.pool, auth.tenantId, async client => {
      const { rows } = await client.query(
        `SELECT s.id, s.current_version, v.duration_minutes, v.buffer_minutes, v.price_minor, v.currency, v.resource_required
         FROM services s
         JOIN service_versions v ON v.tenant_id = s.tenant_id AND v.service_id = s.id AND v.version = s.current_version
         WHERE s.tenant_id = $1 AND s.id = $2`,
        [auth.tenantId, serviceId],
      );
      if (!rows[0]) fail('NOT_FOUND', 'Record not found');
      const current = rows[0];
      const nextVersion = current.current_version + 1;
      await client.query(
        `INSERT INTO service_versions (tenant_id, service_id, version, duration_minutes, buffer_minutes, price_minor, currency, resource_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          auth.tenantId, serviceId, nextVersion,
          patch.durationMinutes ?? current.duration_minutes,
          patch.bufferMinutes ?? current.buffer_minutes,
          patch.priceMinor ?? current.price_minor,
          current.currency,
          patch.resourceRequired ?? current.resource_required,
        ],
      );
      await client.query(
        `UPDATE services SET current_version = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [auth.tenantId, serviceId, nextVersion],
      );
      return { serviceId, version: nextVersion };
    });
  }

  async addBlockedInterval(auth, { subjectKind, subjectId, start, end, reason }) {
    this.auth.assertCatalogWrite(auth);
    return withTenantTx(this.pool, auth.tenantId, async client => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO blocked_intervals (tenant_id, id, subject_kind, subject_id, starts_at, ends_at, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [auth.tenantId, id, subjectKind, subjectId, start, end, reason ?? 'leave'],
      );
      return { id };
    });
  }
}
