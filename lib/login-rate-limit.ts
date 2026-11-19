/**
 * In-process login brute-force rate limiter for single-node / Bun deployments.
 * For multi-instance serverless deployments, layer an edge or shared Redis rate limiter in front.
 */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_LOGIN_ATTEMPTS = 10;
export const MAX_FAILED_IP_ATTEMPTS = 25;
export const MAX_LOGIN_ATTEMPT_BUCKETS = 2000;

interface FailedLoginBucket {
  count: number;
  resetAt: number;
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

export function resetLoginAttemptTracker(): void {
  getLoginAttemptStore().clear();
}

export function getLoginAttemptBucketCount(): number {
  return getLoginAttemptStore().size;
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

function evictLowestCountBucket(store: Map<string, FailedLoginBucket>): void {
  let victimKey: string | undefined;
  let lowestCount = Number.POSITIVE_INFINITY;
  for (const [k, v] of store.entries()) {
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

function incrementBucket(key: string, now: number, maxBuckets: number): void {
  const store = getLoginAttemptStore();
  if (store.size > 500 || store.size >= maxBuckets) {
    for (const [k, v] of store.entries()) {
      if (now >= v.resetAt) store.delete(k);
    }
  }
  if (!store.has(key) && store.size >= maxBuckets) {
    evictLowestCountBucket(store);
  }
  const existing = store.get(key);
  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

function decrementBucket(key: string): void {
  const store = getLoginAttemptStore();
  const existing = store.get(key);
  if (!existing) return;
  if (existing.count <= 1) {
    store.delete(key);
  } else {
    existing.count -= 1;
  }
}

/**
 * Atomically checks rate limits and reserves an attempt BEFORE awaiting async password
 * verification, preventing concurrent bursts from bypassing thresholds while scrypt runs.
 */
export function reserveLoginAttempt(
  clientIp: string | null,
  email: string,
  now: number = Date.now(),
  maxBuckets: number = MAX_LOGIN_ATTEMPT_BUCKETS
): { limited: boolean; retryAfterSec: number } {
  const checks = [
    isBucketRateLimited(`email:${email}`, MAX_FAILED_LOGIN_ATTEMPTS, now),
    ...(clientIp
      ? [
          isBucketRateLimited(`ip:${clientIp}`, MAX_FAILED_IP_ATTEMPTS, now),
          isBucketRateLimited(`pair:${clientIp}:${email}`, MAX_FAILED_LOGIN_ATTEMPTS, now),
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

  incrementBucket(`email:${email}`, now, maxBuckets);
  if (clientIp) {
    incrementBucket(`ip:${clientIp}`, now, maxBuckets);
    incrementBucket(`pair:${clientIp}:${email}`, now, maxBuckets);
  }
  return { limited: false, retryAfterSec: 0 };
}

/**
 * Releases the reserved attempt on successful authentication: clears the email/pair failure
 * buckets and rolls back the reserved IP-bucket increment.
 */
export function releaseLoginAttempt(clientIp: string | null, email: string): void {
  const store = getLoginAttemptStore();
  store.delete(`email:${email}`);
  if (clientIp) {
    store.delete(`pair:${clientIp}:${email}`);
    decrementBucket(`ip:${clientIp}`);
  }
}
