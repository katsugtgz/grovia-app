import { describe, test, expect, beforeEach } from 'bun:test';
import { testClient, resetDatabase } from '../harness/test-client';
import { fixtures, createRandomEmail } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 3 — Cross-Feature: Concurrent Access & Multi-Tenant State (F6 + F10 + F11)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  test('T3.4.1: Concurrent batch execution of 10 waitlist and 10 inquiry requests completes', async () => {
    const waitlistPromises = Array.from({ length: 10 }, (_, i) =>
      testClient.post('/api/waitlist', {
        name: `Concurrent Waitlist User ${i}`,
        email: createRandomEmail(`conc_w_${i}`),
      })
    );

    const inquiriesPromises = Array.from({ length: 10 }, (_, i) =>
      testClient.post('/api/inquiries', {
        name: `Concurrent Inquiry User ${i}`,
        email: createRandomEmail(`conc_inq_${i}`),
        subject: `Concurrent Subject ${i}`,
        message: `This is concurrent test message number ${i} with valid length.`,
      })
    );

    const [waitlistResults, inquiriesResults] = await Promise.all([
      Promise.all(waitlistPromises),
      Promise.all(inquiriesPromises),
    ]);

    expect(waitlistResults.length).toBe(10);
    expect(inquiriesResults.length).toBe(10);
  });

  test('T3.4.2: All concurrent requests return 200/201 with zero dropped requests', async () => {
    const promises = Array.from({ length: 12 }, (_, i) =>
      testClient.post('/api/waitlist', {
        name: `Burst User ${i}`,
        email: createRandomEmail(`burst_${i}`),
      })
    );

    const results = await Promise.all(promises);
    for (const res of results) {
      expect([200, 201]).toContain(res.status);
      expect(res.data.success).toBe(true);
    }
  });

  test('T3.4.3: Waitlist count in DB accurately reflects total concurrent entries added', async () => {
    const initialCount = (await testClient.get('/api/waitlist')).data.count;
    const batchSize = 8;

    const promises = Array.from({ length: batchSize }, (_, i) =>
      testClient.post('/api/waitlist', {
        name: `Count Check ${i}`,
        email: createRandomEmail(`count_chk_${i}`),
      })
    );

    await Promise.all(promises);
    const finalCount = (await testClient.get('/api/waitlist')).data.count;
    expect(finalCount).toBe(initialCount + batchSize);
  });

  test('T3.4.4: All concurrent waitlist submissions receive unique queue positions', async () => {
    const promises = Array.from({ length: 8 }, (_, i) =>
      testClient.post('/api/waitlist', {
        name: `Position User ${i}`,
        email: createRandomEmail(`pos_${i}`),
      })
    );

    const results = await Promise.all(promises);
    const positions = results.map((r) => r.data.position);
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(positions.length);
  });

  test('T3.4.5: All concurrent inquiries receive unique, properly formatted ticket IDs', async () => {
    const promises = Array.from({ length: 8 }, (_, i) =>
      testClient.post('/api/inquiries', {
        name: `Ticket User ${i}`,
        email: createRandomEmail(`tkt_${i}`),
        subject: `Ticket Subject ${i}`,
        message: `Detailed ticket message body ${i} for concurrent validation.`,
      })
    );

    const results = await Promise.all(promises);
    const ticketIds = results.map((r) => r.data.ticketId);
    const uniqueTicketIds = new Set(ticketIds);
    expect(uniqueTicketIds.size).toBe(ticketIds.length);
    for (const id of ticketIds) {
      expect(id).toMatch(/^GROV-[A-Za-z0-9]+$/);
    }
  });
});
