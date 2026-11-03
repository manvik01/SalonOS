import { BookingError, fail } from './errors.mjs';

export { BookingError, fail };

export const clone = value => structuredClone(value);
export const text = value => typeof value === 'string' && value.trim().length > 0;
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const canonical = value => JSON.stringify(value);

export const instant = value => {
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

export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

const covers = (windows, start, end) => (windows ?? []).some(range => instant(range.start) <= start && instant(range.end) >= end);
const blockedBy = (windows, start, end) => (windows ?? []).some(range => overlaps({ start, end }, { start: instant(range.start), end: instant(range.end) }));

export const entityAvailable = (entity, start, end) => {
  if (!entity) return false;
  return covers(entity.availability, start, end) && !blockedBy(entity.blocked, start, end);
};

export const planAppointment = (tenant, request) => {
  if (!object(request) || !text(request.clientId) || !Array.isArray(request.items) || request.items.length === 0) {
    fail('INVALID', 'Client and service items required');
  }
  if (request.recurrence || request.repeating || request.groupClientIds || request.parallel === true) {
    fail('UNSUPPORTED', 'Recurring, group and parallel bookings are not supported');
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
      if (!entityAvailable(entity, start, end)) fail('UNAVAILABLE', 'Outside availability or blocked time');
    }
    normalized.items.push({ serviceId: service.id, staffId: staff.id, resourceId });
    items.push({
      serviceId: service.id, staffId: staff.id, resourceId, start: new Date(start).toISOString(),
      serviceEnd: new Date(serviceEnd).toISOString(), end: new Date(end).toISOString(),
      durationMinutes: duration, bufferMinutes: buffer, priceMinor: service.priceMinor,
      serviceVersion: service.version ?? 1,
    });
    reservations.push({ kind: 'staff', entityId: staff.id, start, end });
    if (resource) reservations.push({ kind: 'resource', entityId: resource.id, start, end });
    cursor = end;
  }
  return { normalized, items, reservations };
};

export const occupancyKeys = reservations => {
  const seen = new Set();
  const keys = [];
  for (const row of reservations) {
    const id = `${row.kind}:${row.entityId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push({ kind: row.kind, id: row.entityId });
  }
  keys.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return keys;
};

export const pickFirstEligibleStaff = (tenant, serviceId, start, end, occupied) => {
  const service = tenant.services.find(value => value.id === serviceId);
  if (!service) return null;
  const candidates = tenant.staff
    .filter(staff => staff.serviceIds.includes(serviceId) && entityAvailable(staff, start, end))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const staff of candidates) {
    const clash = occupied.some(row => row.kind === 'staff' && row.entityId === staff.id && overlaps(row, { start, end }));
    if (!clash) return staff;
  }
  return null;
};
