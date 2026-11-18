import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createRandomEmail, fixtures } from '../../harness/fixtures';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';

interface ErrorBody {
  success: boolean;
  error: string;
}

const INITIAL_PEOPLE_NAMES = Array.from(
  { length: 10 },
  (_, index) => `Demo Person ${String(index + 1).padStart(2, '0')}`
);

const INITIAL_PEOPLE_EMAILS = Array.from(
  { length: 10 },
  (_, index) => `person${String(index + 1).padStart(2, '0')}@example.invalid`
);

const SEEDED_WAITLIST_AND_INQUIRY_EMAILS = [
  'alex@innovate.io',
  'elena@quantum.tech',
  'marcus@hypergrowth.co',
  'sarah@vertex.io',
  'liam@finscale.org',
  'chloe@nexus.co',
];

const PAYROLL_AND_RATE_MARKERS = [
  '$4,850',
  'Payslip-09',
  'Contract.pdf',
  'Not provided (demo)',
  ...Array.from({ length: 10 }, (_, idx) => `"rate":${38 + idx}`),
  '"rate":36',
  '"rate":37',
];

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

describe('Tier 2 — F1 Boundaries: Landing PII Exclusion, Waitlist Validation & Public Method Guards', () => {
  test(
    'T2.v2.1.1: Unauthenticated GET / HTML contains zero INITIAL_PEOPLE names/emails and zero seeded waitlist/inquiry emails',
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
      for (const email of SEEDED_WAITLIST_AND_INQUIRY_EMAILS) {
        expect(res.text).not.toContain(email);
      }
    },
    { timeout: 15_000 }
  );

  test(
    'T2.v2.1.2: Unauthenticated GET / HTML and public JS chunks contain zero payroll/rate/demo employee markers',
    async () => {
      const client = getServer().createClient();
      const htmlRes = await client.get<string>('/');
      expect(htmlRes.status).toBe(200);

      for (const marker of PAYROLL_AND_RATE_MARKERS) {
        expect(htmlRes.text).not.toContain(marker);
      }

      const scriptPaths = extractStaticScriptPaths(htmlRes.text);
      expect(scriptPaths.length).toBeGreaterThan(0);

      const assets = await Promise.all(
        scriptPaths.map((src) => client.get<string>(src))
      );

      for (const asset of assets) {
        expect(asset.status).toBe(200);
        for (const marker of PAYROLL_AND_RATE_MARKERS) {
          expect(asset.text).not.toContain(marker);
        }
        for (const name of INITIAL_PEOPLE_NAMES) {
          expect(asset.text).not.toContain(name);
        }
        expect(asset.text).not.toContain('@example.invalid');
      }
    },
    { timeout: 15_000 }
  );

  test('T2.v2.1.3: POST /api/waitlist rejects exact and uppercase duplicate emails with 409', async () => {
    const client = getServer().createClient();
    const email = createRandomEmail('dup_waitlist_t2').toLowerCase();

    const first = await client.post<{ success: boolean; position: number }>('/api/waitlist', {
      name: 'First Visitor',
      email,
    });
    expect(first.status).toBe(201);

    const exactDup = await client.post<ErrorBody>('/api/waitlist', {
      name: 'Exact Duplicate',
      email,
    });
    expect(exactDup.status).toBe(409);
    expect(exactDup.data.success).toBe(false);
    expect(typeof exactDup.data.error).toBe('string');

    const upperDup = await client.post<ErrorBody>('/api/waitlist', {
      name: 'Uppercase Duplicate',
      email: email.toUpperCase(),
    });
    expect(upperDup.status).toBe(409);
    expect(upperDup.data.success).toBe(false);
    expect(typeof upperDup.data.error).toBe('string');
  });

  test('T2.v2.1.4: POST /api/waitlist rejects empty, malformed, whitespace, oversized, and invalid email payloads with 400', async () => {
    const client = getServer().createClient();

    const rawBodies = ['', '{bad'];
    for (const raw of rawBodies) {
      const res = await client.post<ErrorBody>('/api/waitlist', raw, {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    }

    const jsonPayloads: unknown[] = [
      { email: createRandomEmail('missing_name') },
      fixtures.waitlist.adversarial.emptyName,
      fixtures.waitlist.adversarial.whitespaceOnly,
      { name: 'Too Long', email: createRandomEmail('long_name') },
    ];
    (jsonPayloads[3] as { name: string }).name = 'A'.repeat(1001);

    for (const badEmail of fixtures.waitlist.adversarial.invalidEmailFormats) {
      jsonPayloads.push({ name: 'Bad Email', email: badEmail });
    }

    for (const payload of jsonPayloads) {
      const res = await client.post<ErrorBody>('/api/waitlist', payload);
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    }
  });

  test('T2.v2.1.5: /api/health rejects POST, PUT, DELETE, PATCH with 405 and Allow: GET', async () => {
    const client = getServer().createClient();

    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'] as const) {
      const res = await client.request<ErrorBody>(method, '/api/health');
      expect(res.status).toBe(405);
      expect(res.data.success).toBe(false);
      expect(res.headers.get('allow')).toContain('GET');
    }
  });

  test('T2.v2.1.6: /api/roi rejects GET, PUT, DELETE, PATCH with 405 and Allow: POST', async () => {
    const client = getServer().createClient();

    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH'] as const) {
      const res = await client.request<ErrorBody>(method, '/api/roi');
      expect(res.status).toBe(405);
      expect(res.data.success).toBe(false);
      expect(res.headers.get('allow')).toContain('POST');
    }
  });
});
