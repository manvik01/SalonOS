import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { BookingError } from '../domain/errors.mjs';

const STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_VERSION: 409,
  IDEMPOTENCY_MISMATCH: 409,
  RATE_LIMITED: 429,
  INVALID: 422,
  UNAVAILABLE: 422,
  UNSUPPORTED: 422,
};

const json = (res, status, body, correlationId) => {
  const payload = JSON.stringify({ ...body, correlationId });
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-correlation-id': correlationId });
  res.end(payload);
};

const readBody = async req => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
      const error = new BookingError('INVALID', 'Request body too large');
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new BookingError('INVALID', 'Malformed JSON');
  }
};

const bearer = req => {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
};

export const createSchedulingServer = ({ auth, scheduling }) => http.createServer(async (req, res) => {
  const correlationId = req.headers['x-correlation-id'] || randomUUID();
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/\/$/, '') || '/';
    if (req.method === 'POST' && path === '/v1/auth/login') {
      const body = await readBody(req);
      const session = await auth.login(body.email, body.password, body.tenantId);
      return json(res, 200, session, correlationId);
    }
    if (req.method === 'POST' && path === '/v1/auth/recovery') {
      const body = await readBody(req);
      const result = await auth.requestRecovery(body.email);
      return json(res, 200, result, correlationId);
    }
    if (req.method === 'POST' && path === '/v1/invitations/accept') {
      const body = await readBody(req);
      const result = await auth.acceptInvite(body.token, body);
      return json(res, 200, result, correlationId);
    }
    const session = await auth.resolveSession(bearer(req));
    if (req.method === 'POST' && path === '/v1/appointments') {
      const body = await readBody(req);
      const created = await scheduling.create(session, body, req.headers['idempotency-key']);
      return json(res, 201, created, correlationId);
    }
    const appointmentMatch = /^\/v1\/appointments\/([^/]+)$/.exec(path);
    if (appointmentMatch && req.method === 'GET') {
      const appointment = await scheduling.get(session, appointmentMatch[1]);
      return json(res, 200, appointment, correlationId);
    }
    if (appointmentMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      const expectedVersion = body.expectedVersion ?? Number(req.headers['if-match']);
      if (body.state) {
        const updated = await scheduling.transition(session, appointmentMatch[1], { ...body, expectedVersion });
        return json(res, 200, updated, correlationId);
      }
      const updated = await scheduling.reschedule(session, appointmentMatch[1], { ...body, expectedVersion });
      return json(res, 200, updated, correlationId);
    }
    if (req.method === 'POST' && /^\/v1\/appointments\/([^/]+)\/cancel$/.exec(path)) {
      const id = /^\/v1\/appointments\/([^/]+)\/cancel$/.exec(path)[1];
      const body = await readBody(req);
      const updated = await scheduling.transition(session, id, { state: 'cancelled', expectedVersion: body.expectedVersion, reason: body.reason });
      return json(res, 200, updated, correlationId);
    }
    if (req.method === 'POST' && /^\/v1\/appointments\/([^/]+)\/no-show$/.exec(path)) {
      const id = /^\/v1\/appointments\/([^/]+)\/no-show$/.exec(path)[1];
      const body = await readBody(req);
      const updated = await scheduling.transition(session, id, { state: 'no_show', expectedVersion: body.expectedVersion, reason: body.reason });
      return json(res, 200, updated, correlationId);
    }
    if (req.method === 'GET' && path === '/v1/availability') {
      const slots = await scheduling.availability(session, Object.fromEntries(url.searchParams.entries()));
      return json(res, 200, { slots }, correlationId);
    }
    const noteMatch = /^\/v1\/restricted-notes\/([^/]+)$/.exec(path);
    if (noteMatch && req.method === 'GET') {
      const note = await auth.readRestrictedNote(session, noteMatch[1]);
      return json(res, 200, note, correlationId);
    }
    if (req.method === 'POST' && path === '/v1/exports/clients') {
      await auth.exportClients(session);
    }
    if (req.method === 'POST' && path === '/v1/payout-settings') {
      await auth.changePayoutSettings(session);
    }
    if (req.method === 'POST' && path === '/v1/invitations') {
      const body = await readBody(req);
      const invitation = await auth.invite(session, body);
      return json(res, 201, invitation, correlationId);
    }
    if (req.method === 'POST' && path === '/v1/ops/expire-holds') {
      const result = await scheduling.expireHolds(session);
      return json(res, 200, result, correlationId);
    }
    json(res, 404, { code: 'NOT_FOUND', message: 'Route not found' }, correlationId);
  } catch (error) {
    if (error instanceof BookingError) {
      json(res, STATUS[error.code] ?? 400, { code: error.code, message: error.message }, correlationId);
      return;
    }
    json(res, 500, { code: 'INTERNAL', message: 'Request failed' }, correlationId);
  }
});

export const listen = (server, port = 0) => new Promise(resolve => {
  server.listen(port, '127.0.0.1', () => resolve(server.address().port));
});
