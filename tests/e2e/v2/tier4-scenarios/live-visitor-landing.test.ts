import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startLiveServer, type LiveServerHandle } from '../../harness/live-http';
import { createRandomEmail, fixtures } from '../../harness/fixtures';

interface HealthResponse {
  status: string;
  database: string;
  version: string;
}

interface RoiResponse {
  currentMonthlyRevenue: number;
  projectedMonthlyRevenue: number;
  projectedRoiMultiple: string;
  monthlyTrajectory: Array<{ month: string; revenue: number }>;
}

interface WaitlistCreateResponse {
  success: boolean;
  message?: string;
  position?: number;
  error?: string;
}

interface ErrorResponse {
  success: boolean;
  error: string;
}

const SENSITIVE_NAMES = [
  'Demo Person 01',
  'Demo Person 02',
  'Demo Person 03',
  'Demo Person 04',
  'Demo Person 05',
  'Demo Person 06',
  'Demo Person 07',
  'Demo Person 08',
  'Demo Person 09',
  'Demo Person 10',
] as const;

const SENSITIVE_EMAILS = [
  'person01@example.invalid',
  'person02@example.invalid',
  'person03@example.invalid',
  'person04@example.invalid',
  'person05@example.invalid',
  'person06@example.invalid',
  'person07@example.invalid',
  'person08@example.invalid',
  'person09@example.invalid',
  'person10@example.invalid',
  'alex@innovate.io',
  'elena@quantum.tech',
  'marcus@hypergrowth.co',
  'sarah@vertex.io',
  'liam@finscale.org',
  'chloe@nexus.co',
] as const;

const PAYROLL_LEAK_MARKERS = [
  '$4,850',
  'Not provided (demo)',
  'Payslip-09',
  'Contract.pdf',
] as const;

const RATE_PAYLOAD_PATTERN = /["']?rate["']?\s*:\s*(3[6-9]|4[0-7])\b/;

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live test server is not initialized');
  }
  return server;
}

function assertNoSensitivePii(content: string): void {
  for (const name of SENSITIVE_NAMES) {
    expect(content).not.toContain(name);
  }
  for (const email of SENSITIVE_EMAILS) {
    expect(content).not.toContain(email);
  }
  for (const marker of PAYROLL_LEAK_MARKERS) {
    expect(content).not.toContain(marker);
  }
  expect(RATE_PAYLOAD_PATTERN.test(content)).toBe(false);
}

describe('Tier 4 — Live HTTP Scenario: Public Visitor Landing & PII Audit (T4.v2.1)', () => {
  beforeAll(async () => {
    server = await startLiveServer();
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  test('T4.v2.1.1: Visitor loads landing page, checks health & ROI, and submits waitlist with duplicate rejection', async () => {
    const live = getServer();
    const visitor = live.createClient();

    const landingRes = await visitor.get('/');
    expect(landingRes.status).toBe(200);
    expect(landingRes.headers.get('content-type') ?? '').toContain('text/html');
    expect(landingRes.text).toContain('<header');
    expect(landingRes.text).toContain('<main');
    assertNoSensitivePii(landingRes.text);

    const healthRes = await visitor.get<HealthResponse>('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.data.status).toBe('ok');
    expect(healthRes.data.database).toBe('healthy');

    const roiRes = await visitor.post<RoiResponse>('/api/roi', fixtures.roi.standard);
    expect(roiRes.status).toBe(200);
    expect(roiRes.data.projectedRoiMultiple).toBe('4.2x');
    expect(roiRes.data.monthlyTrajectory.length).toBe(12);

    const email = createRandomEmail('t4_visitor');
    const signupRes = await visitor.post<WaitlistCreateResponse>('/api/waitlist', {
      name: 'Live Visitor',
      email,
      company: 'Horizon Ventures',
      teamSize: '11-50',
      useCase: 'Global payroll automation',
    });
    expect(signupRes.status).toBe(201);
    expect(signupRes.data.success).toBe(true);
    expect(signupRes.data.message).toBe('Added to waitlist');
    expect(signupRes.data.position ?? 0).toBeGreaterThanOrEqual(1);

    const duplicateRes = await visitor.post<WaitlistCreateResponse>('/api/waitlist', {
      name: 'Live Visitor Repeat',
      email: email.toUpperCase(),
    });
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.data.success).toBe(false);
  });

  test('T4.v2.1.2: Public JS chunks referenced by GET / contain zero employee PII or payroll payloads', async () => {
    const live = getServer();
    const visitor = live.createClient();

    const landingRes = await visitor.get('/');
    expect(landingRes.status).toBe(200);

    const scriptRegex = /["'](\/_next\/static\/[^"'\s>]+\.js(?:\?[^"'\s>]*)?)["']/g;
    const scriptUrls = new Set<string>();
    let match = scriptRegex.exec(landingRes.text);
    while (match !== null) {
      if (match[1]) {
        scriptUrls.add(match[1]);
      }
      match = scriptRegex.exec(landingRes.text);
    }

    expect(scriptUrls.size).toBeGreaterThan(0);

    for (const scriptPath of scriptUrls) {
      const chunkRes = await visitor.get(scriptPath);
      expect(chunkRes.status).toBe(200);
      assertNoSensitivePii(chunkRes.text);
    }
  });

  test('T4.v2.1.3: Unauthenticated visitor probing /workspace and protected APIs is redirected or rejected', async () => {
    const live = getServer();
    const visitor = live.createClient();

    const wsRes = await visitor.get('/workspace');
    expect(wsRes.status).toBe(307);
    expect(wsRes.location).toBeTruthy();
    const loc = new URL(wsRes.location ?? '', live.baseUrl);
    expect(['127.0.0.1', 'localhost']).toContain(loc.hostname);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/workspace');
    assertNoSensitivePii(wsRes.text);

    const blockedReads = [
      '/api/waitlist',
      '/api/people',
      '/api/inquiries',
      '/api/metrics',
      '/api/auth/session',
    ];

    for (const endpoint of blockedReads) {
      const res = await visitor.get<ErrorResponse>(endpoint);
      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    }

    const blockedPostPeople = await visitor.post<ErrorResponse>('/api/people', {
      name: 'Intruder',
      email: createRandomEmail('t4_intruder'),
      role: 'Engineer',
      team: 'Engineering',
    });
    expect(blockedPostPeople.status).toBe(401);

    const blockedPostInquiry = await visitor.post<ErrorResponse>('/api/inquiries', {
      ...fixtures.inquiries.standard,
      email: createRandomEmail('t4_intruder_inq'),
    });
    expect(blockedPostInquiry.status).toBe(401);

    const blockedPatchInquiry = await visitor.patch<ErrorResponse>('/api/inquiries/GROV-1001', {
      status: 'closed',
    });
    expect(blockedPatchInquiry.status).toBe(401);
  });
});
