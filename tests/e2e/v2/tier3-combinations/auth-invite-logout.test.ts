import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import type { PeopleListResponse, PersonInviteResponse } from '@/lib/types';
import {
  isSameServerOrigin,
  startLiveServer,
  type LiveServerHandle,
} from '../../harness/live-http';
import { createRandomEmail } from '../../harness/fixtures';

interface AuthResponse {
  success: boolean;
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
  error?: string;
}

interface SessionResponse {
  success: boolean;
  authenticated: boolean;
  error?: string;
}

interface ErrorResponse {
  success: boolean;
  error: string;
}

let server: LiveServerHandle | undefined;

function getServer(): LiveServerHandle {
  if (!server) {
    throw new Error('Live test server is not initialized');
  }
  return server;
}

describe('Tier 3 — Combinations: Auth, People Invites & Logout (T3.v2.2)', () => {
  beforeAll(async () => {
    server = await startLiveServer();
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  test('T3.v2.2.1: Login -> invite teammate -> verify workspace & roster -> logout revokes all access', async () => {
    const live = getServer();
    const admin = live.createClient();

    const loginRes = await admin.login<AuthResponse>();
    expect(loginRes.status).toBe(200);
    expect(loginRes.data.success).toBe(true);

    const beforePeople = await admin.get<PeopleListResponse>('/api/people');
    expect(beforePeople.status).toBe(200);
    expect(beforePeople.data.count ?? 0).toBeGreaterThanOrEqual(10);
    const beforeCount = beforePeople.data.count ?? 0;

    const inviteEmail = createRandomEmail('t3_invite_full');
    const inviteRes = await admin.post<PersonInviteResponse>('/api/people', {
      name: 'Maya Lin',
      email: inviteEmail,
      role: 'Staff Engineer',
      team: 'Engineering',
      city: 'Toronto',
    });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.data.success).toBe(true);
    expect(inviteRes.data.person?.email).toBe(inviteEmail);
    expect(inviteRes.data.person?.status).toBe('Invited');

    const afterPeople = await admin.get<PeopleListResponse>('/api/people');
    expect(afterPeople.status).toBe(200);
    expect(afterPeople.data.count).toBe(beforeCount + 1);
    expect(
      (afterPeople.data.people ?? []).some(
        (person) => person.email === inviteEmail && person.status === 'Invited'
      )
    ).toBe(true);

    const workspaceRes = await admin.get('/workspace');
    expect(workspaceRes.status).toBe(200);
    expect(workspaceRes.headers.get('content-type') ?? '').toContain('text/html');

    const logoutRes = await admin.logout<{ success: boolean }>();
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.data.success).toBe(true);
    expect(admin.jar.has('grovia_session')).toBe(false);

    const postLogoutGetPeople = await admin.get<ErrorResponse>('/api/people');
    expect(postLogoutGetPeople.status).toBe(401);

    const postLogoutPostPeople = await admin.post<ErrorResponse>('/api/people', {
      name: 'Unauthorized Invite',
      email: createRandomEmail('t3_unauth_invite'),
      role: 'Designer',
      team: 'Design',
    });
    expect(postLogoutPostPeople.status).toBe(401);

    const postLogoutSession = await admin.get<SessionResponse>('/api/auth/session');
    expect(postLogoutSession.status).toBe(401);
    expect(postLogoutSession.data.authenticated).toBe(false);

    const postLogoutWorkspace = await admin.get('/workspace');
    expect(postLogoutWorkspace.status).toBe(307);
    expect(postLogoutWorkspace.location).toBeTruthy();
    const loc = new URL(postLogoutWorkspace.location ?? '', live.baseUrl);
    expect(isSameServerOrigin(loc, live.baseUrl)).toBe(true);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/workspace');
  });

  test('T3.v2.2.2: Duplicate teammate invite with uppercase email returns 409 without duplicating roster', async () => {
    const live = getServer();
    const admin = live.createClient();
    expect((await admin.login<AuthResponse>()).status).toBe(200);

    const inviteEmail = createRandomEmail('t3_invite_dup');
    const firstInvite = await admin.post<PersonInviteResponse>('/api/people', {
      name: 'Jordan Patel',
      email: inviteEmail,
      role: 'Product Manager',
      team: 'Product',
      city: 'London',
    });
    expect(firstInvite.status).toBe(201);

    const listAfterFirst = await admin.get<PeopleListResponse>('/api/people');
    expect(listAfterFirst.status).toBe(200);
    const countAfterFirst = listAfterFirst.data.count;

    const duplicateInvite = await admin.post<PersonInviteResponse>('/api/people', {
      name: 'Jordan Duplicate',
      email: inviteEmail.toUpperCase(),
      role: 'Product Manager',
      team: 'Product',
      city: 'London',
    });
    expect(duplicateInvite.status).toBe(409);
    expect(duplicateInvite.data.success).toBe(false);
    expect((duplicateInvite.data.error ?? '').toLowerCase()).toContain('already exists');

    const listAfterDuplicate = await admin.get<PeopleListResponse>('/api/people');
    expect(listAfterDuplicate.status).toBe(200);
    expect(listAfterDuplicate.data.count).toBe(countAfterFirst);

    const matches = (listAfterDuplicate.data.people ?? []).filter(
      (person) => (person.email ?? '').toLowerCase() === inviteEmail.toLowerCase()
    );
    expect(matches.length).toBe(1);
  });

  test('T3.v2.2.3: Invited teammate persists across logout and fresh re-login session', async () => {
    const live = getServer();
    const firstSession = live.createClient();
    expect((await firstSession.login<AuthResponse>()).status).toBe(200);

    const inviteEmail = createRandomEmail('t3_invite_persist');
    const inviteRes = await firstSession.post<PersonInviteResponse>('/api/people', {
      name: 'Elena Kim',
      email: inviteEmail,
      role: 'Data Engineer',
      team: 'Engineering',
      city: 'Austin',
    });
    expect(inviteRes.status).toBe(201);
    expect((await firstSession.logout<{ success: boolean }>()).status).toBe(200);

    const secondSession = live.createClient();
    expect((await secondSession.login<AuthResponse>()).status).toBe(200);

    const peopleRes = await secondSession.get<PeopleListResponse>('/api/people');
    expect(peopleRes.status).toBe(200);
    expect(
      (peopleRes.data.people ?? []).some(
        (person) =>
          person.email === inviteEmail &&
          person.name === 'Elena Kim' &&
          person.status === 'Invited'
      )
    ).toBe(true);
  });
});
