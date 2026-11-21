import { describe, expect, test } from 'bun:test';
import { resolveWorkspacePageState } from '@/app/workspace/workspace-helpers';
import { showsDefaultDemoCredentials } from '@/lib/db';
import type { Person } from '@/lib/types';

/**
 * Focused role-policy contract tests (Cubic PR#3 follow-up).
 * Direct fixture seam only — no network, no server, no bypass attempts.
 */

const ROSTER_FIXTURE: Person[] = [
  {
    id: '1',
    name: 'Roster Person',
    role: 'Engineer',
    team: 'Engineering',
    city: 'Remote',
    hireDate: '2026-01-01',
    since: 'Sample date',
    status: 'Active',
    av: '#cfe0c8',
    rate: 42,
    email: 'roster@example.invalid',
    phone: 'Not provided',
    bday: 'Not provided',
  },
];

const ADMIN_SESSION = {
  id: 1,
  email: 'admin@grovia.io',
  name: 'Alex Rivera',
  role: 'admin',
  iat: 1000,
  exp: 9999999999,
};

describe('Roster access & demo-visibility policy (server-side contract)', () => {
  test('resolveWorkspacePageState loads roster only for admin sessions', async () => {
    const adminState = await resolveWorkspacePageState({
      getSession: async () => ADMIN_SESSION,
      loadPeople: () => ROSTER_FIXTURE,
    });
    expect(adminState.redirectTo).toBeNull();
    expect(adminState.people).toEqual(ROSTER_FIXTURE);

    const memberState = await resolveWorkspacePageState({
      getSession: async () => ({ ...ADMIN_SESSION, role: 'member' }),
      loadPeople: () => {
        throw new Error('loadPeople must not run for non-admin sessions');
      },
    });
    expect(memberState.redirectTo).toBeNull();
    expect(memberState.user?.role).toBe('member');
    expect(memberState.people).toEqual([]);

    const unauthState = await resolveWorkspacePageState({
      getSession: async () => null,
      loadPeople: () => {
        throw new Error('loadPeople must not run for unauthenticated visits');
      },
    });
    expect(unauthState.redirectTo).toBe('/login?next=%2Fworkspace');
    expect(unauthState.people).toEqual([]);
  });

  test('showsDefaultDemoCredentials hides stale hints for configured auth', () => {
    const prev = {
      NODE_ENV: process.env.NODE_ENV,
      ALLOW_DEMO_ADMIN: process.env.ALLOW_DEMO_ADMIN,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    };
    const env = process.env as Record<string, string | undefined>;
    try {
      env.NODE_ENV = 'development';
      delete env.ALLOW_DEMO_ADMIN;
      delete env.ADMIN_EMAIL;
      delete env.ADMIN_PASSWORD;
      expect(showsDefaultDemoCredentials()).toBe(true);

      // Production without the explicit opt-in never shows the hint.
      env.NODE_ENV = 'production';
      expect(showsDefaultDemoCredentials()).toBe(false);

      // Production opt-in with default credentials: defaults are live.
      env.ALLOW_DEMO_ADMIN = '1';
      expect(showsDefaultDemoCredentials()).toBe(true);

      // Custom email override makes the well-known email stale.
      env.ADMIN_EMAIL = 'ops@company.example';
      expect(showsDefaultDemoCredentials()).toBe(false);

      // Custom password override makes the well-known password stale.
      delete env.ADMIN_EMAIL;
      env.ADMIN_PASSWORD = 'correct-horse-battery';
      expect(showsDefaultDemoCredentials()).toBe(false);
    } finally {
      env.NODE_ENV = prev.NODE_ENV;
      if (prev.ALLOW_DEMO_ADMIN === undefined) delete process.env.ALLOW_DEMO_ADMIN;
      else process.env.ALLOW_DEMO_ADMIN = prev.ALLOW_DEMO_ADMIN;
      if (prev.ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = prev.ADMIN_EMAIL;
      if (prev.ADMIN_PASSWORD === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = prev.ADMIN_PASSWORD;
    }
  });
});
