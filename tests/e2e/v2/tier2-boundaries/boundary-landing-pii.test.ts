import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createRandomEmail, fixtures } from '../../harness/fixtures';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';
import { assertNoSeedPeoplePii } from '../../harness/pii';

interface ErrorBody {
  success: boolean;
  error: string;
}

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
    'T2.v2.1.1: Unauthenticated GET / HTML contains no employee PII or legacy waitlist/inquiry emails',
    async () => {
      const client = getServer().createClient();
      const res = await client.get<string>('/');

      expect(res.status).toBe(200);

      assertNoSeedPeoplePii(res.text);
    },
    { timeout: 15_000 }
  );

  test(
    'T2.v2.1.2: Unauthenticated GET / HTML and public JS chunks contain zero payroll/rate/demo employee markers',
    async () => {
      const client = getServer().createClient();
      const htmlRes = await client.get<string>('/');
      expect(htmlRes.status).toBe(200);

      assertNoSeedPeoplePii(htmlRes.text);

      const scriptPaths = extractStaticScriptPaths(htmlRes.text);
      expect(scriptPaths.length).toBeGreaterThan(0);

      const assets = await Promise.all(
        scriptPaths.map((src) => client.get<string>(src))
      );

      for (const asset of assets) {
        expect(asset.status).toBe(200);
        assertNoSeedPeoplePii(asset.text);
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
