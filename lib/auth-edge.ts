export const SESSION_COOKIE_NAME = 'grovia_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 86400s (24h)
export const DEFAULT_AUTH_REDIRECT = '/workspace';

const DEV_FALLBACK_SECRET = 'grovia-dev-fallback-session-secret-change-in-prod-2026';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface SessionPayload extends SessionUser {
  iat: number;
  exp: number;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

let cachedSecret: string | null = null;
let cachedKeyPromise: Promise<CryptoKey> | null = null;

declare global {
  // eslint-disable-next-line no-var
  var __grovia_revoked_tokens__: Map<string, number> | undefined;
}

function getRevokedTokensMap(): Map<string, number> {
  if (!globalThis.__grovia_revoked_tokens__) {
    globalThis.__grovia_revoked_tokens__ = new Map<string, number>();
  }
  return globalThis.__grovia_revoked_tokens__;
}

function pruneRevokedTokens(nowSec: number): void {
  const store = getRevokedTokensMap();
  if (store.size < 64) return;
  for (const [tok, exp] of store.entries()) {
    if (exp <= nowSec) {
      store.delete(tok);
    }
  }
}

export function revokeSessionToken(token: string | null | undefined): void {
  if (!token || typeof token !== 'string') return;
  const nowSec = Math.floor(Date.now() / 1000);
  pruneRevokedTokens(nowSec);
  getRevokedTokensMap().set(token, nowSec + SESSION_MAX_AGE_SECONDS);
}

export function unrevokeSessionToken(token: string | null | undefined): void {
  if (!token || typeof token !== 'string') return;
  getRevokedTokensMap().delete(token);
}

export function clearRevokedSessionTokens(): void {
  getRevokedTokensMap().clear();
}

function isSessionTokenRevoked(token: string, nowSec: number): boolean {
  const store = getRevokedTokensMap();
  const exp = store.get(token);
  if (exp === undefined) return false;
  if (exp <= nowSec) {
    store.delete(token);
    return false;
  }
  return true;
}

function resolveAuthSecret(): string {
  if (typeof process !== 'undefined' && process.env) {
    const authSecret = process.env.AUTH_SECRET;
    if (authSecret && authSecret.trim().length > 0) {
      return authSecret;
    }
    const sessionSecret = process.env.SESSION_SECRET;
    if (sessionSecret && sessionSecret.trim().length > 0) {
      return sessionSecret;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET or SESSION_SECRET must be configured in production');
    }
  }
  return DEV_FALLBACK_SECRET;
}

function toArrayBufferBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(input.byteLength));
  out.set(input);
  return out;
}

function getSigningKey(): Promise<CryptoKey> {
  const secret = resolveAuthSecret();
  if (cachedKeyPromise && cachedSecret === secret) {
    return cachedKeyPromise;
  }
  const keyBytes = toArrayBufferBytes(textEncoder.encode(secret));
  cachedSecret = secret;
  cachedKeyPromise = globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return cachedKeyPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array<ArrayBuffer> | null {
  if (!input || !/^[A-Za-z0-9_-]+$/.test(input) || input.length % 4 === 1) {
    return null;
  }
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (toBase64Url(bytes) !== input) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function signSessionToken(
  user: SessionUser,
  ttlSeconds: number = SESSION_MAX_AGE_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadB64 = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await getSigningKey();
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    toArrayBufferBytes(textEncoder.encode(payloadB64))
  );
  const sigB64 = toBase64Url(new Uint8Array(signature));
  const signedToken = `${payloadB64}.${sigB64}`;
  unrevokeSessionToken(signedToken);
  return signedToken;
}

export async function verifySessionToken(
  token: string | null | undefined
): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0 || dotIndex !== token.lastIndexOf('.')) return null;

  const payloadB64 = token.slice(0, dotIndex);
  const sigB64 = token.slice(dotIndex + 1);
  if (!payloadB64 || !sigB64) return null;

  const sigBytes = fromBase64Url(sigB64);
  if (!sigBytes || sigBytes.byteLength !== 32) return null;

  try {
    const key = await getSigningKey();
    const isValid = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      toArrayBufferBytes(textEncoder.encode(payloadB64))
    );
    if (!isValid) return null;

    const payloadBytes = fromBase64Url(payloadB64);
    if (!payloadBytes) return null;

    const parsed = JSON.parse(textDecoder.decode(payloadBytes)) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const { id, email, name, role, iat, exp } = parsed;
    if (
      typeof id !== 'number' ||
      !Number.isFinite(id) ||
      typeof email !== 'string' ||
      email.length === 0 ||
      typeof name !== 'string' ||
      typeof role !== 'string' ||
      role.length === 0 ||
      typeof iat !== 'number' ||
      !Number.isFinite(iat) ||
      typeof exp !== 'number' ||
      !Number.isFinite(exp)
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) return null;
    if (isSessionTokenRevoked(token, now)) return null;

    return { id, email, name, role, iat, exp };
  } catch {
    return null;
  }
}

export function parseCookieValue(
  cookieHeader: string | null | undefined,
  name: string
): string | null {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx <= 0) continue;
    const rawName = pair.slice(0, eqIdx).trim();
    if (rawName !== name) continue;
    const rawVal = pair.slice(eqIdx + 1).trim();
    if (!rawVal) return null;
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return null;
}

export function isHttpsRequest(request: Request): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    const primaryProto = forwardedProto.split(',')[0]?.trim().toLowerCase();
    if (primaryProto === 'https') return true;
    if (primaryProto === 'http') return false;
  }
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

const MAX_NEXT_DECODE_PASSES = 3;

function isUnsafeNextCandidate(candidate: string): boolean {
  if (!candidate || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return true;
  }
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.startsWith('/\\') ||
    candidate.includes('\\') ||
    /^\/%2f/i.test(candidate) ||
    /%2f%2f/i.test(candidate) ||
    /%5c/i.test(candidate)
  ) {
    return true;
  }
  return false;
}

function isLoginRoutePathname(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return normalized === '/login' || normalized.startsWith('/login/');
}

export function sanitizeNextPath(
  nextPath: unknown,
  fallback: string = DEFAULT_AUTH_REDIRECT
): string {
  if (typeof nextPath !== 'string') return fallback;
  const trimmed = nextPath.trim();
  if (isUnsafeNextCandidate(trimmed)) {
    return fallback;
  }

  let current = trimmed;
  let stabilized = false;
  for (let pass = 0; pass < MAX_NEXT_DECODE_PASSES; pass += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return fallback;
    }
    if (isUnsafeNextCandidate(decoded)) {
      return fallback;
    }
    if (decoded === current) {
      stabilized = true;
      break;
    }
    current = decoded;
  }

  if (!stabilized) {
    try {
      if (decodeURIComponent(current) !== current) {
        return fallback;
      }
    } catch {
      return fallback;
    }
  }

  try {
    const parsed = new URL(trimmed, 'http://grovia.local');
    if (parsed.origin !== 'http://grovia.local') return fallback;
    if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return fallback;
    if (isLoginRoutePathname(parsed.pathname)) return fallback;

    const parsedDecoded = new URL(current, 'http://grovia.local');
    if (parsedDecoded.origin !== 'http://grovia.local') return fallback;
    if (!parsedDecoded.pathname.startsWith('/') || parsedDecoded.pathname.startsWith('//')) {
      return fallback;
    }
    if (isLoginRoutePathname(parsedDecoded.pathname)) return fallback;

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export const getSafeRedirectTarget = sanitizeNextPath;
