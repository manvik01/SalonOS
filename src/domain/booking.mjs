import { randomUUID } from 'node:crypto';
import { BookingError, fail, clone, text, object, instant, overlaps, canonical, planAppointment } from './plan.mjs';

export { BookingError };

// Reference model only. Mutations have no await points and are atomic only within
// this one process. PostgreSQL transactions/constraints must replace these maps.
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
    return planAppointment(this.#tenant(tenantId), request);
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
