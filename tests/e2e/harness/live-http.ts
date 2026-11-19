import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export interface StoredCookie {
  name: string;
  value: string;
  path: string;
  maxAge?: number;
  expiresAt?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
  raw: string;
}

const SET_COOKIE_SPLIT_REGEX = /,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/;

const BUILD_WATCH_TARGETS = [
  'app',
  'components',
  'lib',
  'middleware.ts',
  'next.config.ts',
  'package.json',
  'bun.lock',
] as const;

let buildPromise: Promise<void> | null = null;

function extractSetCookieHeaders(headers: Headers): string[] {
  const candidate = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof candidate.getSetCookie === 'function') {
    const list = candidate.getSetCookie();
    if (list.length > 0) {
      return list;
    }
  }

  const rawHeader = headers.get('set-cookie');
  if (!rawHeader) {
    return [];
  }

  return rawHeader
    .split(SET_COOKIE_SPLIT_REGEX)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseSetCookie(rawCookie: string): StoredCookie | null {
  const segments = rawCookie
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return null;
  }

  const firstSeg = segments[0];
  const eqIdx = firstSeg.indexOf('=');
  if (eqIdx <= 0) {
    return null;
  }

  const name = firstSeg.slice(0, eqIdx).trim();
  const value = firstSeg.slice(eqIdx + 1).trim();
  if (!name) {
    return null;
  }

  let cookiePath = '/';
  let maxAge: number | undefined;
  let expiresAt: number | undefined;
  let hasMaxAge = false;
  let httpOnly = false;
  let secure = false;
  let sameSite: string | undefined;

  for (const segment of segments.slice(1)) {
    const attrEq = segment.indexOf('=');
    const attrName = (attrEq === -1 ? segment : segment.slice(0, attrEq)).trim().toLowerCase();
    const attrValue = attrEq === -1 ? '' : segment.slice(attrEq + 1).trim();

    switch (attrName) {
      case 'path':
        cookiePath = attrValue.startsWith('/') ? attrValue : '/';
        break;
      case 'max-age':
        if (/^-?\d+$/.test(attrValue)) {
          const parsedMaxAge = Number.parseInt(attrValue, 10);
          maxAge = parsedMaxAge;
          hasMaxAge = true;
          expiresAt = parsedMaxAge <= 0 ? 0 : Date.now() + parsedMaxAge * 1000;
        }
        break;
      case 'expires':
        if (!hasMaxAge && attrValue.length > 0) {
          const parsedDate = Date.parse(attrValue);
          if (!Number.isNaN(parsedDate)) {
            expiresAt = parsedDate;
          }
        }
        break;
      case 'httponly':
        httpOnly = true;
        break;
      case 'secure':
        secure = true;
        break;
      case 'samesite':
        if (attrValue.length > 0) {
          sameSite = attrValue;
        }
        break;
      default:
        break;
    }
  }

  return {
    name,
    value,
    path: cookiePath,
    maxAge,
    expiresAt,
    httpOnly,
    secure,
    sameSite,
    raw: rawCookie,
  };
}

function isExpiredCookie(cookie: StoredCookie, now = Date.now()): boolean {
  if (cookie.maxAge !== undefined && cookie.maxAge <= 0) {
    return true;
  }
  if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
    return true;
  }
  return false;
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) {
    return true;
  }
  if (!requestPath.startsWith(cookiePath)) {
    return false;
  }
  return cookiePath.endsWith('/') || requestPath.charAt(cookiePath.length) === '/';
}

function resolveTargetUrl(targetUrl: string | URL): URL {
  if (targetUrl instanceof URL) {
    return targetUrl;
  }
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    return new URL(targetUrl);
  }
  return new URL(targetUrl, 'http://127.0.0.1');
}

export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>();

  private makeKey(name: string, cookiePath: string): string {
    return `${name}\0${cookiePath}`;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, cookie] of this.cookies.entries()) {
      if (isExpiredCookie(cookie, now)) {
        this.cookies.delete(key);
      }
    }
  }

  captureFromResponse(res: Response): void {
    const rawHeaders = extractSetCookieHeaders(res.headers);
    const now = Date.now();

    for (const rawHeader of rawHeaders) {
      const parsed = parseSetCookie(rawHeader);
      if (!parsed) {
        continue;
      }

      const key = this.makeKey(parsed.name, parsed.path);
      if (isExpiredCookie(parsed, now)) {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, parsed);
      }
    }
  }

  getCookieHeader(targetUrl: string | URL): string {
    this.pruneExpired();
    const url = resolveTargetUrl(targetUrl);
    const requestPath = url.pathname || '/';
    const matched: StoredCookie[] = [];

    for (const cookie of this.cookies.values()) {
      if (cookie.secure && url.protocol !== 'https:') {
        continue;
      }
      if (!pathMatches(requestPath, cookie.path)) {
        continue;
      }
      matched.push(cookie);
    }

    matched.sort((a, b) => b.path.length - a.path.length);
    return matched.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  }

  get(name: string): StoredCookie | undefined {
    this.pruneExpired();
    const rootCookie = this.cookies.get(this.makeKey(name, '/'));
    if (rootCookie) {
      return rootCookie;
    }

    for (const cookie of this.cookies.values()) {
      if (cookie.name === name) {
        return cookie;
      }
    }
    return undefined;
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  delete(name: string): void {
    for (const [key, cookie] of this.cookies.entries()) {
      if (cookie.name === name) {
        this.cookies.delete(key);
      }
    }
  }

  clear(): void {
    this.cookies.clear();
  }

  entries(): StoredCookie[] {
    this.pruneExpired();
    return Array.from(this.cookies.values());
  }
}

export interface LiveRequestOptions {
  headers?: Record<string, string>;
  redirect?: RequestRedirect;
  signal?: AbortSignal;
}

export interface LiveHttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  location: string | null;
  setCookies: string[];
  data: T;
  text: string;
  raw: Response;
}

function isBodyInitLike(
  value: unknown
): value is string | Uint8Array | ArrayBuffer | URLSearchParams | FormData | Blob {
  return (
    typeof value === 'string' ||
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer ||
    value instanceof URLSearchParams ||
    value instanceof FormData ||
    value instanceof Blob
  );
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * Checks whether a redirect URL shares the configured server's origin.
 * Allows Next.js loopback canonicalization (127.0.0.1 <-> localhost) only when
 * both target and expected baseUrl are loopback hosts on the exact same protocol & port.
 */
export function isSameServerOrigin(target: URL, baseUrl: string): boolean {
  const expected = new URL(baseUrl);
  if (target.origin === expected.origin) {
    return true;
  }
  return (
    target.protocol === expected.protocol &&
    target.port === expected.port &&
    LOOPBACK_HOSTS.has(target.hostname) &&
    LOOPBACK_HOSTS.has(expected.hostname)
  );
}

export class LiveHttpClient {
  readonly baseUrl: string;
  readonly jar: CookieJar;

  constructor(baseUrl: string, jar?: CookieJar) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.jar = jar ?? new CookieJar();
  }

  async request<T = unknown>(
    method: string,
    endpoint: string,
    body?: unknown,
    options: LiveRequestOptions = {}
  ): Promise<LiveHttpResponse<T>> {
    const url = new URL(endpoint, `${this.baseUrl}/`);
    const headers = new Headers(options.headers);

    const hasExplicitCookieHeader =
      options.headers !== undefined &&
      Object.keys(options.headers).some((key) => key.toLowerCase() === 'cookie');

    if (!hasExplicitCookieHeader) {
      const cookieHeader = this.jar.getCookieHeader(url);
      if (cookieHeader.length > 0) {
        headers.set('Cookie', cookieHeader);
      }
    }

    let reqBody: BodyInit | undefined;
    if (body !== undefined) {
      if (isBodyInitLike(body)) {
        reqBody = body as BodyInit;
      } else {
        if (!headers.has('content-type')) {
          headers.set('Content-Type', 'application/json');
        }
        reqBody = JSON.stringify(body);
      }
    }

    const raw = await fetch(url.toString(), {
      method: method.toUpperCase(),
      headers,
      body: reqBody,
      redirect: options.redirect ?? 'manual',
      signal: options.signal,
    });

    this.jar.captureFromResponse(raw);

    const setCookies = extractSetCookieHeaders(raw.headers);
    const location = raw.headers.get('location');
    const text = await raw.text();
    const contentType = raw.headers.get('content-type') ?? '';

    let data: unknown = text;
    if (contentType.toLowerCase().includes('application/json')) {
      if (text.length > 0) {
        try {
          data = JSON.parse(text) as unknown;
        } catch {
          data = text;
        }
      } else {
        data = null;
      }
    }

    return {
      status: raw.status,
      ok: raw.ok,
      headers: raw.headers,
      location,
      setCookies,
      data: data as T,
      text,
      raw,
    };
  }

  async get<T = unknown>(endpoint: string, options?: LiveRequestOptions): Promise<LiveHttpResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, options);
  }

  async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: LiveRequestOptions
  ): Promise<LiveHttpResponse<T>> {
    return this.request<T>('POST', endpoint, body, options);
  }

  async patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: LiveRequestOptions
  ): Promise<LiveHttpResponse<T>> {
    return this.request<T>('PATCH', endpoint, body, options);
  }

  async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: LiveRequestOptions
  ): Promise<LiveHttpResponse<T>> {
    return this.request<T>('PUT', endpoint, body, options);
  }

  async delete<T = unknown>(endpoint: string, options?: LiveRequestOptions): Promise<LiveHttpResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, options);
  }

  async login<T = unknown>(
    email = 'admin@grovia.io',
    password = 'grovia-demo-2026'
  ): Promise<LiveHttpResponse<T>> {
    return this.post<T>('/api/auth/login', { email, password });
  }

  async logout<T = unknown>(): Promise<LiveHttpResponse<T>> {
    return this.post<T>('/api/auth/logout');
  }
}

export interface StartLiveServerOptions {
  mode?: 'auto' | 'start' | 'dev';
  host?: string;
  readyTimeoutMs?: number;
  buildTimeoutMs?: number;
  env?: Record<string, string>;
}

export interface LiveServerHandle {
  readonly baseUrl: string;
  readonly port: number;
  readonly dbPath: string;
  readonly external: boolean;
  readonly mode: 'external' | 'start' | 'dev';
  createClient(): LiveHttpClient;
  resetDb(): void;
  getLogs(): string;
  stop(): Promise<void>;
}

export async function getAvailablePort(host = '127.0.0.1'): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    server.on('error', (err: Error) => {
      reject(err);
    });

    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to acquire an ephemeral TCP port')));
        return;
      }

      const assignedPort = address.port;
      server.close((closeErr?: Error) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(assignedPort);
      });
    });
  });
}

export function createTempDbPath(prefix = 'grovia-e2e-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return path.join(dir, 'live.db');
}

export function cleanupTempDb(dbPath: string): void {
  if (!dbPath) {
    return;
  }

  const candidates = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors for transient SQLite files
    }
  }

  const parentDir = path.dirname(dbPath);
  const tmpRoot = path.resolve(os.tmpdir());
  if (
    parentDir !== tmpRoot &&
    parentDir.startsWith(`${tmpRoot}${path.sep}`) &&
    path.basename(parentDir).startsWith('grovia-e2e-')
  ) {
    try {
      const remaining = fs.readdirSync(parentDir);
      if (remaining.length === 0) {
        fs.rmdirSync(parentDir);
      }
    } catch {
      // Ignore directory cleanup errors
    }
  }
}

export function resetLiveDatabase(dbPath: string): void {
  if (!dbPath) {
    return;
  }

  let db: Database | undefined;
  try {
    db = new Database(dbPath);
    db.run('PRAGMA busy_timeout = 5000;');

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableSet = new Set(tables.map((row) => row.name));

    if (tableSet.has('waitlist')) {
      db.run('DELETE FROM waitlist;');
    }
    if (tableSet.has('inquiries')) {
      db.run('DELETE FROM inquiries;');
    }
    if (tableSet.has('people')) {
      db.run("DELETE FROM people WHERE LOWER(status) = 'invited';");
    }
    if (tableSet.has('users')) {
      db.run("DELETE FROM users WHERE LOWER(email) != 'admin@grovia.io';");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isExpectedSchemaOrOpenIssue =
      message.includes('no such table') ||
      message.includes('unable to open database') ||
      message.includes('SQLITE_CANTOPEN');
    if (!isExpectedSchemaOrOpenIssue) {
      throw err;
    }
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

class RingLogBuffer {
  private readonly maxLines: number;
  private readonly lines: string[] = [];

  constructor(maxLines = 200) {
    this.maxLines = maxLines;
  }

  pushChunk(prefix: string, chunk: string): void {
    const splitLines = chunk.split(/\r?\n/);
    for (const line of splitLines) {
      if (line.length === 0) {
        continue;
      }
      this.lines.push(`${prefix}${line}`);
      if (this.lines.length > this.maxLines) {
        this.lines.shift();
      }
    }
  }

  toString(): string {
    return this.lines.join('\n');
  }
}

interface StreamDrainHandle {
  done: Promise<void>;
  cancel: () => Promise<void>;
}

function drainStream(
  stream: ReadableStream<Uint8Array> | number | undefined,
  prefix: string,
  buffer: RingLogBuffer
): StreamDrainHandle {
  if (!stream || typeof stream === 'number') {
    return {
      done: Promise.resolve(),
      cancel: async () => {},
    };
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let cancelled = false;

  const done = (async () => {
    try {
      while (!cancelled) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) {
          const tail = decoder.decode();
          if (tail) {
            buffer.pushChunk(prefix, tail);
          }
          break;
        }
        if (value) {
          buffer.pushChunk(prefix, decoder.decode(value, { stream: true }));
        }
      }
    } catch {
      // Stream cancelled or closed during teardown
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Ignore release errors
      }
    }
  })();

  const cancel = async (): Promise<void> => {
    cancelled = true;
    try {
      await reader.cancel();
    } catch {
      // Ignore cancel errors
    }
  };

  return { done, cancel };
}

function getMaxMtimeMs(targetPath: string): number {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    return 0;
  }

  let maxMtime = stat.mtimeMs;
  if (!stat.isDirectory()) {
    return maxMtime;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(targetPath, { withFileTypes: true });
  } catch {
    return maxMtime;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
      continue;
    }
    const fullPath = path.join(targetPath, entry.name);
    const childMtime = getMaxMtimeMs(fullPath);
    if (childMtime > maxMtime) {
      maxMtime = childMtime;
    }
  }

  return maxMtime;
}

function isProductionBuildStale(rootDir: string): boolean {
  const buildIdPath = path.join(rootDir, '.next', 'BUILD_ID');
  if (!fs.existsSync(buildIdPath)) {
    return true;
  }

  let buildMtime = 0;
  try {
    buildMtime = fs.statSync(buildIdPath).mtimeMs;
  } catch {
    return true;
  }

  for (const relTarget of BUILD_WATCH_TARGETS) {
    const absTarget = path.join(rootDir, relTarget);
    if (getMaxMtimeMs(absTarget) > buildMtime) {
      return true;
    }
  }

  return false;
}

function buildChildEnv(
  dbPath: string,
  extraEnv?: Record<string, string>,
  overrides?: Record<string, string>
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (extraEnv) {
    Object.assign(env, extraEnv);
  }
  if (overrides) {
    Object.assign(env, overrides);
  }
  if (dbPath) {
    env.DB_PATH = dbPath;
    env.DATABASE_URL = dbPath;
    env.DATABASE_PATH = dbPath;
  }
  if (!env.AUTH_SECRET && !env.SESSION_SECRET) {
    env.AUTH_SECRET = 'grovia-e2e-live-test-secret-2026';
  }
  if (!env.ALLOW_DEMO_ADMIN) {
    env.ALLOW_DEMO_ADMIN = '1';
  }
  return env;
}

async function ensureProductionBuild(
  rootDir: string,
  nextBin: string,
  dbPath: string,
  buildTimeoutMs: number,
  extraEnv?: Record<string, string>
): Promise<void> {
  if (process.env.E2E_SKIP_BUILD === '1') {
    return;
  }

  if (!isProductionBuildStale(rootDir)) {
    return;
  }

  if (!buildPromise) {
    buildPromise = (async () => {
      if (!isProductionBuildStale(rootDir)) {
        return;
      }

      const logBuffer = new RingLogBuffer(200);
      const proc = Bun.spawn(['bun', '--bun', nextBin, 'build'], {
        cwd: rootDir,
        env: buildChildEnv(dbPath, extraEnv, { NODE_ENV: 'production' }),
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const stdoutDrain = drainStream(proc.stdout, '[build:out] ', logBuffer);
      const stderrDrain = drainStream(proc.stderr, '[build:err] ', logBuffer);

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill('SIGTERM');
        } catch {
          // Ignore kill errors
        }
      }, buildTimeoutMs);

      try {
        const exitCode = await proc.exited;
        await Promise.allSettled([stdoutDrain.done, stderrDrain.done]);

        if (timedOut) {
          throw new Error(
            `Next.js production build timed out after ${buildTimeoutMs}ms.\n${logBuffer.toString()}`
          );
        }
        if (exitCode !== 0) {
          throw new Error(
            `Next.js production build failed with exit code ${exitCode}.\n${logBuffer.toString()}`
          );
        }
      } finally {
        clearTimeout(timer);
        await Promise.allSettled([stdoutDrain.cancel(), stderrDrain.cancel()]);
      }
    })().catch((err: unknown) => {
      buildPromise = null;
      throw err;
    });
  }

  await buildPromise;
}

function isHealthPayloadHealthy(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return record.status === 'ok' && record.database === 'healthy';
}

async function waitForHealth(
  baseUrl: string,
  timeoutMs: number,
  signal: AbortSignal
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${baseUrl.replace(/\/+$/, '')}/api/health`;
  let lastError = 'No response received';

  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new Error('Health poll aborted');
    }

    const attemptController = new AbortController();
    const remainingMs = Math.max(50, deadline - Date.now());
    const attemptTimer = setTimeout(() => {
      attemptController.abort(
        new Error(`Health check attempt timed out after ${remainingMs}ms`)
      );
    }, remainingMs);
    const onParentAbort = () => {
      attemptController.abort(signal.reason);
    };
    if (signal.aborted) {
      attemptController.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onParentAbort, { once: true });
    }

    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: attemptController.signal,
      });

      if (res.ok) {
        const payload = (await res.json()) as unknown;
        if (isHealthPayloadHealthy(payload)) {
          return;
        }
        lastError = `Unhealthy payload (${res.status}): ${JSON.stringify(payload)}`;
      } else {
        lastError = `HTTP ${res.status}`;
      }
    } catch (err: unknown) {
      if (signal.aborted) {
        throw new Error('Health poll aborted');
      }
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(attemptTimer);
      signal.removeEventListener('abort', onParentAbort);
    }

    await new Promise<void>((resolve) => {
      const stepTimer = setTimeout(resolve, 100);
      if (signal.aborted) {
        clearTimeout(stepTimer);
        resolve();
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(stepTimer);
          resolve();
        },
        { once: true }
      );
    });
  }

  throw new Error(`Timed out waiting for ${healthUrl} after ${timeoutMs}ms (${lastError})`);
}

async function terminateProcess(
  proc: ReturnType<typeof Bun.spawn>,
  stdoutDrain: StreamDrainHandle,
  stderrDrain: StreamDrainHandle
): Promise<void> {
  try {
    proc.kill('SIGTERM');
  } catch {
    // Process may already be dead
  }

  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    killTimer = setTimeout(() => resolve('timeout'), 3000);
  });

  const exitedPromise = proc.exited.then(() => 'exited' as const);
  const outcome = await Promise.race([exitedPromise, timeoutPromise]);

  if (killTimer !== undefined) {
    clearTimeout(killTimer);
  }

  if (outcome === 'timeout') {
    try {
      proc.kill('SIGKILL');
    } catch {
      // Ignore kill errors
    }
    await proc.exited.catch(() => {});
  }

  await Promise.allSettled([stdoutDrain.cancel(), stderrDrain.cancel()]);
  await Promise.race([
    Promise.allSettled([stdoutDrain.done, stderrDrain.done]),
    new Promise<void>((resolve) => setTimeout(resolve, 250)),
  ]);
}

function parsePortFromUrl(urlStr: string): number {
  const parsed = new URL(urlStr);
  if (parsed.port) {
    return Number.parseInt(parsed.port, 10);
  }
  return parsed.protocol === 'https:' ? 443 : 80;
}

export async function startLiveServer(
  options: StartLiveServerOptions = {}
): Promise<LiveServerHandle> {
  const host = options.host ?? '127.0.0.1';
  const readyTimeoutMs = options.readyTimeoutMs ?? 30_000;
  const buildTimeoutMs = options.buildTimeoutMs ?? 120_000;

  const externalBaseUrl = process.env.E2E_BASE_URL?.trim();
  if (externalBaseUrl) {
    const normalizedBaseUrl = externalBaseUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    await waitForHealth(normalizedBaseUrl, readyTimeoutMs, controller.signal);

    return {
      baseUrl: normalizedBaseUrl,
      port: parsePortFromUrl(normalizedBaseUrl),
      dbPath: '',
      external: true,
      mode: 'external',
      createClient: () => new LiveHttpClient(normalizedBaseUrl),
      resetDb: () => {},
      getLogs: () => '',
      stop: async () => {},
    };
  }

  const rootDir = process.cwd();
  const nextBin = path.resolve(rootDir, 'node_modules/next/dist/bin/next');
  const requestedMode =
    options.mode ?? (process.env.E2E_SERVER_MODE === 'dev' ? 'dev' : 'auto');
  const subcmd: 'start' | 'dev' = requestedMode === 'dev' ? 'dev' : 'start';

  const dbPath = createTempDbPath();

  try {
    if (subcmd === 'start') {
      await ensureProductionBuild(rootDir, nextBin, dbPath, buildTimeoutMs, options.env);
    }

    const maxAttempts = 3;
    let lastStartError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const port = await getAvailablePort(host);
      const baseUrl = `http://${host}:${port}`;
      const logBuffer = new RingLogBuffer(200);

      const childEnv = buildChildEnv(dbPath, options.env, {
        NODE_ENV: subcmd === 'start' ? 'production' : 'development',
        HOSTNAME: host,
      });

      const proc = Bun.spawn(['bun', '--bun', nextBin, subcmd, '-H', host, '-p', String(port)], {
        cwd: rootDir,
        env: childEnv,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const stdoutDrain = drainStream(proc.stdout, '[next:out] ', logBuffer);
      const stderrDrain = drainStream(proc.stderr, '[next:err] ', logBuffer);

      const emergencyKill = (): void => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignore kill errors on exit
        }
        cleanupTempDb(dbPath);
      };
      process.once('exit', emergencyKill);

      const pollController = new AbortController();

      try {
        const winner = await Promise.race([
          waitForHealth(baseUrl, readyTimeoutMs, pollController.signal).then(() => ({
            kind: 'ready' as const,
          })),
          proc.exited.then((code) => ({
            kind: 'exited' as const,
            code,
          })),
        ]);

        if (winner.kind === 'exited') {
          pollController.abort();
          process.off('exit', emergencyKill);
          await Promise.allSettled([stdoutDrain.cancel(), stderrDrain.cancel()]);
          await Promise.race([
            Promise.allSettled([stdoutDrain.done, stderrDrain.done]),
            new Promise<void>((resolve) => setTimeout(resolve, 250)),
          ]);

          const logs = logBuffer.toString();
          const err = new Error(
            `Next.js server exited prematurely with code ${winner.code} on ${baseUrl}.\n${logs}`
          );
          lastStartError = err;

          if (logs.includes('EADDRINUSE') && attempt < maxAttempts) {
            continue;
          }
          throw err;
        }

        let stopPromise: Promise<void> | null = null;

        return {
          baseUrl,
          port,
          dbPath,
          external: false,
          mode: subcmd,
          createClient: () => new LiveHttpClient(baseUrl),
          resetDb: () => resetLiveDatabase(dbPath),
          getLogs: () => logBuffer.toString(),
          stop: async () => {
            if (!stopPromise) {
              stopPromise = (async () => {
                process.off('exit', emergencyKill);
                await terminateProcess(proc, stdoutDrain, stderrDrain);
                cleanupTempDb(dbPath);
              })();
            }
            await stopPromise;
          },
        };
      } catch (err: unknown) {
        pollController.abort();
        process.off('exit', emergencyKill);
        await terminateProcess(proc, stdoutDrain, stderrDrain);
        lastStartError = err;

        const logs = logBuffer.toString();
        if (logs.includes('EADDRINUSE') && attempt < maxAttempts) {
          continue;
        }
        throw err;
      }
    }

    throw lastStartError instanceof Error
      ? lastStartError
      : new Error('Failed to start Next.js live server');
  } catch (err: unknown) {
    cleanupTempDb(dbPath);
    throw err;
  }
}
