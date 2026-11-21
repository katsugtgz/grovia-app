import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { DEMO_ADMIN_PASS } from './demo-credentials';

const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const HASH_PREFIX = 'scrypt';
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const MAX_MEM = 64 * 1024 * 1024;

/**
 * Dummy target for the unknown-email timing guard: legacy `scrypt:<salt>:<hash>`
 * encoding with a zero salt and all-zero digest, sized from this module's
 * constants. No parameter components are embedded, so the parser applies the
 * current default costs — no drift and no regeneration when defaults change.
 * It is intended to verify false (the login route rejects missing users
 * regardless of this result); no guarantee that no password could ever match.
 */
export const DUMMY_SCRYPT_HASH = `${HASH_PREFIX}:${'0'.repeat(
  SALT_BYTES * 2
)}:${'0'.repeat(KEY_LENGTH * 2)}`;

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
      p > 16 ||
      128 * n * r > MAX_MEM
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

  const { promise: actual, resolve, reject } = Promise.withResolvers<Buffer>();
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
  const derived = await actual;
  if (derived.length !== parsed.expected.length) return false;
  return timingSafeEqual(derived, parsed.expected);
}

export const verifyPasswordAsync = verifyPassword;

const DEMO_PASS_DIGEST = createHash('sha256').update(DEMO_ADMIN_PASS).digest();

let configuredAdminPassDigest: { value: string; digest: Buffer } | null = null;

/**
 * Timing-safe check whether a candidate password equals the currently
 * configured `ADMIN_PASSWORD` (trimmed, as seeding hashes it). Part of the
 * private-mode login proof: the configured identity must present the actual
 * configured credential, not merely pass a stored-hash comparison.
 */
export function equalsConfiguredAdminPassword(candidate: string): boolean {
  const configured = process.env.ADMIN_PASSWORD?.trim();
  if (typeof candidate !== 'string' || candidate.length === 0 || !configured) return false;
  if (!configuredAdminPassDigest || configuredAdminPassDigest.value !== configured) {
    configuredAdminPassDigest = {
      value: configured,
      digest: createHash('sha256').update(configured).digest(),
    };
  }
  const candidateDigest = createHash('sha256').update(candidate).digest();
  return timingSafeEqual(candidateDigest, configuredAdminPassDigest.digest);
}

/**
 * Timing-safe check whether a candidate password equals the publicly known
 * demo credential. Used by the login route to reject the public demo password
 * in production environments where the demo admin is not enabled — without a
 * comparison-time oracle and without touching stored credentials.
 */
export function equalsPublicDemoPassword(candidate: string): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const candidateDigest = createHash('sha256').update(candidate).digest();
  return timingSafeEqual(candidateDigest, DEMO_PASS_DIGEST);
}
