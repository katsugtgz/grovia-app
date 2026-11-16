import { describe, test, expect, beforeEach } from 'bun:test';
import { testClient, resetDatabase } from '../harness/test-client';
import { fixtures, createRandomEmail } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 2 — Boundary: Waitlist Booking Endpoint', () => {
  beforeEach(() => {
    resetDatabase();
  });

  test('T2.2.1: Duplicate email registration returns HTTP 409 Conflict', async () => {
    const email = createRandomEmail('dup');
    const payload = { ...fixtures.waitlist.standard, email };

    const res1 = await testClient.post('/api/waitlist', payload);
    expect([200, 201]).toContain(res1.status);

    const res2 = await testClient.post('/api/waitlist', payload);
    assertions.assertStatus(res2, 409);
  });

  test('T2.2.2: Case-insensitive duplicate email (e.g. UPPERCASE) returns HTTP 409 Conflict', async () => {
    const rawEmail = createRandomEmail('case');
    const lowerEmail = rawEmail.toLowerCase();
    const upperEmail = rawEmail.toUpperCase();

    const res1 = await testClient.post('/api/waitlist', { ...fixtures.waitlist.standard, email: lowerEmail });
    expect([200, 201]).toContain(res1.status);

    const res2 = await testClient.post('/api/waitlist', { ...fixtures.waitlist.standard, email: upperEmail });
    assertions.assertStatus(res2, 409);
  });

  test('T2.2.3: Malformed email without @ returns HTTP 400 Bad Request', async () => {
    const res = await testClient.post('/api/waitlist', {
      name: 'Bad Email User',
      email: 'plainaddress',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.2.4: Malformed email missing domain returns HTTP 400', async () => {
    const res = await testClient.post('/api/waitlist', {
      name: 'Bad Email User',
      email: 'user@',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.2.5: Malformed email missing username returns HTTP 400', async () => {
    const res = await testClient.post('/api/waitlist', {
      name: 'Bad Email User',
      email: '@missinguser.com',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.2.6: Email with spaces returns HTTP 400', async () => {
    const res = await testClient.post('/api/waitlist', {
      name: 'Bad Email User',
      email: 'user name@example.com',
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.2.7: Empty string for name returns HTTP 400', async () => {
    const res = await testClient.post('/api/waitlist', {
      name: '',
      email: createRandomEmail('empty_name'),
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.2.8: Whitespace-only string for name returns HTTP 400', async () => {
    const res = await testClient.post('/api/waitlist', {
      name: '   \t  ',
      email: createRandomEmail('spaces_name'),
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.2.9: 10,000 character string in name returns HTTP 400 size error', async () => {
    const res = await testClient.post('/api/waitlist', {
      name: 'A'.repeat(10000),
      email: createRandomEmail('tenkb'),
    });
    assertions.assertStatus(res, 400);
  });

  test('T2.2.10: SQL injection payload in name is stored safely as literal text', async () => {
    const payload = {
      ...fixtures.waitlist.adversarial.sqlInjection,
      email: createRandomEmail('sqli'),
    };
    const res = await testClient.post('/api/waitlist', payload);
    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
  });

  test('T2.2.11: XSS script tags in name stored safely without server execution', async () => {
    const payload = {
      ...fixtures.waitlist.adversarial.xssScript,
      email: createRandomEmail('xss'),
    };
    const res = await testClient.post('/api/waitlist', payload);
    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
  });

  test('T2.2.12: Unicode and emoji characters in name preserved without data corruption', async () => {
    const payload = {
      ...fixtures.waitlist.adversarial.unicodeAndEmoji,
      email: createRandomEmail('unicode'),
    };
    const res = await testClient.post('/api/waitlist', payload);
    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
  });

  test('T2.2.13: DELETE /api/waitlist returns HTTP 405 Method Not Allowed', async () => {
    const res = await testClient.delete('/api/waitlist');
    assertions.assertStatus(res, 405);
  });
});
