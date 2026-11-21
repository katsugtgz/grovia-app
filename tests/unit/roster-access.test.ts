import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, initDatabase, showsDefaultDemoCredentials } from '@/lib/db';
import { resolveWorkspacePageState } from '@/app/workspace/workspace-helpers';
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

  test('showsDefaultDemoCredentials: config matrix and persisted-demo confirmation in isolated fixture', async () => {
    const prev = {
      NODE_ENV: process.env.NODE_ENV,
      ALLOW_DEMO_ADMIN: process.env.ALLOW_DEMO_ADMIN,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      DB_PATH: process.env.DB_PATH,
      DATABASE_PATH: process.env.DATABASE_PATH,
      DATABASE_URL: process.env.DATABASE_URL,
    };
    const env = process.env as Record<string, string | undefined>;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grovia-hint-fixture-'));
    const tempDbPath = path.join(tempDir, 'fixture.db');
    const closeAndCleanup = () => {
      closeDb();
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    };

    try {
      env.NODE_ENV = 'development';
      delete env.ALLOW_DEMO_ADMIN;
      delete env.ADMIN_EMAIL;
      delete env.ADMIN_PASSWORD;
      env.DB_PATH = tempDbPath;
      delete env.DATABASE_PATH;
      delete env.DATABASE_URL;

      // Config matrix evaluated against the isolated fixture DB.
      // Defaults config + persisted row seeded from the shared demo password:
      // hint confirmed via server-side verification.
      expect(await showsDefaultDemoCredentials()).toBe(true);

      // Production without the explicit opt-in never shows the hint.
      env.NODE_ENV = 'production';
      expect(await showsDefaultDemoCredentials()).toBe(false);

      // Production opt-in with default credentials: defaults are live.
      env.ALLOW_DEMO_ADMIN = '1';
      expect(await showsDefaultDemoCredentials()).toBe(true);

      // Custom email override makes the well-known email stale.
      env.ADMIN_EMAIL = 'ops@company.example';
      expect(await showsDefaultDemoCredentials()).toBe(false);

      // Custom password override makes the well-known password stale.
      delete env.ADMIN_EMAIL;
      env.ADMIN_PASSWORD = 'correct-horse-battery';
      expect(await showsDefaultDemoCredentials()).toBe(false);

      // Stale persisted password: an ADMIN_PASSWORD override seeded the row,
      // then the override was removed. Saved passwords are never reset, so the
      // hint must stay hidden even though config again looks like defaults.
      closeDb();
      env.NODE_ENV = 'development';
      delete env.ALLOW_DEMO_ADMIN;
      env.ADMIN_PASSWORD = 'rotated-away-password';
      delete env.ADMIN_EMAIL;
      initDatabase(tempDbPath);
      closeDb();
      delete env.ADMIN_PASSWORD;

      expect(await showsDefaultDemoCredentials()).toBe(false);
    } finally {
      closeAndCleanup();
      env.NODE_ENV = prev.NODE_ENV;
      if (prev.ALLOW_DEMO_ADMIN === undefined) delete process.env.ALLOW_DEMO_ADMIN;
      else process.env.ALLOW_DEMO_ADMIN = prev.ALLOW_DEMO_ADMIN;
      if (prev.ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = prev.ADMIN_EMAIL;
      if (prev.ADMIN_PASSWORD === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = prev.ADMIN_PASSWORD;
      if (prev.DB_PATH === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = prev.DB_PATH;
      if (prev.DATABASE_PATH === undefined) delete process.env.DATABASE_PATH;
      else process.env.DATABASE_PATH = prev.DATABASE_PATH;
      if (prev.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev.DATABASE_URL;
    }
  });
});
