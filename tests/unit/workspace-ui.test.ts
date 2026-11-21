import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '@/app/page';
import WorkspacePage from '@/app/workspace/page';
import { resolveWorkspacePageState } from '@/app/workspace/workspace-helpers';
import { WorkspaceShell } from '@/components/WorkspaceShell';
import { Header } from '@/components/Header';
import { submitLogoutRequest } from '@/components/header-helpers';
import { InviteModal } from '@/components/modals/InviteModal';
import {
  submitInvitePersonRequest,
  validateInviteInput,
} from '@/components/modals/invite-helpers';
import { NotificationTray } from '@/components/ui/NotificationTray';
import { CalendarCard } from '@/components/cards/CalendarCard';
import * as dataModule from '@/lib/data';
import { SEED_PEOPLE } from '@/lib/seed-people';
import type { AuthUser, Person } from '@/lib/types';

const DEMO_USER: AuthUser = {
  id: 1,
  email: 'admin@grovia.io',
  name: 'Alex Rivera',
  role: 'admin',
};

const SAMPLE_PEOPLE: Person[] = SEED_PEOPLE.map((person) => ({ ...person }));

function createJsonFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

describe('Unit — M3 Workspace Migration, Public Landing Mount, PII Decoupling & UI Wiring', () => {
  describe('Public Landing Mount (app/page.tsx) & lib/data.ts PII Decoupling', () => {
    test('app/page.tsx renders LandingPage with <header> and zero employee PII', () => {
      const html = renderToStaticMarkup(React.createElement(HomePage));

      expect(html).toContain('<header');
      expect(html).toContain('href="/login"');
      expect(html).toContain('href="/workspace"');
      expect(html).toContain('id="waitlist"');
      expect(html).not.toContain('id="view-people"');
      expect(html).not.toContain('id="view-payroll"');
      expect(html).not.toContain('@example.invalid');

      for (const person of SEED_PEOPLE) {
        expect(html).not.toContain(person.name);
        if (person.email) {
          expect(html).not.toContain(person.email);
        }
      }
    });

    test('lib/data.ts exports non-PII AVATAR_PALETTE and omits INITIAL_PEOPLE', () => {
      expect(Array.isArray(dataModule.AVATAR_PALETTE)).toBe(true);
      expect(dataModule.AVATAR_PALETTE.length).toBeGreaterThan(0);
      expect('INITIAL_PEOPLE' in dataModule).toBe(false);

      const dataSource = fs.readFileSync(
        path.resolve(process.cwd(), 'lib/data.ts'),
        'utf8'
      );
      expect(dataSource).not.toContain('INITIAL_PEOPLE');
      expect(dataSource).not.toContain('@example.invalid');
      expect(dataSource).not.toContain('Demo Person');
    });
  });

  describe('Workspace Route (app/workspace/page.tsx) & WorkspaceShell SSR', () => {
    test('resolveWorkspacePageState redirects unauthenticated visitors to /login?next=%2Fworkspace', async () => {
      const state = await resolveWorkspacePageState({
        getSession: async () => null,
        loadPeople: () => SAMPLE_PEOPLE,
      });

      expect(state).toEqual({
        redirectTo: '/login?next=%2Fworkspace',
        user: null,
        people: [],
      });
    });

    test('unauthenticated WorkspacePage throws 307 NEXT_REDIRECT to /login?next=%2Fworkspace', async () => {
      let caughtDigest = '';
      try {
        await WorkspacePage();
      } catch (err) {
        caughtDigest = (err as { digest?: string })?.digest ?? '';
      }
      expect(caughtDigest).toBe('NEXT_REDIRECT;replace;/login?next=%2Fworkspace;307;');
    });

    test('resolveWorkspacePageState hydrates user and people when authenticated', async () => {
      const state = await resolveWorkspacePageState({
        getSession: async () => ({
          ...DEMO_USER,
          iat: 1000,
          exp: 9999999999,
        }),
        loadPeople: () => SAMPLE_PEOPLE,
      });

      expect(state.redirectTo).toBeNull();
      expect(state.user).toEqual(DEMO_USER);
      expect(state.people).toEqual(SAMPLE_PEOPLE);
    });

    test('WorkspaceShell renders full Bento workspace views, people roster, and user profile menu', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkspaceShell, {
          initialPeople: SAMPLE_PEOPLE,
          user: DEMO_USER,
        })
      );

      expect(html).toContain('id="app"');
      expect(html).toContain('aria-label="Grovia workspace"');
      expect(html).toContain('role="tablist"');
      expect(html).toContain('id="view-overview"');
      expect(html).toContain('id="view-people"');
      expect(html).toContain('id="view-payroll"');
      expect(html).toContain('id="invite-dialog"');
      expect(html).toContain('id="demo-dialog"');
      expect(html).toContain('id="book-demo-btn"');
      expect(html).toContain('Book a demo');
      expect(html).toContain('id="tray"');
      expect(html).toContain('Demo Person 01');
      expect(html).toContain('Alex Rivera');
      expect(html).toContain('admin@grovia.io');
      expect(html).toContain('Sign out');
    });
  });

  describe('NotificationTray & CalendarCard People Prop-Drilling', () => {
    test('NotificationTray renders prop-drilled people by stable personId even when new hires are prepended, and handles empty people safely', () => {
      const customPeople: Person[] = [
        { ...SAMPLE_PEOPLE[0], id: 'n-new', name: 'Prepended Invite' },
        { ...SAMPLE_PEOPLE[0], id: '0', name: 'Custom Zero' },
        { ...SAMPLE_PEOPLE[1], id: '1', name: 'Custom One' },
        { ...SAMPLE_PEOPLE[2], id: '2', name: 'Custom Two' },
        { ...SAMPLE_PEOPLE[3], id: '3', name: 'Custom Three' },
      ];

      const htmlWithPeople = renderToStaticMarkup(
        React.createElement(NotificationTray, {
          isOpen: true,
          onClose: () => {},
          people: customPeople,
        })
      );
      expect(htmlWithPeople).toContain('Custom One');
      expect(htmlWithPeople).toContain('Custom Two');
      expect(htmlWithPeople).toContain('Custom Three');
      expect(htmlWithPeople).not.toContain('Prepended Invite');

      const htmlEmpty = renderToStaticMarkup(
        React.createElement(NotificationTray, {
          isOpen: true,
          onClose: () => {},
          people: [],
        })
      );
      expect(htmlEmpty).toContain('Notifications');
      expect(htmlEmpty).toContain('Team member');
    });

    test('CalendarCard renders with prop-drilled people and handles empty people array safely', () => {
      const htmlWithPeople = renderToStaticMarkup(
        React.createElement(CalendarCard, { people: SAMPLE_PEOPLE })
      );
      expect(htmlWithPeople).toContain('id="cal"');
      expect(htmlWithPeople).toContain('Weekly team sync');

      const htmlEmpty = renderToStaticMarkup(
        React.createElement(CalendarCard, { people: [] })
      );
      expect(htmlEmpty).toContain('id="cal"');
    });
  });

  describe('InviteModal Validation & POST /api/people Wiring', () => {
    test('validateInviteInput enforces name, email, and role requirements', () => {
      expect(
        validateInviteInput({ name: 'A', email: 'bad', role: '' })
      ).toEqual({
        name: 'Enter their full name.',
        email: 'Enter a valid email address.',
        role: 'Add their role.',
      });

      expect(
        validateInviteInput({
          name: 'Maya Lin',
          email: 'maya@grovia.io',
          role: 'Staff Engineer',
        })
      ).toEqual({});
    });

    test('submitInvitePersonRequest handles 201 created, 409 duplicate, 401 unauthorized, 400 validation, and network errors', async () => {
      const createdPerson: Person = {
        id: 'n-101',
        name: 'Maya Lin',
        email: 'maya@grovia.io',
        role: 'Staff Engineer',
        team: 'Engineering',
        city: 'Toronto',
        hireDate: '2026-11-18',
        since: 'Invited today',
        status: 'Invited',
        av: '#cfe0c8',
        rate: 40,
      };

      let capturedUrl = '';
      let capturedMethod = '';
      let capturedBody = '';
      const okFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedMethod = String(init?.method ?? 'GET');
        capturedBody = String(init?.body ?? '');
        return new Response(
          JSON.stringify({ success: true, person: createdPerson }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }) as unknown as typeof fetch;

      const created = await submitInvitePersonRequest(
        {
          name: '  Maya Lin  ',
          email: '  MAYA@Grovia.io ',
          role: ' Staff Engineer ',
          team: 'Engineering',
          city: ' Toronto ',
        },
        okFetch
      );

      expect(capturedUrl).toBe('/api/people');
      expect(capturedMethod).toBe('POST');
      expect(JSON.parse(capturedBody)).toEqual({
        name: 'Maya Lin',
        email: 'maya@grovia.io',
        role: 'Staff Engineer',
        team: 'Engineering',
        city: 'Toronto',
      });
      expect(created).toEqual({
        ok: true,
        status: 201,
        person: createdPerson,
      });

      const conflict = await submitInvitePersonRequest(
        {
          name: 'Maya Lin',
          email: 'maya@grovia.io',
          role: 'Staff Engineer',
          team: 'Engineering',
        },
        createJsonFetch(409, {
          success: false,
          error: 'A team member with this email already exists',
        })
      );
      expect(conflict).toEqual({
        ok: false,
        status: 409,
        duplicate: true,
        error: 'A team member with this email already exists',
      });

      const unauth = await submitInvitePersonRequest(
        {
          name: 'Maya Lin',
          email: 'maya@grovia.io',
          role: 'Staff Engineer',
          team: 'Engineering',
        },
        createJsonFetch(401, {
          success: false,
          error: 'Authentication required',
        })
      );
      expect(unauth).toEqual({
        ok: false,
        status: 401,
        unauthorized: true,
        error: 'Authentication required',
      });

      const badReq = await submitInvitePersonRequest(
        {
          name: 'Maya Lin',
          email: 'maya@grovia.io',
          role: 'Staff Engineer',
          team: 'Engineering',
        },
        createJsonFetch(400, {
          success: false,
          error: 'Invalid email address',
        })
      );
      expect(badReq).toEqual({
        ok: false,
        status: 400,
        error: 'Invalid email address',
      });

      const networkErr = await submitInvitePersonRequest(
        {
          name: 'Maya Lin',
          email: 'maya@grovia.io',
          role: 'Staff Engineer',
          team: 'Engineering',
        },
        (async () => {
          throw new Error('offline');
        }) as unknown as typeof fetch
      );
      expect(networkErr.ok).toBe(false);
      if (!networkErr.ok) {
        expect(networkErr.status).toBe(0);
      }
    });

    test('InviteModal SSR markup renders dialog and form fields', () => {
      const html = renderToStaticMarkup(
        React.createElement(InviteModal, {
          isOpen: false,
          onClose: () => {},
          onInvite: () => {},
        })
      );
      expect(html).toContain('id="invite-dialog"');
      expect(html).toContain('id="invite-form"');
      expect(html).toContain('id="invite-name"');
      expect(html).toContain('id="invite-email"');
      expect(html).toContain('id="invite-role"');
      expect(html).toContain('id="invite-team"');
    });
  });

  describe('Header Profile Menu & Sign-Out Wiring', () => {
    test('Header renders Your profile button and account menu with user name/email and Sign out', () => {
      const html = renderToStaticMarkup(
        React.createElement(Header, {
          activeView: 'overview',
          user: DEMO_USER,
          defaultProfileOpen: true,
        })
      );

      expect(html).toContain('aria-label="Your profile"');
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('id="profile-menu"');
      expect(html).toContain('Alex Rivera');
      expect(html).toContain('admin@grovia.io');
      expect(html).toContain('id="sign-out-btn"');
      expect(html).toContain('Sign out');

      const closedHtml = renderToStaticMarkup(
        React.createElement(Header, {
          activeView: 'overview',
          user: DEMO_USER,
        })
      );
      expect(closedHtml).toContain('aria-expanded="false"');
      expect(closedHtml).toContain('id="profile-menu"');
      expect(closedHtml).toContain('hidden=""');
    });

    test('globals.css defines .profile-menu[hidden] rule and valid CSS variables without undefined tokens', () => {
      const css = fs.readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8');

      expect(css).toContain('.profile-menu[hidden]');
      expect(css).toContain('display: none !important;');
      expect(css).toContain('z-index: 60;');
      expect(css).toContain('background: var(--solid);');
      expect(css).toContain('border: 1px solid var(--line-2);');
      expect(css).toContain('border-bottom: 1px solid var(--line);');

      expect(css).not.toContain('--card-solid');
      expect(css).not.toContain('--shadow-lg');
      expect(css).not.toContain('--muted');
      expect(css).not.toContain('--r-pill');
    });

    test('submitLogoutRequest posts to /api/auth/logout and returns boolean status', async () => {
      let calledUrl = '';
      let calledMethod = '';
      const okFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calledUrl = String(input);
        calledMethod = String(init?.method ?? 'GET');
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }) as unknown as typeof fetch;

      const ok = await submitLogoutRequest(okFetch);
      expect(ok).toBe(true);
      expect(calledUrl).toBe('/api/auth/logout');
      expect(calledMethod).toBe('POST');

      const failed = await submitLogoutRequest(
        (async () => {
          throw new Error('network error');
        }) as unknown as typeof fetch
      );
      expect(failed).toBe(false);
    });
  });
});
