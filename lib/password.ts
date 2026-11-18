import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const HASH_PREFIX = 'scrypt';

export function hashPassword(password: string): string {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${HASH_PREFIX}:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (
    typeof password !== 'string' ||
    typeof storedHash !== 'string' ||
    password.length === 0
  ) {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;

  const [scheme, salt, hashHex] = parts;
  if (
    scheme !== HASH_PREFIX ||
    !salt ||
    !hashHex ||
    hashHex.length !== KEY_LENGTH * 2 ||
    !/^[0-9a-f]+$/i.test(salt) ||
    !/^[0-9a-f]+$/i.test(hashHex)
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
