import { describe, test, expect, beforeEach } from 'bun:test';
import { testClient, resetDatabase } from '../harness/test-client';
import { fixtures, createRandomEmail } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 4 — Real-World Scenario: Launch Day Waitlist Surge', () => {
  beforeEach(() => {
    resetDatabase();
  });

  test('T4.3.1: Launch day surge simulation: 15 sequential submissions processed cleanly', async () => {
    const results = [];
    for (let i = 0; i < 15; i++) {
      const email = createRandomEmail(`surge_${i}`);
      const res = await testClient.post('/api/waitlist', {
        name: `Launch User ${i}`,
        email,
        company: `Startup ${i}`,
      });
      results.push(res);
    }

    for (const res of results) {
      expect([200, 201]).toContain(res.status);
      expect(res.data.success).toBe(true);
    }
  });

  test('T4.3.2: Deduplication during high-traffic surge rejects duplicate attempts with 409 Conflict', async () => {
    const targetEmail = createRandomEmail('surge_dup');
    const firstRes = await testClient.post('/api/waitlist', {
      name: 'First Arrival',
      email: targetEmail,
    });
    expect([200, 201]).toContain(firstRes.status);

    // Repeated attempts with same email
    const dupRes1 = await testClient.post('/api/waitlist', {
      name: 'Second Arrival',
      email: targetEmail,
    });
    assertions.assertStatus(dupRes1, 409);

    const dupRes2 = await testClient.post('/api/waitlist', {
      name: 'Third Arrival',
      email: targetEmail.toUpperCase(),
    });
    assertions.assertStatus(dupRes2, 409);
  });

  test('T4.3.3: Queue integrity: Queue positions form a strictly ascending sequence', async () => {
    const positions: number[] = [];
    for (let i = 0; i < 6; i++) {
      const email = createRandomEmail(`queue_${i}`);
      const res = await testClient.post('/api/waitlist', {
        name: `Queue User ${i}`,
        email,
      });
      positions.push(res.data.position);
    }

    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });
});
