import { randomUUID } from 'node:crypto';

// Reference model only. Mutations have no await points and are atomic only within
// this one process. PostgreSQL transactions/constraints must replace these maps.
export class BookingError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new BookingError(code, message); };
const clone = value => structuredClone(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const instant = value => {
  const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) fail('INVALID', 'Timestamp must be an ISO date and include a timezone');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHour, offsetMinute] = parts;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59 ||
      (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) {
    fail('INVALID', 'Invalid calendar date or time');
  }
  const result = Date.parse(value);
  if (!Number.isFinite(result)) fail('INVALID', 'Invalid timestamp');
  return result;
};
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const canonical = value => JSON.stringify(value);

export class ReferenceScheduler {
  #tenants = new Map();
  #appointments = new Map();
  #idempotency = new Map();

  constructor(tenants) {
    for (const tenant of clone(tenants)) {
      if (!text(tenant.id) || this.#tenants.has(tenant.id)) fail('INVALID', 'Unique tenant ID required');
      this.#tenants.set(tenant.id, tenant);
    }
  }

  #tenant(tenantId) {
    const tenant = this.#tenants.get(tenantId);
    if (!tenant) fail('NOT_FOUND', 'Record not found');
    return tenant;
  }

  #key(tenantId, key) {
    if (!text(key)) fail('INVALID', 'Idempotency key required');
    return canonical([tenantId, key]);
  }

  #plan(tenantId, request) {
    const tenant = this.#tenant(tenantId);
    if (!object(request) || !text(request.clientId) || !Array.isArray(request.items) || request.items.length === 0) {
      fail('INVALID', 'Client and service items required');
    }
    let cursor = instant(request.start);
    const normalized = { clientId: request.clientId, start: new Date(cursor).toISOString(), items: [] };
    const items = [];
    const reservations = [];
    for (const item of request.items) {
      if (!object(item)) fail('INVALID', 'Invalid service item');
      const service = tenant.services.find(value => value.id === item.serviceId);
      const staff = tenant.staff.find(value => value.id === item.staffId);
      if (!service || !staff || !staff.serviceIds.includes(service.id)) fail('INVALID', 'Service or qualified staff unavailable');
      const duration = service.durationMinutes;
      const buffer = service.bufferMinutes ?? 0;
      if (!Number.isSafeInteger(duration) || duration <= 0 || !Number.isSafeInteger(buffer) || buffer < 0 ||
          !Number.isSafeInteger(service.priceMinor) || service.priceMinor < 0) fail('INVALID', 'Invalid service configuration');
      if (service.resourceRequired && !text(item.resourceId)) fail('INVALID', 'Service requires a resource');
      const resourceId = item.resourceId ?? null;
      const resource = resourceId === null ? null : tenant.resources.find(value => value.id === resourceId);
      if (resourceId !== null && (!resource || !resource.serviceIds.includes(service.id))) fail('INVALID', 'Resource unavailable');
      const start = cursor;
      const serviceEnd = start + duration * 60000;
      const end = serviceEnd + buffer * 60000;
      if (!Number.isFinite(end)) fail('INVALID', 'Invalid appointment interval');
      for (const entity of [staff, ...(resource ? [resource] : [])]) {
        const available = entity.availability.some(range => instant(range.start) <= start && instant(range.end) >= end);
        const blocked = (entity.blocked ?? []).some(range => overlaps({ start, end }, { start: instant(range.start), end: instant(range.end) }));
        if (!available || blocked) fail('UNAVAILABLE', 'Outside availability or blocked time');
      }
      normalized.items.push({ serviceId: service.id, staffId: staff.id, resourceId });
      items.push({ serviceId: service.id, staffId: staff.id, resourceId, start: new Date(start).toISOString(),
        serviceEnd: new Date(serviceEnd).toISOString(), end: new Date(end).toISOString(),
        durationMinutes: duration, bufferMinutes: buffer, priceMinor: service.priceMinor });
      reservations.push({ kind: 'staff', entityId: staff.id, start, end });
      if (resource) reservations.push({ kind: 'resource', entityId: resource.id, start, end });
      cursor = end;
    }
    return { normalized, items, reservations };
  }

  #checkConflicts(tenantId, reservations, excludeId = null) {
    for (const appointment of this.#appointments.values()) {
      if (appointment.tenantId !== tenantId || appointment.id === excludeId) continue;
      if (reservations.some(a => appointment.reservations.some(b => a.kind === b.kind && a.entityId === b.entityId && overlaps(a, b)))) {
        fail('CONFLICT', 'Requested staff or resource already reserved');
      }
    }
  }

  async create(tenantId, request, idempotencyKey) {
    const key = this.#key(tenantId, idempotencyKey);
    const plan = this.#plan(tenantId, request);
    const fingerprint = canonical(plan.normalized);
    const prior = this.#idempotency.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_MISMATCH', 'Key already used with different input');
      return clone(prior.response);
    }
    this.#checkConflicts(tenantId, plan.reservations);
    const appointment = { id: randomUUID(), tenantId, clientId: request.clientId,
      state: 'confirmed', version: 1, items: plan.items, reservations: plan.reservations };
    this.#appointments.set(appointment.id, appointment);
    this.#idempotency.set(key, { fingerprint, response: clone(appointment) });
    return clone(appointment);
  }

  get(tenantId, appointmentId) {
    this.#tenant(tenantId);
    const appointment = this.#appointments.get(appointmentId);
    if (!appointment || appointment.tenantId !== tenantId) fail('NOT_FOUND', 'Record not found');
    return clone(appointment);
  }

  async reschedule(tenantId, appointmentId, command) {
    if (!object(command)) fail('INVALID', 'Reschedule command required');
    const { start, expectedVersion } = command;
    const old = this.get(tenantId, appointmentId);
    if (old.version !== expectedVersion) fail('STALE_VERSION', 'Appointment changed; reload before editing');
    // Build from historical snapshots so a reschedule cannot reprice a service.
    const delta = instant(start) - instant(old.items[0].start);
    const tenant = this.#tenant(tenantId);
    const candidate = clone(old);
    for (const item of candidate.items) {
      for (const field of ['start', 'serviceEnd', 'end']) item[field] = new Date(instant(item[field]) + delta).toISOString();
      const entities = [tenant.staff.find(value => value.id === item.staffId)];
      if (item.resourceId !== null) entities.push(tenant.resources.find(value => value.id === item.resourceId));
      for (const entity of entities) {
        const begin = instant(item.start), end = instant(item.end);
        if (!entity || !entity.availability.some(range => instant(range.start) <= begin && instant(range.end) >= end) ||
            (entity.blocked ?? []).some(range => overlaps({ start: begin, end }, { start: instant(range.start), end: instant(range.end) }))) {
          fail('UNAVAILABLE', 'Outside availability or blocked time');
        }
      }
    }
    candidate.reservations = old.reservations.map(range => ({ ...range, start: range.start + delta, end: range.end + delta }));
    this.#checkConflicts(tenantId, candidate.reservations, appointmentId);
    candidate.version += 1;
    this.#appointments.set(appointmentId, candidate);
    return clone(candidate);
  }
}
