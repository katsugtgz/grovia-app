const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 10;
const MAX_FAILED_IP_ATTEMPTS = 25;
const MAX_LOGIN_ATTEMPT_BUCKETS = 2000;

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

export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'local';
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

export function isLoginRateLimited(
  clientIp: string,
  email: string,
  now: number
): { limited: boolean; retryAfterSec: number } {
  const checks = [
    isBucketRateLimited(`ip:${clientIp}`, MAX_FAILED_IP_ATTEMPTS, now),
    isBucketRateLimited(`email:${email}`, MAX_FAILED_LOGIN_ATTEMPTS, now),
    isBucketRateLimited(`pair:${clientIp}:${email}`, MAX_FAILED_LOGIN_ATTEMPTS, now),
  ];
  let maxRetry = 0;
  for (const check of checks) {
    if (check.limited && check.retryAfterSec > maxRetry) {
      maxRetry = check.retryAfterSec;
    }
  }
  return { limited: maxRetry > 0, retryAfterSec: maxRetry };
}

function recordBucketAttempt(key: string, now: number): void {
  const store = getLoginAttemptStore();
  if (store.size > 500) {
    for (const [k, v] of store.entries()) {
      if (now >= v.resetAt) store.delete(k);
    }
  }
  if (!store.has(key) && store.size >= MAX_LOGIN_ATTEMPT_BUCKETS) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) {
      store.delete(oldestKey);
    }
  }
  const existing = store.get(key);
  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

export function recordFailedLoginAttempt(clientIp: string, email: string, now: number): void {
  recordBucketAttempt(`ip:${clientIp}`, now);
  recordBucketAttempt(`email:${email}`, now);
  recordBucketAttempt(`pair:${clientIp}:${email}`, now);
}

export function clearFailedLoginAttempts(clientIp: string, email: string): void {
  const store = getLoginAttemptStore();
  store.delete(`email:${email}`);
  store.delete(`pair:${clientIp}:${email}`);
}
