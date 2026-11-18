import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createRandomEmail, fixtures } from '../../harness/fixtures';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';

interface WaitlistPostResponse {
  success: boolean;
  message: string;
  position: number;
}

const INITIAL_PEOPLE_NAMES = Array.from(
  { length: 10 },
  (_, index) => `Demo Person ${String(index + 1).padStart(2, '0')}`
);

const INITIAL_PEOPLE_EMAILS = Array.from(
  { length: 10 },
  (_, index) => `person${String(index + 1).padStart(2, '0')}@example.invalid`
);

const INITIAL_RATES = [38, 42, 45, 44, 47, 39, 40, 36, 43, 41];

function extractStaticScriptPaths(html: string): string[] {
  const paths = new Set<string>();
  const scriptTagRegex = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null = scriptTagRegex.exec(html);

  while (match !== null) {
    const src = match[1];
    if (src && (src.includes('/_next/static/') || src.endsWith('.js'))) {
      paths.add(src);
    }
    match = scriptTagRegex.exec(html);
  }

  return Array.from(paths);
}

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live server not initialized');
  }
  return server;
}

beforeAll(async () => {
  server = await startLiveServer();
}, 120_000);

afterAll(async () => {
  await server?.stop();
});

describe('Tier 1 — F1: Public Landing Page (/) & PII Exclusion', () => {
  test(
    'T1.v2.1.1: GET / (unauthenticated) returns 200 HTML with semantic <header> and <main> landmarks',
    async () => {
      const client = getServer().createClient();
      const res = await client.get<string>('/');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')?.toLowerCase()).toContain('text/html');
      expect(res.text).toMatch(/<header[\s>]/i);
      expect(res.text).toMatch(/<main[\s>]/i);
    },
    { timeout: 15_000 }
  );

  test(
    'T1.v2.1.2: GET / renders product pitch, pricing content, waitlist signup controls, and auth/workspace navigation',
    async () => {
      const client = getServer().createClient();
      const res = await client.get<string>('/');

      expect(res.status).toBe(200);
      expect(res.text.toLowerCase()).toContain('grovia');
      expect(res.text).toMatch(/pricing|starter|growth|enterprise|\$\d+/i);
      expect(res.text).toMatch(/waitlist/i);
      expect(res.text).toMatch(/type=["']email["']|name=["']email["']|placeholder=["'][^"']*email/i);
      expect(res.text).toContain('/login');
    },
    { timeout: 15_000 }
  );

  test(
    'T1.v2.1.3: GET / (authenticated) returns 200 and renders Landing Page with /workspace CTA',
    async () => {
      const client = getServer().createClient();
      const loginRes = await client.login();
      expect(loginRes.status).toBe(200);

      const res = await client.get<string>('/');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')?.toLowerCase()).toContain('text/html');
      expect(res.text.toLowerCase()).toContain('grovia');
      expect(res.text).toContain('/workspace');
    },
    { timeout: 15_000 }
  );

  test('T1.v2.1.4: Public POST /api/waitlist returns 201 JSON with queue position >= 1', async () => {
    const client = getServer().createClient();
    const email = createRandomEmail('landing_t1');
    const res = await client.post<WaitlistPostResponse>('/api/waitlist', {
      ...fixtures.waitlist.standard,
      email,
    });

    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
    expect(res.data.success).toBe(true);
    expect(res.data.message).toBe('Added to waitlist');
    expect(typeof res.data.position).toBe('number');
    expect(res.data.position).toBeGreaterThanOrEqual(1);
  });

  test(
    'T1.v2.1.5: GET / HTML contains zero INITIAL_PEOPLE names, .invalid emails, or hourly rate markers',
    async () => {
      const client = getServer().createClient();
      const res = await client.get<string>('/');

      expect(res.status).toBe(200);

      for (const name of INITIAL_PEOPLE_NAMES) {
        expect(res.text).not.toContain(name);
      }
      for (const email of INITIAL_PEOPLE_EMAILS) {
        expect(res.text).not.toContain(email);
      }
      for (const rate of INITIAL_RATES) {
        expect(res.text).not.toContain(`"rate":${rate}`);
      }
    },
    { timeout: 15_000 }
  );

  test(
    'T1.v2.1.6: Public /_next/static JS chunks referenced by GET / contain zero INITIAL_PEOPLE PII or payroll rates',
    async () => {
      const client = getServer().createClient();
      const htmlRes = await client.get<string>('/');
      expect(htmlRes.status).toBe(200);

      const scriptPaths = extractStaticScriptPaths(htmlRes.text);
      expect(scriptPaths.length).toBeGreaterThan(0);

      const chunkResponses = await Promise.all(
        scriptPaths.map(async (src) => {
          const assetRes = await client.get<string>(src);
          return { src, assetRes };
        })
      );

      for (const { assetRes } of chunkResponses) {
        expect(assetRes.status).toBe(200);

        for (const name of INITIAL_PEOPLE_NAMES) {
          expect(assetRes.text).not.toContain(name);
        }
        for (const email of INITIAL_PEOPLE_EMAILS) {
          expect(assetRes.text).not.toContain(email);
        }
        expect(assetRes.text).not.toContain('@example.invalid');
        for (const rate of INITIAL_RATES) {
          expect(assetRes.text).not.toContain(`"rate":${rate}`);
        }
      }
    },
    { timeout: 15_000 }
  );
});
