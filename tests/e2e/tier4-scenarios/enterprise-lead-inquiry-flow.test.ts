import { describe, test, expect, beforeEach } from 'bun:test';
import { testClient, resetDatabase } from '../harness/test-client';
import { fixtures, createRandomEmail } from '../harness/fixtures';
import { assertions } from '../harness/assertions';

describe('Tier 4 — Real-World Scenario: Enterprise Lead & Support Lifecycle', () => {
  beforeEach(() => {
    resetDatabase();
  });

  test('T4.1.1: Pre-flight discovery: Health check confirms system and database are healthy', async () => {
    const healthRes = await testClient.get('/api/health');
    assertions.assertOk(healthRes);
    expect(healthRes.data.status).toBe('ok');
    expect(healthRes.data.database).toBe('healthy');
  });

  test('T4.1.2: Enterprise contact submission: High-priority inquiry ingested successfully', async () => {
    const leadEmail = createRandomEmail('ent_lead');
    const inquiryPayload = {
      name: 'Victoria Stirling',
      email: leadEmail,
      subject: 'Global Workforce & Payroll Pilot (500 seats)',
      message:
        'We are evaluating Grovia for 500 team members across London and Tokyo. Need security documentation and enterprise SLA details.',
      priority: 'high' as const,
    };

    const inqRes = await testClient.post('/api/inquiries', inquiryPayload);
    expect([200, 201]).toContain(inqRes.status);
    assertions.assertInquirySuccess(inqRes.data);
  });

  test('T4.1.3: Cross-channel conversion: Enterprise lead also joins the priority waitlist', async () => {
    const leadEmail = createRandomEmail('ent_waitlist');
    const waitlistPayload = {
      name: 'Victoria Stirling',
      email: leadEmail,
      company: 'Stirling Global Logistics',
      teamSize: '201-1000',
      useCase: 'Consolidated timesheet and cross-border payroll management',
    };

    const waitlistRes = await testClient.post('/api/waitlist', waitlistPayload);
    expect([200, 201]).toContain(waitlistRes.status);
    assertions.assertWaitlistSuccess(waitlistRes.data);
  });

  test('T4.1.4: Ticket progression & resolution: Support team triages and resolves ticket', async () => {
    const email = createRandomEmail('triage');
    const inqRes = await testClient.post('/api/inquiries', {
      name: 'Operations Lead',
      email,
      subject: 'Custom Timesheet Approval Flow',
      message: 'Need clarity on whether multi-step manager approvals are supported in Payroll view.',
      priority: 'medium',
    });
    const ticketId = inqRes.data.ticketId;

    // Triage to in_progress
    const claimRes = await testClient.patch(`/api/inquiries/${ticketId}`, {
      status: 'in_progress',
    });
    assertions.assertStatus(claimRes, 200);
    expect(claimRes.data.status).toBe('in_progress');

    // Final resolution
    const resolveRes = await testClient.patch(`/api/inquiries/${ticketId}`, {
      status: 'resolved',
    });
    assertions.assertStatus(resolveRes, 200);
    expect(resolveRes.data.status).toBe('resolved');

    // Verify filter
    const listRes = await testClient.get('/api/inquiries?status=resolved');
    const items = listRes.data.inquiries || listRes.data;
    expect(items.some((i: any) => i.ticketId === ticketId || i.ticket_id === ticketId)).toBe(true);
  });
});
