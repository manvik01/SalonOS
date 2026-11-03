import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const PARAMS = { N: 16384, r: 8, p: 1, keyLength: 32 };

export const normalizeEmail = email => String(email ?? '').trim().toLowerCase();

export const hashPassword = password => {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, PARAMS.keyLength, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('hex')}$${key.toString('hex')}`;
};

export const verifyPassword = (password, stored) => {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltHex, keyHex] = parts;
  let key;
  try {
    key = scryptSync(password, Buffer.from(saltHex, 'hex'), Buffer.from(keyHex, 'hex').length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
  } catch {
    return false;
  }
  const expected = Buffer.from(keyHex, 'hex');
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
};

export const DUMMY_PASSWORD_HASH = hashPassword('salonos-dummy-not-a-user');

export const sha256Hex = value => createHash('sha256').update(value).digest('hex');
