import { randomBytes, randomUUID } from 'node:crypto';
import { fail, object, text } from '../domain/plan.mjs';
import { withTenantTx } from '../persistence/tx.mjs';
import { DUMMY_PASSWORD_HASH, hashPassword, normalizeEmail, sha256Hex, verifyPassword } from './passwords.mjs';

const BOOKING_ROLES = new Set(['owner', 'manager', 'receptionist', 'practitioner']);
const CATALOG_ROLES = new Set(['owner', 'manager']);
const NOTE_ROLES = new Set(['owner', 'manager', 'practitioner']);
const EXPORT_ROLES = new Set(['owner', 'manager', 'finance']);
const PAYOUT_ROLES = new Set(['owner']);
const INVITE_ROLES = new Set(['owner', 'manager']);
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const INVITE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_MS = 12 * 60 * 60 * 1000;

const tokenValue = () => randomBytes(32).toString('base64url');

export class AuthService {
  constructor(pool, { clock = () => new Date(), sessionTtlMs = SESSION_MS } = {}) {
    this.pool = pool;
    this.clock = clock;
    this.sessionTtlMs = sessionTtlMs;
  }

  #now() { return new Date(this.clock()); }

  async #audit({ tenantId = null, actorUserId = null, action, objectType = null, objectId = null, outcome, metadata = {} }) {
    await this.pool.query(
      `INSERT INTO audit_events (id, tenant_id, actor_user_id, action, object_type, object_id, outcome, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [randomUUID(), tenantId, actorUserId, action, objectType, objectId, outcome, JSON.stringify(metadata)],
    );
  }

  async #throttle(email) {
    const now = this.#now();
    const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
    const key = sha256Hex(`login:${email}`);
    const { rows } = await this.pool.query(
      `INSERT INTO auth_throttle (key, window_start, attempts) VALUES ($1,$2,1)
       ON CONFLICT (key, window_start) DO UPDATE SET attempts = auth_throttle.attempts + 1
       RETURNING attempts`,
      [key, windowStart.toISOString()],
    );
    return rows[0].attempts;
  }

  async #attempts(email) {
    const now = this.#now();
    const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
    const key = sha256Hex(`login:${email}`);
    const { rows } = await this.pool.query(
      'SELECT attempts FROM auth_throttle WHERE key = $1 AND window_start = $2',
      [key, windowStart.toISOString()],
    );
    return rows[0]?.attempts ?? 0;
  }

  async login(email, password, tenantId) {
    const normalized = normalizeEmail(email);
    if (!normalized || !text(password)) fail('UNAUTHORIZED', 'Invalid credentials');
    if ((await this.#attempts(normalized)) >= MAX_ATTEMPTS) fail('RATE_LIMITED', 'Too many attempts');
    const { rows } = await this.pool.query('SELECT id, password_hash, disabled_at FROM users WHERE email = $1', [normalized]);
    const user = rows[0];
    const ok = verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !ok || user.disabled_at) {
      await this.#throttle(normalized);
      if ((await this.#attempts(normalized)) > MAX_ATTEMPTS) fail('RATE_LIMITED', 'Too many attempts');
      fail('UNAUTHORIZED', 'Invalid credentials');
    }
    const memberships = await this.pool.query(
      `SELECT tenant_id AS "tenantId", role, status FROM memberships WHERE user_id = $1`,
      [user.id],
    );
    const active = memberships.rows.filter(row => row.status === 'active');
    let membership = active[0];
    if (tenantId) membership = active.find(row => row.tenantId === tenantId);
    if (!membership) fail('UNAUTHORIZED', 'Invalid credentials');
    if (active.length > 1 && !tenantId) fail('INVALID', 'tenantId required when user has multiple memberships');
    const token = tokenValue();
    const expires = new Date(this.#now().getTime() + this.sessionTtlMs);
    await this.pool.query(
      `INSERT INTO sessions (id, user_id, tenant_id, token_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), user.id, membership.tenantId, sha256Hex(token), expires.toISOString()],
    );
    return { token, expiresAt: expires.toISOString(), userId: user.id, tenantId: membership.tenantId, role: membership.role };
  }

  async requestRecovery(email) {
    normalizeEmail(email);
    return { ok: true };
  }

  async resolveSession(token) {
    if (!text(token)) fail('UNAUTHORIZED', 'Authentication required');
    const now = this.#now();
    const { rows } = await this.pool.query(
      `SELECT s.id, s.user_id AS "userId", s.tenant_id AS "tenantId", s.expires_at AS "expiresAt", s.revoked_at AS "revokedAt",
              u.disabled_at AS "disabledAt", m.role, m.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN memberships m ON m.tenant_id = s.tenant_id AND m.user_id = s.user_id
       WHERE s.token_hash = $1`,
      [sha256Hex(token)],
    );
    const session = rows[0];
    if (!session || session.revokedAt || new Date(session.expiresAt) <= now || session.disabledAt) {
      fail('UNAUTHORIZED', 'Authentication required');
    }
    if (session.status !== 'active') fail('FORBIDDEN', 'Membership is not active');
    return { sessionId: session.id, userId: session.userId, tenantId: session.tenantId, role: session.role };
  }

  assertTenant(auth, requestedTenantId) {
    if (requestedTenantId && requestedTenantId !== auth.tenantId) fail('FORBIDDEN', 'Tenant mismatch');
    return auth.tenantId;
  }

  assertBooking(auth) {
    if (!BOOKING_ROLES.has(auth.role)) fail('FORBIDDEN', 'Insufficient role');
  }

  assertCatalogWrite(auth) {
    if (!CATALOG_ROLES.has(auth.role)) fail('FORBIDDEN', 'Insufficient role');
  }

  async invite(auth, command) {
    if (!INVITE_ROLES.has(auth.role)) fail('FORBIDDEN', 'Insufficient role');
    if (!object(command) || !text(command.email) || !text(command.role)) fail('INVALID', 'Invitation email and role required');
    const email = normalizeEmail(command.email);
    const token = tokenValue();
    const id = randomUUID();
    const expires = new Date(this.#now().getTime() + INVITE_MS);
    await this.pool.query(
      `INSERT INTO invitations (tenant_id, id, email, role, token_hash, expires_at, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [auth.tenantId, id, email, command.role, sha256Hex(token), expires.toISOString(), auth.userId],
    );
    await this.#audit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'membership.invite', objectType: 'invitation', objectId: id, outcome: 'allowed' });
    return { id, email, role: command.role, token, expiresAt: expires.toISOString() };
  }

  async revokeInvite(auth, invitationId) {
    if (!INVITE_ROLES.has(auth.role)) fail('FORBIDDEN', 'Insufficient role');
    const { rowCount } = await this.pool.query(
      `UPDATE invitations SET revoked_at = $3
       WHERE tenant_id = $1 AND id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [auth.tenantId, invitationId, this.#now().toISOString()],
    );
    if (!rowCount) fail('NOT_FOUND', 'Record not found');
    await this.#audit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'membership.invite.revoke', objectType: 'invitation', objectId: invitationId, outcome: 'allowed' });
  }

  async acceptInvite(rawToken, command) {
    if (!text(rawToken) || !object(command) || !text(command.password) || !text(command.displayName)) {
      fail('INVALID', 'Invitation token, password and name required');
    }
    const now = this.#now();
    const { rows } = await this.pool.query(
      `SELECT tenant_id AS "tenantId", id, email, role, expires_at AS "expiresAt", revoked_at AS "revokedAt", accepted_at AS "acceptedAt"
       FROM invitations WHERE token_hash = $1`,
      [sha256Hex(rawToken)],
    );
    const invite = rows[0];
    if (!invite || invite.revokedAt || invite.acceptedAt || new Date(invite.expiresAt) <= now) fail('NOT_FOUND', 'Record not found');
    let userId;
    const existing = await this.pool.query('SELECT id FROM users WHERE email = $1', [invite.email]);
    if (existing.rowCount) {
      userId = existing.rows[0].id;
    } else {
      userId = randomUUID();
      await this.pool.query(
        `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1,$2,$3,$4)`,
        [userId, invite.email, hashPassword(command.password), command.displayName],
      );
    }
    await this.pool.query(
      `INSERT INTO memberships (tenant_id, user_id, role, status)
       VALUES ($1,$2,$3,'active')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active', role = EXCLUDED.role, updated_at = now()`,
      [invite.tenantId, userId, invite.role],
    );
    await this.pool.query(
      `UPDATE invitations SET accepted_at = $3, accepted_user_id = $4 WHERE tenant_id = $1 AND id = $2`,
      [invite.tenantId, invite.id, now.toISOString(), userId],
    );
    return { userId, tenantId: invite.tenantId, role: invite.role };
  }

  async disableMembership(auth, userId) {
    if (auth.role !== 'owner') fail('FORBIDDEN', 'Insufficient role');
    if (userId === auth.userId) fail('INVALID', 'Cannot disable the acting owner');
    const { rowCount } = await this.pool.query(
      `UPDATE memberships SET status = 'disabled', updated_at = now()
       WHERE tenant_id = $1 AND user_id = $2 AND status <> 'disabled'`,
      [auth.tenantId, userId],
    );
    if (!rowCount) fail('NOT_FOUND', 'Record not found');
    await this.pool.query(
      `UPDATE sessions SET revoked_at = $3 WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [auth.tenantId, userId, this.#now().toISOString()],
    );
    await this.#audit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'membership.disable', objectType: 'user', objectId: userId, outcome: 'allowed' });
  }

  async readRestrictedNote(auth, noteId) {
    if (!NOTE_ROLES.has(auth.role)) {
      await this.#audit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'restricted_note.read', objectType: 'restricted_note', objectId: noteId, outcome: 'denied' });
      fail('FORBIDDEN', 'Insufficient role');
    }
    return withTenantTx(this.pool, auth.tenantId, async client => {
      const { rows } = await client.query(
        `SELECT n.id, n.client_id AS "clientId", n.body
         FROM restricted_notes n WHERE n.tenant_id = $1 AND n.id = $2`,
        [auth.tenantId, noteId],
      );
      if (!rows[0]) fail('NOT_FOUND', 'Record not found');
      await this.#audit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'restricted_note.read', objectType: 'restricted_note', objectId: noteId, outcome: 'allowed' });
      return rows[0];
    });
  }

  async exportClients(auth) {
    if (!EXPORT_ROLES.has(auth.role)) {
      await this.#audit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'clients.export', outcome: 'denied' });
      fail('FORBIDDEN', 'Insufficient role');
    }
    fail('UNSUPPORTED', 'Client export is not implemented in this slice');
  }

  async changePayoutSettings(auth) {
    if (!PAYOUT_ROLES.has(auth.role)) {
      await this.#audit({ tenantId: auth.tenantId, actorUserId: auth.userId, action: 'payouts.change', outcome: 'denied' });
      fail('FORBIDDEN', 'Insufficient role');
    }
    fail('UNSUPPORTED', 'Payout settings are not implemented in this slice');
  }
}
