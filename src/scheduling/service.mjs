import { randomUUID } from 'node:crypto';
import {
  canonical, entityAvailable, fail, instant, object, occupancyKeys, overlaps, pickFirstEligibleStaff,
  planAppointment, text,
} from '../domain/plan.mjs';
import { advisoryLockId, withTenantTx } from '../persistence/tx.mjs';
import { loadCatalog } from './catalog.mjs';

const ACTIVE_STATES = new Set(['held', 'confirmed', 'arrived', 'in_service']);
const RESCHEDULE_STATES = new Set(['held', 'confirmed']);
const TRANSITIONS = {
  held: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['arrived', 'cancelled', 'no_show']),
  arrived: new Set(['in_service', 'cancelled', 'no_show']),
  in_service: new Set(['completed']),
};

const toIso = ms => new Date(ms).toISOString();

const requestFingerprint = request => canonical({
  clientId: request.clientId,
  start: new Date(instant(request.start)).toISOString(),
  hold: Boolean(request.hold),
  items: request.items.map(item => ({
    serviceId: item.serviceId,
    staffId: item.staffId ?? null,
    resourceId: item.resourceId ?? null,
  })),
});

const epochMs = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) return Number(value);
  if (value instanceof Date) return value.getTime();
  return instant(value);
};

const reservationDto = row => ({
  kind: row.kind,
  entityId: row.entityId,
  start: epochMs(row.start),
  end: epochMs(row.end),
  status: row.status,
});

export class SchedulingService {
  constructor(pool, auth, { clock = () => new Date() } = {}) {
    this.pool = pool;
    this.auth = auth;
    this.clock = clock;
  }

  #now() { return new Date(this.clock()); }

  async create(auth, request, idempotencyKey) {
    this.auth.assertBooking(auth);
    this.auth.assertTenant(auth, request?.tenantId);
    if (!text(idempotencyKey)) fail('INVALID', 'Idempotency key required');
    if (!object(request)) fail('INVALID', 'Client and service items required');
    const fingerprint = requestFingerprint(request);
    return withTenantTx(this.pool, auth.tenantId, async client => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLockId([auth.tenantId, 'appointments.create', idempotencyKey])]);
      const prior = await client.query(
        `SELECT fingerprint, status, response FROM command_idempotency
         WHERE tenant_id = $1 AND command = $2 AND key = $3 FOR UPDATE`,
        [auth.tenantId, 'appointments.create', idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].fingerprint !== fingerprint) fail('IDEMPOTENCY_MISMATCH', 'Key already used with different input');
        return prior.rows[0].response;
      }
      const catalog = await loadCatalog(client, auth.tenantId);
      const locationId = request.locationId ?? catalog.locations[0]?.id;
      if (!locationId) fail('INVALID', 'Location required');
      const clientRow = await client.query('SELECT id FROM clients WHERE tenant_id = $1 AND id = $2', [auth.tenantId, request.clientId]);
      if (!clientRow.rowCount) fail('INVALID', 'Client and service items required');
      const occupiedKeys = keysForRequest(catalog, request);
      await lockOccupancy(client, auth.tenantId, occupiedKeys);
      await retireExpiredHolds(client, auth.tenantId, this.#now(), occupiedKeys);
      const occupied = await loadOccupied(client, auth.tenantId);
      const resolved = resolveAssignments(catalog, request, occupied, this.#now());
      const plan = planAppointment(catalog, resolved);
      assertBookingWindow(catalog, plan, this.#now());
      assertLocationHours(catalog, locationId, plan.reservations);
      assertConflicts(plan.reservations, occupied);
      const appointment = await insertAppointment(client, {
        auth, request: resolved, plan, locationId, catalog, now: this.#now(),
      });
      await client.query(
        `INSERT INTO command_idempotency (tenant_id, command, key, fingerprint, status, response, appointment_id)
         VALUES ($1,'appointments.create',$2,$3,'completed',$4::jsonb,$5)`,
        [auth.tenantId, idempotencyKey, fingerprint, JSON.stringify(appointment), appointment.id],
      );
      return appointment;
    });
  }

  async get(auth, appointmentId) {
    this.auth.assertBooking(auth);
    return withTenantTx(this.pool, auth.tenantId, async client => {
      const appointment = await loadAppointment(client, auth.tenantId, appointmentId);
      if (!appointment) fail('NOT_FOUND', 'Record not found');
      return appointment;
    });
  }

  async reschedule(auth, appointmentId, command) {
    this.auth.assertBooking(auth);
    if (!object(command)) fail('INVALID', 'Reschedule command required');
    const expectedVersion = Number(command.expectedVersion);
    if (!Number.isSafeInteger(expectedVersion)) fail('INVALID', 'Reschedule command required');
    return withTenantTx(this.pool, auth.tenantId, async client => {
      const old = await loadAppointment(client, auth.tenantId, appointmentId);
      if (!old) fail('NOT_FOUND', 'Record not found');
      if (old.version !== expectedVersion) fail('STALE_VERSION', 'Appointment changed; reload before editing');
      if (!RESCHEDULE_STATES.has(old.state)) fail('INVALID', 'Appointment cannot be rescheduled');
      const catalog = await loadCatalog(client, auth.tenantId);
      const delta = instant(command.start) - instant(old.items[0].start);
      const candidateItems = old.items.map(item => ({
        ...item,
        start: toIso(instant(item.start) + delta),
        serviceEnd: toIso(instant(item.serviceEnd) + delta),
        end: toIso(instant(item.end) + delta),
      }));
      const candidateReservations = old.reservations
        .filter(row => row.status === 'held' || row.status === 'confirmed')
        .map(row => ({ ...row, start: row.start + delta, end: row.end + delta }));
      for (const item of candidateItems) {
        const staff = catalog.staff.find(value => value.id === item.staffId);
        const resource = item.resourceId ? catalog.resources.find(value => value.id === item.resourceId) : null;
        if (!entityAvailable(staff, instant(item.start), instant(item.end))) fail('UNAVAILABLE', 'Outside availability or blocked time');
        if (item.resourceId && !entityAvailable(resource, instant(item.start), instant(item.end))) {
          fail('UNAVAILABLE', 'Outside availability or blocked time');
        }
      }
      const keys = occupancyKeys([
        ...old.reservations.map(row => ({ kind: row.kind, entityId: row.entityId })),
        ...candidateReservations,
      ]);
      await lockOccupancy(client, auth.tenantId, keys);
      await retireExpiredHolds(client, auth.tenantId, this.#now(), keys);
      const occupied = await loadOccupied(client, auth.tenantId, appointmentId);
      assertLocationHours(catalog, old.locationId, candidateReservations);
      assertConflicts(candidateReservations, occupied);
      await client.query(
        `UPDATE reservations SET status = 'released' WHERE tenant_id = $1 AND appointment_id = $2 AND status IN ('held','confirmed')`,
        [auth.tenantId, appointmentId],
      );
      const resStatus = old.state === 'held' ? 'held' : 'confirmed';
      for (const row of candidateReservations) {
        await client.query(
          `INSERT INTO reservations (tenant_id, id, appointment_id, resource_kind, resource_id, starts_at, ends_at, status, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [auth.tenantId, randomUUID(), appointmentId, row.kind, row.entityId, toIso(row.start), toIso(row.end), resStatus, null],
        );
      }
      for (const [sequence, item] of candidateItems.entries()) {
        await client.query(
          `UPDATE appointment_items SET starts_at = $4, service_ends_at = $5, ends_at = $6
           WHERE tenant_id = $1 AND appointment_id = $2 AND sequence = $3`,
          [auth.tenantId, appointmentId, sequence, item.start, item.serviceEnd, item.end],
        );
      }
      const now = this.#now();
      await client.query(
        `UPDATE appointments SET starts_at = $3, ends_at = $4, version = version + 1, updated_at = $5
         WHERE tenant_id = $1 AND id = $2`,
        [auth.tenantId, appointmentId, candidateItems[0].start, candidateItems[candidateItems.length - 1].end, now.toISOString()],
      );
      const updated = await loadAppointment(client, auth.tenantId, appointmentId);
      await client.query(
        `INSERT INTO appointment_revisions (tenant_id, appointment_id, version, snapshot, actor_user_id, reason)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
        [auth.tenantId, appointmentId, updated.version, JSON.stringify(updated), auth.userId, command.reason ?? 'reschedule'],
      );
      return updated;
    });
  }

  async transition(auth, appointmentId, command) {
    this.auth.assertBooking(auth);
    if (!object(command) || !text(command.state) || !Number.isSafeInteger(Number(command.expectedVersion))) {
      fail('INVALID', 'Transition command required');
    }
    return withTenantTx(this.pool, auth.tenantId, async client => {
      const old = await loadAppointment(client, auth.tenantId, appointmentId);
      if (!old) fail('NOT_FOUND', 'Record not found');
      if (old.version !== Number(command.expectedVersion)) fail('STALE_VERSION', 'Appointment changed; reload before editing');
      const allowed = TRANSITIONS[old.state];
      if (!allowed?.has(command.state)) fail('INVALID', 'Illegal appointment transition');
      const now = this.#now();
      if (command.state === 'cancelled' || command.state === 'no_show') {
        await client.query(
          `UPDATE reservations SET status = 'released' WHERE tenant_id = $1 AND appointment_id = $2 AND status IN ('held','confirmed')`,
          [auth.tenantId, appointmentId],
        );
      }
      if (command.state === 'confirmed' && old.state === 'held') {
        await client.query(
          `UPDATE reservations SET status = 'confirmed', expires_at = NULL
           WHERE tenant_id = $1 AND appointment_id = $2 AND status = 'held'`,
          [auth.tenantId, appointmentId],
        );
      }
      await client.query(
        `UPDATE appointments
         SET state = $3, version = version + 1, updated_at = $4, cancelled_at = CASE WHEN $3 IN ('cancelled','no_show') THEN $4 ELSE cancelled_at END,
             cancel_reason = COALESCE($5, cancel_reason)
         WHERE tenant_id = $1 AND id = $2`,
        [auth.tenantId, appointmentId, command.state, now.toISOString(), command.reason ?? null],
      );
      const updated = await loadAppointment(client, auth.tenantId, appointmentId);
      await client.query(
        `INSERT INTO appointment_revisions (tenant_id, appointment_id, version, snapshot, actor_user_id, reason)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
        [auth.tenantId, appointmentId, updated.version, JSON.stringify(updated), auth.userId, command.reason ?? command.state],
      );
      return updated;
    });
  }

  async availability(auth, query) {
    this.auth.assertBooking(auth);
    if (!object(query) || !text(query.serviceId) || !text(query.start) || !text(query.end)) {
      fail('INVALID', 'Service and time range required');
    }
    return withTenantTx(this.pool, auth.tenantId, async client => {
      const catalog = await loadCatalog(client, auth.tenantId);
      const service = catalog.services.find(value => value.id === query.serviceId);
      if (!service) fail('INVALID', 'Service or qualified staff unavailable');
      const occupyMs = (service.durationMinutes + (service.bufferMinutes ?? 0)) * 60000;
      const rangeStart = instant(query.start);
      const rangeEnd = instant(query.end);
      const occupied = await loadOccupied(client, auth.tenantId);
      const staffList = query.staffId
        ? catalog.staff.filter(value => value.id === query.staffId)
        : catalog.staff.filter(value => value.serviceIds.includes(service.id));
      const slots = [];
      const step = (catalog.policy.slot_interval_minutes ?? 15) * 60000;
      for (const staff of staffList) {
        for (const window of staff.availability) {
          const begin = Math.max(rangeStart, instant(window.start));
          const stop = Math.min(rangeEnd, instant(window.end));
          for (let start = begin; start + occupyMs <= stop; start += step) {
            const end = start + occupyMs;
            if (!entityAvailable(staff, start, end)) continue;
            let resourceId = query.resourceId ?? null;
            if (service.resourceRequired) {
              const resource = (resourceId ? catalog.resources.filter(value => value.id === resourceId) : catalog.resources)
                .find(value => value.serviceIds.includes(service.id) && entityAvailable(value, start, end)
                  && !occupied.some(row => row.kind === 'resource' && row.entityId === value.id && overlaps(row, { start, end })));
              if (!resource) continue;
              resourceId = resource.id;
            }
            if (occupied.some(row => row.kind === 'staff' && row.entityId === staff.id && overlaps(row, { start, end }))) continue;
            slots.push({ start: toIso(start), end: toIso(end), staffId: staff.id, resourceId });
          }
        }
      }
      return slots;
    });
  }

  async expireHolds(auth) {
    this.auth.assertBooking(auth);
    return withTenantTx(this.pool, auth.tenantId, async client => {
      const { rows } = await client.query(
        `SELECT DISTINCT resource_kind AS kind, resource_id AS id
         FROM reservations
         WHERE tenant_id = $1 AND status = 'held' AND expires_at <= $2
         ORDER BY 1, 2`,
        [auth.tenantId, this.#now().toISOString()],
      );
      const keys = rows.map(row => ({ kind: row.kind, id: row.id }));
      if (keys.length) {
        await lockOccupancy(client, auth.tenantId, keys);
        await retireExpiredHolds(client, auth.tenantId, this.#now(), keys);
      }
      return { retired: keys.length };
    });
  }
}

export async function expireHoldsForTenant(client, tenantId, now) {
  const { rows } = await client.query(
    `SELECT DISTINCT resource_kind AS kind, resource_id AS id
     FROM reservations
     WHERE tenant_id = $1 AND status = 'held' AND expires_at <= $2
     ORDER BY 1, 2`,
    [tenantId, new Date(now).toISOString()],
  );
  const keys = rows.map(row => ({ kind: row.kind, id: row.id }));
  if (keys.length) {
    await lockOccupancy(client, tenantId, keys);
    await retireExpiredHolds(client, tenantId, new Date(now), keys);
  }
  return keys.length;
}

function keysForRequest(catalog, request) {
  const raw = [];
  for (const item of request.items ?? []) {
    if (item.staffId) raw.push({ kind: 'staff', entityId: item.staffId });
    else {
      for (const staff of catalog.staff.filter(value => value.serviceIds.includes(item.serviceId))) {
        raw.push({ kind: 'staff', entityId: staff.id });
      }
    }
    if (item.resourceId) raw.push({ kind: 'resource', entityId: item.resourceId });
    else {
      const service = catalog.services.find(value => value.id === item.serviceId);
      if (service?.resourceRequired) {
        for (const resource of catalog.resources.filter(value => value.serviceIds.includes(item.serviceId))) {
          raw.push({ kind: 'resource', entityId: resource.id });
        }
      }
    }
  }
  return occupancyKeys(raw);
}

async function lockOccupancy(client, tenantId, keys) {
  for (const key of keys) {
    await client.query(
      `INSERT INTO occupancy_locks (tenant_id, resource_kind, resource_id)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [tenantId, key.kind, key.id],
    );
  }
  if (!keys.length) return;
  await client.query(
    `SELECT 1 FROM occupancy_locks
     WHERE tenant_id = $1 AND (resource_kind, resource_id) IN (
       SELECT * FROM unnest($2::text[], $3::uuid[]) AS t(kind, id)
     )
     ORDER BY resource_kind, resource_id
     FOR UPDATE`,
    [tenantId, keys.map(key => key.kind), keys.map(key => key.id)],
  );
}

async function retireExpiredHolds(client, tenantId, now, keys) {
  if (!keys.length) return;
  const { rows } = await client.query(
    `UPDATE reservations r SET status = 'expired'
     WHERE r.tenant_id = $1 AND r.status = 'held' AND r.expires_at IS NOT NULL AND r.expires_at <= $2
       AND (r.resource_kind, r.resource_id) IN (
         SELECT * FROM unnest($3::text[], $4::uuid[]) AS t(kind, id)
       )
     RETURNING appointment_id`,
    [tenantId, now.toISOString(), keys.map(key => key.kind), keys.map(key => key.id)],
  );
  const appointmentIds = [...new Set(rows.map(row => row.appointment_id))];
  if (!appointmentIds.length) return;
  await client.query(
    `UPDATE reservations SET status = 'expired'
     WHERE tenant_id = $1 AND appointment_id = ANY($2::uuid[]) AND status = 'held'`,
    [tenantId, appointmentIds],
  );
  await client.query(
    `UPDATE appointments
     SET state = 'cancelled', cancel_reason = 'hold_expired', updated_at = $3, version = version + 1
     WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND state = 'held'`,
    [tenantId, appointmentIds, now.toISOString()],
  );
}

async function loadOccupied(client, tenantId, excludeAppointmentId = null) {
  const { rows } = await client.query(
    `SELECT resource_kind AS kind, resource_id AS "entityId",
            (EXTRACT(EPOCH FROM starts_at) * 1000)::bigint AS start,
            (EXTRACT(EPOCH FROM ends_at) * 1000)::bigint AS end
     FROM reservations
     WHERE tenant_id = $1 AND status IN ('held','confirmed')
       AND ($2::uuid IS NULL OR appointment_id <> $2)`,
    [tenantId, excludeAppointmentId],
  );
  return rows.map(row => ({ kind: row.kind, entityId: row.entityId, start: Number(row.start), end: Number(row.end) }));
}

function resolveAssignments(catalog, request, occupied, now) {
  const items = [];
  let cursor = instant(request.start);
  for (const item of request.items) {
    const service = catalog.services.find(value => value.id === item.serviceId);
    if (!service) fail('INVALID', 'Service or qualified staff unavailable');
    const occupy = (service.durationMinutes + (service.bufferMinutes ?? 0)) * 60000;
    const start = cursor;
    const end = start + occupy;
    let staffId = item.staffId ?? null;
    if (!staffId) {
      const staff = pickFirstEligibleStaff(catalog, service.id, start, end, occupied);
      if (!staff) fail('UNAVAILABLE', 'Outside availability or blocked time');
      staffId = staff.id;
    }
    items.push({ ...item, staffId, resourceId: item.resourceId ?? null });
    cursor = end;
  }
  void now;
  return { ...request, items };
}

function assertBookingWindow(catalog, plan, now) {
  const startMs = instant(plan.items[0].start);
  const notice = (catalog.policy.min_notice_minutes ?? 0) * 60000;
  const maxAdvance = (catalog.policy.max_advance_days ?? 365) * 86400000;
  if (startMs < now.getTime() + notice || startMs > now.getTime() + maxAdvance) {
    fail('UNAVAILABLE', 'Outside booking window');
  }
}

function assertConflicts(reservations, occupied) {
  for (const row of reservations) {
    if (occupied.some(other => other.kind === row.kind && other.entityId === row.entityId && overlaps(row, other))) {
      fail('CONFLICT', 'Requested staff or resource already reserved');
    }
  }
}

function assertLocationHours(catalog, locationId, reservations) {
  const windows = catalog.locationWindows.filter(row => row.id === locationId);
  if (!windows.length) return;
  for (const row of reservations) {
    const covered = windows.some(window => instant(window.start) <= row.start && instant(window.end) >= row.end);
    if (!covered) fail('UNAVAILABLE', 'Outside availability or blocked time');
  }
}

async function insertAppointment(client, { auth, request, plan, locationId, catalog, now }) {
  const id = randomUUID();
  const state = request.hold ? 'held' : 'confirmed';
  const resStatus = state === 'held' ? 'held' : 'confirmed';
  const expiresAt = state === 'held' ? new Date(now.getTime() + catalog.policy.hold_minutes * 60000).toISOString() : null;
  const startsAt = plan.items[0].start;
  const endsAt = plan.items[plan.items.length - 1].end;
  const policySnapshot = {
    holdMinutes: catalog.policy.hold_minutes,
    slotIntervalMinutes: catalog.policy.slot_interval_minutes,
    bookedAt: now.toISOString(),
  };
  await client.query(
    `INSERT INTO appointments (
       tenant_id, id, location_id, client_id, state, starts_at, ends_at, version, source, notes, policy_snapshot, created_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,1,'staff',$8,$9::jsonb,$10)`,
    [auth.tenantId, id, locationId, request.clientId, state, startsAt, endsAt, request.notes ?? null, JSON.stringify(policySnapshot), auth.userId],
  );
  const items = [];
  for (const [sequence, item] of plan.items.entries()) {
    const itemId = randomUUID();
    const currency = catalog.services.find(value => value.id === item.serviceId)?.currency ?? 'SGD';
    await client.query(
      `INSERT INTO appointment_items (
         tenant_id, id, appointment_id, sequence, service_id, service_version, staff_id, resource_id,
         starts_at, service_ends_at, ends_at, duration_minutes, buffer_minutes, price_minor, currency
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        auth.tenantId, itemId, id, sequence, item.serviceId, item.serviceVersion, item.staffId, item.resourceId,
        item.start, item.serviceEnd, item.end, item.durationMinutes, item.bufferMinutes, item.priceMinor, currency,
      ],
    );
    items.push({
      serviceId: item.serviceId, staffId: item.staffId, resourceId: item.resourceId, start: item.start,
      serviceEnd: item.serviceEnd, end: item.end, durationMinutes: item.durationMinutes, bufferMinutes: item.bufferMinutes,
      priceMinor: item.priceMinor, serviceVersion: item.serviceVersion,
    });
  }
  const reservations = [];
  for (const row of plan.reservations) {
    await client.query(
      `INSERT INTO reservations (tenant_id, id, appointment_id, resource_kind, resource_id, starts_at, ends_at, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [auth.tenantId, randomUUID(), id, row.kind, row.entityId, toIso(row.start), toIso(row.end), resStatus, expiresAt],
    );
    reservations.push({ kind: row.kind, entityId: row.entityId, start: row.start, end: row.end, status: resStatus });
  }
  const appointment = {
    id, tenantId: auth.tenantId, clientId: request.clientId, locationId, state, version: 1,
    items, reservations, policySnapshot,
  };
  await client.query(
    `INSERT INTO appointment_revisions (tenant_id, appointment_id, version, snapshot, actor_user_id, reason)
     VALUES ($1,$2,1,$3::jsonb,$4,'create')`,
    [auth.tenantId, id, JSON.stringify(appointment), auth.userId],
  );
  return appointment;
}

async function loadAppointment(client, tenantId, appointmentId) {
  const { rows } = await client.query(
    `SELECT id, tenant_id AS "tenantId", client_id AS "clientId", location_id AS "locationId", state, version, policy_snapshot AS "policySnapshot"
     FROM appointments WHERE tenant_id = $1 AND id = $2`,
    [tenantId, appointmentId],
  );
  if (!rows[0]) return null;
  const items = await client.query(
    `SELECT service_id AS "serviceId", staff_id AS "staffId", resource_id AS "resourceId",
            starts_at AS start, service_ends_at AS "serviceEnd", ends_at AS end,
            duration_minutes AS "durationMinutes", buffer_minutes AS "bufferMinutes",
            price_minor AS "priceMinor", service_version AS "serviceVersion"
     FROM appointment_items WHERE tenant_id = $1 AND appointment_id = $2 ORDER BY sequence`,
    [tenantId, appointmentId],
  );
  const reservations = await client.query(
    `SELECT resource_kind AS kind, resource_id AS "entityId",
            (EXTRACT(EPOCH FROM starts_at) * 1000)::bigint AS start,
            (EXTRACT(EPOCH FROM ends_at) * 1000)::bigint AS end,
            status
     FROM reservations WHERE tenant_id = $1 AND appointment_id = $2`,
    [tenantId, appointmentId],
  );
  return {
    ...rows[0],
    items: items.rows.map(item => ({
      ...item,
      start: toIso(item.start),
      serviceEnd: toIso(item.serviceEnd),
      end: toIso(item.end),
    })),
    reservations: reservations.rows.map(reservationDto),
  };
}

void ACTIVE_STATES;
