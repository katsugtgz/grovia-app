import { Database } from 'bun:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { resetLoginAttemptTracker } from '@/lib/login-rate-limit';
import { clearRevokedSessionTokens } from '@/lib/auth-edge';
import { closeDb, initSchema } from '@/lib/db';
import { resolveAdminEmail, resolveAdminPassword } from './admin-env';

const DEFAULT_TEST_DB_PATH = path.join(os.tmpdir(), `grovia-test-suite-${process.pid}.db`);
let defaultTestDbCleanupRegistered = false;

export function cleanupDefaultTestDbFiles(): void {
  const hasAnyFile = ['', '-wal', '-shm'].some((suffix) =>
    fs.existsSync(`${DEFAULT_TEST_DB_PATH}${suffix}`)
  );
  if (!hasAnyFile) return;

  try {
    closeDb();
  } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${DEFAULT_TEST_DB_PATH}${suffix}`;
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch {}
  }
}

function registerDefaultTestDbCleanup(): void {
  if (defaultTestDbCleanupRegistered) return;
  defaultTestDbCleanupRegistered = true;
  process.once('beforeExit', cleanupDefaultTestDbFiles);
  process.once('exit', cleanupDefaultTestDbFiles);
}

export class RouteNotFoundError extends Error {
  public routePath: string;
  constructor(routePath: string) {
    super(`Route handler not found: ${routePath}`);
    this.name = 'RouteNotFoundError';
    this.routePath = routePath;
  }
}

function findRouteFile(rootDir: string, relBasePath: string): string | null {
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  for (const ext of extensions) {
    const full = path.resolve(rootDir, `${relBasePath}${ext}`);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return null;
}

export interface TestResponse<T = any> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
  raw: Response;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  direct?: boolean;
  skipAuth?: boolean;
}

export interface TestClientOptions {
  directOnly?: boolean;
}

export class TestClient {
  private baseUrl: string | null;
  private cookies: Map<string, string> = new Map();

  constructor(baseUrl?: string, options?: TestClientOptions) {
    this.baseUrl = options?.directOnly ? null : baseUrl || process.env.E2E_BASE_URL || null;
  }

  clearAuth(): void {
    this.cookies.clear();
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  async login(email: string, password: string): Promise<TestResponse> {
    return this.post('/api/auth/login', { email, password });
  }

  async loginAsAdmin(): Promise<TestResponse> {
    const email = resolveAdminEmail();
    const password = resolveAdminPassword();
    if (!password) {
      throw new Error('Set ADMIN_PASSWORD to use loginAsAdmin when demo admin access is disabled.');
    }
    const res = await this.login(email, password);
    if (res.status !== 200) {
      throw new Error(`loginAsAdmin failed (${res.status}): ${JSON.stringify(res.data)}`);
    }
    return res;
  }

  async logout(): Promise<TestResponse> {
    const res = await this.post('/api/auth/logout');
    this.clearAuth();
    return res;
  }

  private applyCookies(headers: Headers, skipAuth?: boolean): void {
    if (skipAuth || headers.has('cookie') || this.cookies.size === 0) {
      return;
    }
    const serialized = Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (serialized) {
      headers.set('cookie', serialized);
    }
  }

  private captureSetCookies(headers: Headers): void {
    const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
    const rawHeaders: string[] =
      typeof getSetCookie === 'function'
        ? getSetCookie.call(headers)
        : headers.get('set-cookie')
          ? [headers.get('set-cookie') as string]
          : [];

    for (const header of rawHeaders) {
      if (!header) continue;
      const parts = header.split(';').map((p) => p.trim());
      const nameValue = parts[0];
      if (!nameValue) continue;
      const eqIdx = nameValue.indexOf('=');
      if (eqIdx <= 0) continue;
      const name = nameValue.slice(0, eqIdx).trim();
      const value = nameValue.slice(eqIdx + 1).trim();

      let shouldDelete = value.length === 0;
      for (const attr of parts.slice(1)) {
        const lower = attr.toLowerCase();
        if (lower.startsWith('max-age=')) {
          const maxAge = Number(lower.slice('max-age='.length).trim());
          if (!Number.isNaN(maxAge) && maxAge <= 0) {
            shouldDelete = true;
          }
        } else if (lower.startsWith('expires=')) {
          const expiresAt = Date.parse(attr.slice('expires='.length).trim());
          if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
            shouldDelete = true;
          }
        }
      }

      if (shouldDelete) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  async get<T = any>(endpoint: string, options?: RequestOptions): Promise<TestResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, options);
  }

  async post<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<TestResponse<T>> {
    return this.request<T>('POST', endpoint, body, options);
  }

  async patch<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<TestResponse<T>> {
    return this.request<T>('PATCH', endpoint, body, options);
  }

  async delete<T = any>(endpoint: string, options?: RequestOptions): Promise<TestResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, options);
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<TestResponse<T>> {
    const isDirect = options.direct || !this.baseUrl;

    if (!isDirect && this.baseUrl) {
      return this.fetchHttp<T>(method, endpoint, body, options);
    } else {
      return this.invokeRouteHandler<T>(method, endpoint, body, options);
    }
  }

  private async fetchHttp<T>(
    method: string,
    endpoint: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<TestResponse<T>> {
    const url = new URL(endpoint, this.baseUrl!);
    const headers = new Headers(options.headers || {});
    this.applyCookies(headers, options.skipAuth);

    let reqBody: string | undefined = undefined;
    if (body !== undefined) {
      if (typeof body === 'string') {
        reqBody = body;
      } else {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        reqBody = JSON.stringify(body);
      }
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: reqBody,
      });

      return await this.parseResponse<T>(res);
    } catch (err: any) {
      return {
        status: 503,
        ok: false,
        headers: new Headers(),
        data: { error: `Fetch connection failure: ${err.message}` } as any,
        raw: new Response('Service Unavailable', { status: 503 }),
      };
    }
  }

  private async invokeRouteHandler<T>(
    method: string,
    endpoint: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<TestResponse<T>> {
    const urlObj = new URL(endpoint, 'http://localhost:3000');
    const pathname = urlObj.pathname;

    let handlerModule: any;
    let routeParams: Record<string, string> = {};

    try {
      const resolved = await this.resolveRoute(pathname);
      handlerModule = resolved.handler;
      routeParams = resolved.routeParams;
    } catch (err: any) {
      if (err instanceof RouteNotFoundError || err?.name === 'RouteNotFoundError') {
        const errorMsg = `Route handler not found: ${err.routePath}`;
        return {
          status: 404,
          ok: false,
          headers: new Headers(),
          data: { error: errorMsg } as any,
          raw: new Response(errorMsg, { status: 404 }),
        };
      }
      return {
        status: 500,
        ok: false,
        headers: new Headers(),
        data: { error: `Handler resolution error: ${err.message}` } as any,
        raw: new Response(err.message, { status: 500 }),
      };
    }

    const headers = new Headers(options.headers || {});
    this.applyCookies(headers, options.skipAuth);
    let reqBody: string | undefined = undefined;
    if (body !== undefined) {
      if (typeof body === 'string') {
        reqBody = body;
      } else {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        reqBody = JSON.stringify(body);
      }
    }

    const req = new Request(urlObj.toString(), {
      method,
      headers,
      body: reqBody,
    });

    const routeFn = handlerModule[method];
    if (!routeFn || typeof routeFn !== 'function') {
      const allowedMethods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']
        .filter((m) => typeof handlerModule[m] === 'function');
      const resHeaders = new Headers();
      if (allowedMethods.length > 0) {
        resHeaders.set('Allow', allowedMethods.join(', '));
      }
      return {
        status: 405,
        ok: false,
        headers: resHeaders,
        data: { error: `Method ${method} Not Allowed on ${pathname}` } as any,
        raw: new Response('Method Not Allowed', { status: 405, headers: resHeaders }),
      };
    }

    // Next.js 15 route context: params is a Promise
    const context = {
      params: Promise.resolve({ ...routeParams, ...(options.params || {}) }),
    };

    try {
      const res: Response = await routeFn(req, context);
      return await this.parseResponse<T>(res);
    } catch (err: any) {
      return {
        status: 500,
        ok: false,
        headers: new Headers(),
        data: { error: err.message || 'Internal Server Error' } as any,
        raw: new Response(err.message, { status: 500 }),
      };
    }
  }

  private async resolveRoute(pathname: string): Promise<{ handler: any; routeParams: Record<string, string> }> {
    const rootDir = process.cwd();
    const cleanPath = pathname.replace(/\/+$/, '') || '/';

    const staticMap: Record<string, string> = {
      '/api/health': 'app/api/health/route',
      '/api/metrics': 'app/api/metrics/route',
      '/api/roi': 'app/api/roi/route',
      '/api/waitlist': 'app/api/waitlist/route',
      '/api/inquiries': 'app/api/inquiries/route',
      '/api/auth/login': 'app/api/auth/login/route',
      '/api/auth/logout': 'app/api/auth/logout/route',
      '/api/auth/session': 'app/api/auth/session/route',
      '/api/people': 'app/api/people/route',
    };

    if (staticMap[cleanPath]) {
      const relBase = staticMap[cleanPath];
      const routeFile = findRouteFile(rootDir, relBase);
      if (!routeFile) {
        throw new RouteNotFoundError(`${relBase}.ts`);
      }
      const mod = await import(routeFile);
      return { handler: mod, routeParams: {} };
    }

    const dynamicInquiriesMatch = cleanPath.match(/^\/api\/inquiries\/([^/]+)$/);
    if (dynamicInquiriesMatch) {
      const id = decodeURIComponent(dynamicInquiriesMatch[1]);
      const dynamicRel = 'app/api/inquiries/[id]/route';
      const rootRel = 'app/api/inquiries/route';
      const dynamicFile = findRouteFile(rootDir, dynamicRel);
      if (dynamicFile) {
        const mod = await import(dynamicFile);
        return { handler: mod, routeParams: { id } };
      }
      const rootFile = findRouteFile(rootDir, rootRel);
      if (rootFile) {
        const mod = await import(rootFile);
        return { handler: mod, routeParams: { id } };
      }
      throw new RouteNotFoundError(`${dynamicRel}.ts`);
    }

    // Any other arbitrary path:
    const relBase = `app${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}/route`;
    const routeFile = findRouteFile(rootDir, relBase);
    if (!routeFile) {
      throw new RouteNotFoundError(`${relBase}.ts`);
    }
    const mod = await import(routeFile);
    return { handler: mod, routeParams: {} };
  }

  private async parseResponse<T>(res: Response): Promise<TestResponse<T>> {
    this.captureSetCookies(res.headers);
    let data: any = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      try {
        data = await res.text();
      } catch {
        data = null;
      }
    }

    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      data: data as T,
      raw: res,
    };
  }
}

export const testClient = new TestClient();

export function createTestClient(baseUrl?: string, options?: TestClientOptions): TestClient {
  return new TestClient(baseUrl, options);
}

/**
 * DB helper for test isolation
 */
export function resetDatabase(dbPath?: string): void {
  resetLoginAttemptTracker();
  clearRevokedSessionTokens();

  let db: Database | null = null;
  try {
    const configuredTarget =
      dbPath ||
      process.env.DB_PATH ||
      process.env.DATABASE_PATH ||
      process.env.DATABASE_URL;
    const target = configuredTarget || DEFAULT_TEST_DB_PATH;
    if (!configuredTarget) {
      process.env.DB_PATH = target;
    }
    if (path.resolve(target) === path.resolve(DEFAULT_TEST_DB_PATH)) {
      registerDefaultTestDbCleanup();
    }

    const resolvedBaseName = path.basename(path.resolve(target)).toLowerCase();
    if (resolvedBaseName === 'grovia.db' && process.env.ALLOW_TEST_RESET_MAIN_DB !== '1') {
      throw new Error(
        `Refusing to reset primary database "${target}". Set DB_PATH to an isolated test database path or set ALLOW_TEST_RESET_MAIN_DB=1 explicitly.`
      );
    }

    db = new Database(target);
    const existingTables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('waitlist', 'inquiries', 'users', 'people')"
      )
      .all();
    const tableSet = new Set(existingTables.map((row) => row.name));

    if (tableSet.has('waitlist')) {
      db.run('DELETE FROM waitlist;');
    }
    if (tableSet.has('inquiries')) {
      db.run('DELETE FROM inquiries;');
    }
    if (tableSet.has('users')) {
      db.run('DELETE FROM users WHERE LOWER(email) != ?;', [resolveAdminEmail()]);
    }
    if (tableSet.has('people')) {
      db.run("DELETE FROM people WHERE id NOT IN ('0','1','2','3','4','5','6','7','8','9');");
    }
    initSchema(db);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('no such table')) {
      throw err;
    }
  } finally {
    try {
      db?.close();
    } catch {}
  }
}
