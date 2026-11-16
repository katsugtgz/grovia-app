import { Database } from 'bun:sqlite';
import path from 'node:path';

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
}

export class TestClient {
  private baseUrl: string | null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.E2E_BASE_URL || null;
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
      return {
        status: 500,
        ok: false,
        headers: new Headers(),
        data: { error: `Handler resolution error: ${err.message}` } as any,
        raw: new Response(err.message, { status: 500 }),
      };
    }

    const headers = new Headers(options.headers || {});
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

    if (pathname === '/api/health') {
      const mod = await import(path.resolve(rootDir, 'app/api/health/route'));
      return { handler: mod, routeParams: {} };
    }
    if (pathname === '/api/metrics') {
      const mod = await import(path.resolve(rootDir, 'app/api/metrics/route'));
      return { handler: mod, routeParams: {} };
    }
    if (pathname === '/api/roi') {
      const mod = await import(path.resolve(rootDir, 'app/api/roi/route'));
      return { handler: mod, routeParams: {} };
    }
    if (pathname === '/api/waitlist') {
      const mod = await import(path.resolve(rootDir, 'app/api/waitlist/route'));
      return { handler: mod, routeParams: {} };
    }
    if (pathname === '/api/inquiries') {
      const mod = await import(path.resolve(rootDir, 'app/api/inquiries/route'));
      return { handler: mod, routeParams: {} };
    }

    const dynamicInquiriesMatch = pathname.match(/^\/api\/inquiries\/([^/]+)$/);
    if (dynamicInquiriesMatch) {
      const id = decodeURIComponent(dynamicInquiriesMatch[1]);
      try {
        const mod = await import(path.resolve(rootDir, 'app/api/inquiries/[id]/route'));
        return { handler: mod, routeParams: { id } };
      } catch {
        // Fallback: single route handler in /api/inquiries/route.ts handling routeParams
        const mod = await import(path.resolve(rootDir, 'app/api/inquiries/route'));
        return { handler: mod, routeParams: { id } };
      }
    }

    throw new Error(`[TestClient] Unknown route path: ${pathname}`);
  }

  private async parseResponse<T>(res: Response): Promise<TestResponse<T>> {
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

/**
 * DB helper for test isolation
 */
export function resetDatabase(dbPath?: string): void {
  try {
    const target = dbPath || process.env.DATABASE_URL || 'grovia.db';
    const db = new Database(target);
    db.run('DELETE FROM waitlist;');
    db.run('DELETE FROM inquiries;');
    db.close();
  } catch {
    // Database tables might not be created yet
  }
}
