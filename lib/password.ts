import { randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual } from 'node:crypto';

const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const HASH_PREFIX = 'scrypt';
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const MAX_MEM = 64 * 1024 * 1024;

interface ParsedScryptHash {
  n: number;
  r: number;
  p: number;
  salt: string;
  expected: Buffer;
}

function parseStoredScryptHash(storedHash: string): ParsedScryptHash | null {
  const parts = storedHash.split(':');
  let n = DEFAULT_N;
  let r = DEFAULT_R;
  let p = DEFAULT_P;
  let salt = '';
  let hashHex = '';

  if (parts.length === 6) {
    const [scheme, nStr, rStr, pStr, saltPart, hashPart] = parts;
    if (scheme !== HASH_PREFIX) return null;
    n = Number.parseInt(nStr, 10);
    r = Number.parseInt(rStr, 10);
    p = Number.parseInt(pStr, 10);
    if (
      !Number.isInteger(n) ||
      n < 1024 ||
      n > 131072 ||
      (n & (n - 1)) !== 0 ||
      !Number.isInteger(r) ||
      r < 1 ||
      r > 32 ||
      !Number.isInteger(p) ||
      p < 1 ||
      p > 16
    ) {
      return null;
    }
    salt = saltPart;
    hashHex = hashPart;
  } else if (parts.length === 3) {
    const [scheme, saltPart, hashPart] = parts;
    if (scheme !== HASH_PREFIX) return null;
    salt = saltPart;
    hashHex = hashPart;
  } else {
    return null;
  }

  if (
    !salt ||
    !hashHex ||
    hashHex.length !== KEY_LENGTH * 2 ||
    !/^[0-9a-f]+$/i.test(salt) ||
    !/^[0-9a-f]+$/i.test(hashHex)
  ) {
    return null;
  }

  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== KEY_LENGTH) return null;

  return { n, r, p, salt, expected };
}

export function hashPassword(password: string): string {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
    maxmem: MAX_MEM,
  }).toString('hex');
  return `${HASH_PREFIX}:${DEFAULT_N}:${DEFAULT_R}:${DEFAULT_P}:${salt}:${derived}`;
}

export async function hashPasswordAsync(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      {
        N: DEFAULT_N,
        r: DEFAULT_R,
        p: DEFAULT_P,
        maxmem: MAX_MEM,
      },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
  return `${HASH_PREFIX}:${DEFAULT_N}:${DEFAULT_R}:${DEFAULT_P}:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (
    typeof password !== 'string' ||
    typeof storedHash !== 'string' ||
    password.length === 0
  ) {
    return false;
  }

  const parsed = parseStoredScryptHash(storedHash);
  if (!parsed) return false;

  try {
    const actual = await new Promise<Buffer>((resolve, reject) => {
      scryptCallback(
        password,
        parsed.salt,
        parsed.expected.length,
        {
          N: parsed.n,
          r: parsed.r,
          p: parsed.p,
          maxmem: MAX_MEM,
        },
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
    if (actual.length !== parsed.expected.length) return false;
    return timingSafeEqual(actual, parsed.expected);
  } catch {
    return false;
  }
}

export const verifyPasswordAsync = verifyPassword;
