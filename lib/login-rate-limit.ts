/**
 * In-process login brute-force rate limiter for single-node / Bun deployments.
 * For multi-instance serverless deployments, layer an edge or shared Redis rate limiter in front.
 */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_LOGIN_ATTEMPTS = 10;
export const MAX_FAILED_IP_ATTEMPTS = 25;
export const MAX_LOGIN_ATTEMPT_BUCKETS = 2000;

/**
 * Upper bound on password verifications admitted concurrently across the
 * process. `crypto.scrypt` runs on the shared libuv threadpool (default size
 * 4), so unbounded concurrent verifications starve legitimate sign-ins (and
 * the rest of the app). Requests over this cap receive a fast 429 before any
 * scrypt work starts.
 */
export const MAX_CONCURRENT_PASSWORD_VERIFICATIONS = 8;

/** Retry-After hint (seconds) returned while the verification pool is saturated. */
export const PASSWORD_VERIFICATION_RETRY_AFTER_SEC = 2;

interface FailedLoginBucket {
  /**
   * Total outstanding units: every admitted request's pending reservation
   * plus every recorded failure. Buckets are deleted exactly when this
   * reaches 0.
   */
  count: number;
  resetAt: number;
  /** Reservations currently in flight against this bucket. */
  pending: number;
  /**
   * Monotonic id bumped every time this bucket is (re)created after expiry or
   * replacement; reservation handles record the generation they reserved so
   * finalization can never touch a newer bucket for the same key.
   */
  generation: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __grovia_login_attempts__: Map<string, FailedLoginBucket> | undefined;
}

function getLoginAttemptStore(): Map<string, FailedLoginBucket> {
  if (!globalThis.__grovia_login_attempts__) {
    globalThis.__grovia_login_attempts__ = new Map<string, FailedLoginBucket>();
  }
  return globalThis.__grovia_login_attempts__;
}

let inFlightPasswordVerifications = 0;
let nextBucketGeneration = 1;

/**
 * Identity-tracked reservation returned by `reserveLoginAttempt`. Pass the
 * admitted variant to `releaseLoginAttempt` /
 * `rollbackLoginAttemptReservation` so finalization only touches the buckets
 * this exact request reserved, never a bucket that was replaced after the
 * reservation's window expired.
 */
export type LoginAttemptReservation =
  | { limited: true; retryAfterSec: number }
  | {
      limited: false;
      retryAfterSec: 0;
      clientIp: string | null;
      email: string;
      /** Generation of the email bucket at reservation time. */
      emailGeneration: number;
      /** Generation of the IP bucket at reservation time, when an IP was present. */
      ipGeneration: number | null;
      /** Generation of the pair bucket at reservation time, when an IP was present. */
      pairGeneration: number | null;
    };

export type AdmittedLoginReservation = Extract<LoginAttemptReservation, { limited: false }>;

export function resetLoginAttemptTracker(): void {
  getLoginAttemptStore().clear();
  inFlightPasswordVerifications = 0;
}

export function getLoginAttemptBucketCount(): number {
  return getLoginAttemptStore().size;
}

/**
 * Reserves one of the bounded password-verification slots. Returns the slot
 * handle, or -1 when the pool is exhausted; callers must reject such requests
 * with 429 before starting scrypt. Pass the handle to
 * `releasePasswordVerificationSlot` on every completion path.
 */
export function reservePasswordVerificationSlot(): number {
  if (inFlightPasswordVerifications >= MAX_CONCURRENT_PASSWORD_VERIFICATIONS) {
    return -1;
  }
  inFlightPasswordVerifications += 1;
  return inFlightPasswordVerifications;
}

/**
 * Releases a previously reserved verification slot. Safe to call with -1 or
 * undefined; never drops the count below zero.
 */
export function releasePasswordVerificationSlot(handle?: number): void {
  if (handle === undefined || handle < 0) return;
  if (inFlightPasswordVerifications > 0) {
    inFlightPasswordVerifications -= 1;
  }
}

/**
 * Extracts client IP only when proxy headers are explicitly trusted (`TRUST_PROXY_HEADERS=1`).
 * Uses the rightmost X-Forwarded-For address (appended by the trusted reverse proxy) rather than
 * the client-spoofable leftmost entry. Returns null when no trusted IP is available so callers
 * avoid collapsing unrelated clients into a shared fallback bucket.
 */
export function extractClientIp(request: Request): string | null {
  if (process.env.TRUST_PROXY_HEADERS !== '1') {
    return null;
  }
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return null;
}

function isBucketRateLimited(
  key: string,
  maxAttempts: number,
  now: number
): { limited: boolean; retryAfterSec: number } {
  const store = getLoginAttemptStore();
  const entry = store.get(key);
  if (!entry) return { limited: false, retryAfterSec: 0 };
  if (now >= entry.resetAt) {
    store.delete(key);
    return { limited: false, retryAfterSec: 0 };
  }
  if (entry.count >= maxAttempts) {
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { limited: false, retryAfterSec: 0 };
}

function evictLowestCountBucket(
  store: Map<string, FailedLoginBucket>,
  protectedKeys: ReadonlySet<string>
): void {
  let victimKey: string | undefined;
  let lowestCount = Number.POSITIVE_INFINITY;
  for (const [k, v] of store.entries()) {
    if (protectedKeys.has(k)) continue;
    if (v.count < lowestCount) {
      lowestCount = v.count;
      victimKey = k;
      if (lowestCount <= 1) {
        break;
      }
    }
  }
  if (victimKey !== undefined) {
    store.delete(victimKey);
  }
}

function incrementBucket(
  key: string,
  now: number,
  maxBuckets: number,
  protectedKeys: ReadonlySet<string>
): number {
  const store = getLoginAttemptStore();
  if (store.size > 500 || store.size >= maxBuckets) {
    for (const [k, v] of store.entries()) {
      if (now >= v.resetAt) store.delete(k);
    }
  }
  const existing = store.get(key);
  if (!existing) {
    if (store.size >= maxBuckets) {
      evictLowestCountBucket(store, protectedKeys);
    }
    const bucket: FailedLoginBucket = {
      count: 1,
      resetAt: now + LOGIN_WINDOW_MS,
      generation: nextBucketGeneration,
      pending: 1,
    };
    nextBucketGeneration += 1;
    store.set(key, bucket);
    return bucket.generation;
  }
  if (now >= existing.resetAt) {
    existing.count = 1;
    existing.resetAt = now + LOGIN_WINDOW_MS;
    existing.generation = nextBucketGeneration;
    existing.pending = 1;
    nextBucketGeneration += 1;
    return existing.generation;
  }
  existing.count += 1;
  existing.pending += 1;
  return existing.generation;
}

/**
 * Reserves one attempt per active identity bucket BEFORE awaiting async
 * password verification, preventing concurrent bursts from bypassing
 * thresholds while scrypt runs. Returns an identity handle: finalization must
 * use the handle-taking `releaseLoginAttempt` /
 * `rollbackLoginAttemptReservation`.
 */
export function reserveLoginAttempt(
  clientIp: string | null,
  email: string,
  now: number = Date.now(),
  maxBuckets: number = MAX_LOGIN_ATTEMPT_BUCKETS
): LoginAttemptReservation {
  const emailKey = `email:${email}`;
  const ipKey = clientIp ? `ip:${clientIp}` : null;
  const pairKey = clientIp ? `pair:${clientIp}:${email}` : null;

  const checks = [
    isBucketRateLimited(emailKey, MAX_FAILED_LOGIN_ATTEMPTS, now),
    ...(ipKey && pairKey
      ? [
          isBucketRateLimited(ipKey, MAX_FAILED_IP_ATTEMPTS, now),
          isBucketRateLimited(pairKey, MAX_FAILED_LOGIN_ATTEMPTS, now),
        ]
      : []),
  ];

  let maxRetry = 0;
  for (const check of checks) {
    if (check.limited && check.retryAfterSec > maxRetry) {
      maxRetry = check.retryAfterSec;
    }
  }
  if (maxRetry > 0) {
    return { limited: true, retryAfterSec: maxRetry };
  }

  const protectedKeys = new Set<string>([
    emailKey,
    ...(ipKey ? [ipKey] : []),
    ...(pairKey ? [pairKey] : []),
  ]);

  const emailGeneration = incrementBucket(emailKey, now, maxBuckets, protectedKeys);
  let ipGeneration: number | null = null;
  let pairGeneration: number | null = null;
  if (ipKey && pairKey) {
    ipGeneration = incrementBucket(ipKey, now, maxBuckets, protectedKeys);
    pairGeneration = incrementBucket(pairKey, now, maxBuckets, protectedKeys);
  }
  return {
    limited: false,
    retryAfterSec: 0,
    clientIp,
    email,
    emailGeneration,
    ipGeneration,
    pairGeneration,
  };
}

/**
 * Finalizes one pending reservation against its bucket if that exact bucket
 * generation is still current.
 *
 * Invariant: `count === pending + recordedFailures`. Every finalization
 * decrements `pending` first. Then:
 * - `fail` (rejected credentials): count unchanged — the attempt stays
 *   recorded for the window;
 * - `rollback` (internal error): the request's own unit is removed;
 * - `clear` (success, email/pair): all remaining units are forgiven
 *   (`count = pending` — still-pending requests keep their hold);
 * - `rollback` used for IP success: removes only this request's unit.
 *
 * A bucket is deleted exactly when `count` reaches 0.
 */
function finalizePending(
  store: Map<string, FailedLoginBucket>,
  key: string,
  generation: number | null,
  mode: 'clear' | 'rollback' | 'fail'
): void {
  if (generation === null) return;
  const bucket = store.get(key);
  if (!bucket || bucket.generation !== generation) return;
  if (bucket.pending > 0) {
    bucket.pending -= 1;
  }
  if (mode === 'clear') {
    bucket.count = bucket.pending;
  } else if (mode === 'rollback' && bucket.count > 0) {
    bucket.count -= 1;
  }
  if (bucket.count <= 0) {
    store.delete(key);
  }
}

/**
 * Releases the reserved attempt on successful authentication: email/pair
 * buckets forgive all completed failures (`count = pending` — concurrent
 * requests keep their holds), the IP bucket rolls back only this request's
 * own unit. Stale (expired-and-replaced) buckets are left untouched.
 */
export function releaseLoginAttempt(reservation: AdmittedLoginReservation): void {
  const store = getLoginAttemptStore();
  const { clientIp, email } = reservation;
  finalizePending(store, `email:${email}`, reservation.emailGeneration, 'clear');
  if (clientIp) {
    finalizePending(store, `pair:${clientIp}:${email}`, reservation.pairGeneration, 'clear');
    finalizePending(store, `ip:${clientIp}`, reservation.ipGeneration, 'rollback');
  }
}

/**
 * Finalizes a rejected-credentials reservation: the attempt stays recorded as
 * a failure for the window (throttling repeats) while the pending hold is
 * released. Stale (expired-and-replaced) reservations are left untouched.
 */
export function failLoginAttemptReservation(reservation: AdmittedLoginReservation): void {
  const store = getLoginAttemptStore();
  const { clientIp, email } = reservation;
  finalizePending(store, `email:${email}`, reservation.emailGeneration, 'fail');
  if (clientIp) {
    finalizePending(store, `ip:${clientIp}`, reservation.ipGeneration, 'fail');
    finalizePending(store, `pair:${clientIp}:${email}`, reservation.pairGeneration, 'fail');
  }
}

/**
 * Rolls back the single attempt this reservation reserved when an internal
 * error occurs before credentials could be verified. A no-op when the
 * reservation's bucket has expired and been replaced meanwhile — that would
 * otherwise delete another request's only recorded attempt.
 */
export function rollbackLoginAttemptReservation(reservation: AdmittedLoginReservation): void {
  const store = getLoginAttemptStore();
  const { clientIp, email } = reservation;
  finalizePending(store, `email:${email}`, reservation.emailGeneration, 'rollback');
  if (clientIp) {
    finalizePending(store, `ip:${clientIp}`, reservation.ipGeneration, 'rollback');
    finalizePending(store, `pair:${clientIp}:${email}`, reservation.pairGeneration, 'rollback');
  }
}
