import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { redirect } from 'next/navigation';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { LandingPage } from '@/components/landing/LandingPage';
import {
  LANDING_FEATURES,
  submitWaitlistRequest,
  validateWaitlistInput,
} from '@/components/landing/landing-data';
import { LoginForm } from '@/components/auth/LoginForm';
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASS } from '@/lib/demo-credentials';
import {
  resolveLoginPageState,
  resolveSafeNext,
  submitLoginRequest,
  validateLoginInput,
} from '@/components/auth/login-helpers';
import LoginPage from '@/app/login/page';
import { SEED_PEOPLE } from '@/lib/seed-people';

function createJsonFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

describe('Unit — M2 Landing Page, Login Page & PII Isolation', () => {
  describe('LandingPage SSR & PII Isolation', () => {
    test('renders semantic header, nav, pitch, features, pricing, waitlist form, and zero nested <main>', () => {
      const html = renderToStaticMarkup(React.createElement(LandingPage));

      expect(html).toContain('<header');
      expect(html).toContain('<nav');
      expect(html).toContain('href="#features"');
      expect(html).toContain('href="#pricing"');
      expect(html).toContain('href="#waitlist"');
      expect(html).toContain('href="/login"');
      expect(html).toContain('href="/workspace"');

      // Hero pitch, features & pricing tiers
      expect(html).toContain('id="landing-hero-title"');
      expect(html).toContain('id="features"');
      expect(html).toContain('People directory');
      expect(html).toContain('Guided onboarding');
      expect(html).toContain('Time &amp; capacity tracking');
      expect(html).toContain('Payroll &amp; compliance');
      expect(html).toContain('id="pricing"');
      expect(html).toContain('Starter');
      expect(html).toContain('Growth');
      expect(html).toContain('Enterprise');
      expect(html).toContain('$0');
      expect(html).toContain('$12');

      // Waitlist form controls matching WaitlistRequestSchema
      expect(html).toContain('id="waitlist"');
      expect(html).toContain('name="name"');
      expect(html).toContain('name="email"');
      expect(html).toContain('name="company"');
      expect(html).toContain('name="teamSize"');
      expect(html).toContain('name="useCase"');
      expect(html).toContain('value="1-10"');
      expect(html).toContain('value="11-50"');
      expect(html).toContain('value="51-200"');
      expect(html).toContain('value="200+"');
      expect(html).toContain('type="submit"');

      // Must NOT duplicate <main> (app/layout.tsx already provides <main>)
      expect(html).not.toContain('<main');

      // Must NOT leak seeded employee PII or demo rates
      expect(html).not.toContain('@example.invalid');
      for (const person of SEED_PEOPLE) {
        expect(html).not.toContain(person.name);
        if (person.email) {
          expect(html).not.toContain(person.email);
        }
      }
    });

    test('supports custom header slot without duplicating <header>', () => {
      const customHeader = React.createElement(
        'header',
        { className: 'top', 'data-testid': 'custom-header' },
        'Custom Top'
      );
      const html = renderToStaticMarkup(
        React.createElement(LandingPage, { header: customHeader })
      );

      expect(html).toContain('data-testid="custom-header"');
      expect(html).toContain('Custom Top');
      const headerMatches = html.match(/<header\b/g) ?? [];
      expect(headerMatches.length).toBe(1);
    });

    test('LandingHeader SSR & globals.css enforce smooth scroll, active nav pill styles, LCP reveal without opacity:0, and WCAG AA contrast tokens', () => {
      const headerHtml = renderToStaticMarkup(React.createElement(LandingHeader));
      expect(headerHtml).toContain('class="landing__nav"');
      expect(headerHtml).toContain('aria-label="Landing sections"');
      expect(headerHtml).toContain('class="landing__nav-link" href="#features"');
      expect(headerHtml).toContain('class="landing__nav-link" href="#pricing"');
      expect(headerHtml).toContain('class="landing__nav-link" href="#waitlist"');

      const css = fs.readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8');
      expect(css).toContain('scroll-behavior: smooth;');
      expect(css).toContain('scroll-margin-top: 28px;');
      expect(css).toContain('.landing__nav-link.is-active');
      expect(css).toContain('--dim: #4e4c47;');
      expect(css).toContain('--faint: #56544d;');

      const landingCssStart = css.indexOf('.landing {');
      expect(landingCssStart).toBeGreaterThan(-1);
      const landingCssBlock = css.slice(landingCssStart);
      expect(landingCssBlock).not.toMatch(/opacity\s*:\s*0(?:\s*;|\s*!important|\s*\})/);

      const landingPageSource = fs.readFileSync(
        path.resolve(process.cwd(), 'components/landing/LandingPage.tsx'),
        'utf8'
      );
      expect(landingPageSource).not.toContain('opacity: 0');

      const loginFormSource = fs.readFileSync(
        path.resolve(process.cwd(), 'components/auth/LoginForm.tsx'),
        'utf8'
      );
      expect(loginFormSource).not.toContain('opacity: 0');
    });

    test('components/landing/ has zero imports from data/seed-people/workspace views and uses only valid sprite icons', () => {
      const landingDir = path.resolve(process.cwd(), 'components/landing');
      const files = fs.readdirSync(landingDir).filter((file) => /\.(ts|tsx)$/.test(file));
      expect(files.length).toBeGreaterThan(0);

      const iconSource = fs.readFileSync(
        path.resolve(process.cwd(), 'components/ui/Icon.tsx'),
        'utf8'
      );
      const validIconNames = new Set(
        Array.from(iconSource.matchAll(/id="i-([^"]+)"/g), (match) => match[1])
      );

      for (const file of files) {
        const content = fs.readFileSync(path.join(landingDir, file), 'utf8');
        expect(content).not.toContain('@/lib/data');
        expect(content).not.toContain('@/lib/seed-people');
        expect(content).not.toContain('@/components/views');
        expect(content).not.toContain('@/components/cards');
        expect(content).not.toContain('NotificationTray');
        expect(content).not.toContain('use-entrance-timeline');
        expect(content).not.toContain('INITIAL_PEOPLE');
        expect(content).not.toContain('SEED_PEOPLE');
        expect(content).not.toContain('example.invalid');
        expect(content).not.toContain('<main');

        for (const match of content.matchAll(/<Icon\s+name="([^"]+)"/g)) {
          expect(validIconNames.has(match[1])).toBe(true);
        }
      }

      for (const feature of LANDING_FEATURES) {
        expect(validIconNames.has(feature.icon)).toBe(true);
      }
    });
  });

  describe('Waitlist Validation & POST /api/waitlist Helper', () => {
    test('validateWaitlistInput rejects invalid inputs and accepts valid payload', () => {
      const invalid = validateWaitlistInput({
        name: '   ',
        email: 'not-an-email',
        company: '',
        teamSize: '11-50',
        useCase: '',
      });
      expect(invalid.name).toBeDefined();
      expect(invalid.email).toBeDefined();

      const valid = validateWaitlistInput({
        name: 'Jordan Taylor',
        email: 'Jordan@Acme.io',
        company: 'Acme Labs',
        teamSize: '11-50',
        useCase: 'Onboarding automation',
      });
      expect(valid).toEqual({});
    });

    test('submitWaitlistRequest handles 201 position, 409 duplicate email, 400 validation error, and network error', async () => {
      const baseValues = {
        name: 'Jordan Taylor',
        email: 'Jordan@Acme.io',
        company: 'Acme Labs',
        teamSize: '11-50',
        useCase: 'Team onboarding',
      };

      let capturedUrl = '';
      let capturedBody = '';
      const okFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedBody = String(init?.body ?? '');
        return new Response(
          JSON.stringify({ success: true, message: 'Added to waitlist', position: 7 }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }) as unknown as typeof fetch;

      const created = await submitWaitlistRequest(baseValues, okFetch);
      expect(capturedUrl).toBe('/api/waitlist');
      expect(JSON.parse(capturedBody)).toEqual({
        name: 'Jordan Taylor',
        email: 'jordan@acme.io',
        company: 'Acme Labs',
        teamSize: '11-50',
        useCase: 'Team onboarding',
      });
      expect(created).toEqual({ ok: true, position: 7, message: 'Added to waitlist' });

      const conflict = await submitWaitlistRequest(
        baseValues,
        createJsonFetch(409, {
          success: false,
          error: 'Email already registered on the waitlist',
        })
      );
      expect(conflict).toEqual({
        ok: false,
        status: 409,
        duplicate: true,
        error: 'Email already registered on the waitlist',
      });

      const badRequest = await submitWaitlistRequest(
        baseValues,
        createJsonFetch(400, { success: false, error: 'Invalid email address' })
      );
      expect(badRequest).toEqual({
        ok: false,
        status: 400,
        error: 'Invalid email address',
      });

      // 429 / 5xx without a useful JSON body must not blame the user's input.
      const rateLimited = await submitWaitlistRequest(
        baseValues,
        createJsonFetch(429, null)
      );
      expect(rateLimited).toEqual({
        ok: false,
        status: 429,
        error: 'Too many requests right now. Please wait a moment and try again.',
      });

      const serverError = await submitWaitlistRequest(
        baseValues,
        createJsonFetch(503, null)
      );
      expect(serverError.ok).toBe(false);
      if (!serverError.ok) {
        expect(serverError.status).toBe(503);
        expect(serverError.error).toBe(
          'We are having trouble on our side. Please try again in a little bit.'
        );
        expect(serverError.error).not.toContain('check your details');
      }

      const failingFetch = (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;
      const networkErr = await submitWaitlistRequest(baseValues, failingFetch);
      expect(networkErr.ok).toBe(false);
      if (!networkErr.ok) {
        expect(networkErr.status).toBe(0);
      }
    });
  });

  describe('LoginForm SSR, Validation & Submit Helper', () => {
    test('renders accessible email/password inputs, back link to /, submit button, demo credentials, and no <main>', () => {
      const html = renderToStaticMarkup(
        React.createElement(LoginForm, {
          nextPath: '/workspace?tab=people',
          showDemoCredentials: true,
        })
      );

      expect(html).toContain('<header');
      expect(html).toContain('href="/"');
      expect(html).toContain('Back to home');
      expect(html).toContain('for="login-email"');
      expect(html).toContain('id="login-email"');
      expect(html).toContain('type="email"');
      expect(html).toContain('name="email"');
      expect(html).toContain('for="login-password"');
      expect(html).toContain('id="login-password"');
      expect(html).toContain('type="password"');
      expect(html).toContain('name="password"');
      expect(html).toContain('type="submit"');
      expect(html).toContain('Use demo account');
      expect(html).toContain(DEMO_ADMIN_EMAIL);
      expect(html).toContain(DEMO_ADMIN_PASS);
      expect(html).not.toContain('<main');
      expect(html).not.toContain('@example.invalid');
    });

    test('omits demo credentials unless the server-derived flag is set', () => {
      const html = renderToStaticMarkup(
        React.createElement(LoginForm, { nextPath: '/workspace' })
      );

      expect(html).not.toContain('Use demo account');
      expect(html).not.toContain(DEMO_ADMIN_PASS);
      expect(html).toContain('type="password"');
    });

    test('validateLoginInput & submitLoginRequest handle 200, 401, 400, and network error', async () => {
      expect(validateLoginInput('bad-email', '')).toEqual({
        email: 'Enter a valid email address.',
        password: 'Password is required.',
      });
      expect(validateLoginInput('admin@grovia.io', 'grovia-demo-2026')).toEqual({});

      const okRes = await submitLoginRequest(
        'Admin@Grovia.io',
        'grovia-demo-2026',
        createJsonFetch(200, {
          success: true,
          user: { id: 1, email: 'admin@grovia.io', name: 'Alex Rivera', role: 'admin' },
        })
      );
      expect(okRes).toEqual({
        ok: true,
        user: { id: 1, email: 'admin@grovia.io', name: 'Alex Rivera', role: 'admin' },
      });

      const unauthRes = await submitLoginRequest(
        'admin@grovia.io',
        'wrong-pass',
        createJsonFetch(401, { success: false, error: 'Invalid email or password' })
      );
      expect(unauthRes).toEqual({
        ok: false,
        status: 401,
        error: 'Invalid email or password',
      });

      const badRes = await submitLoginRequest(
        'bad',
        'x',
        createJsonFetch(400, { success: false, error: 'Invalid email address' })
      );
      expect(badRes).toEqual({
        ok: false,
        status: 400,
        error: 'Invalid email address',
      });

      const networkErr = await submitLoginRequest('admin@grovia.io', 'pass', (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch);
      expect(networkErr.ok).toBe(false);
    });
  });

  describe('LoginPage Server Component & Open-Redirect Sanitization', () => {
    test('resolveSafeNext preserves safe relative paths and blocks open redirects including %5c', () => {
      expect(resolveSafeNext('/workspace')).toBe('/workspace');
      expect(resolveSafeNext('/workspace?tab=people')).toBe('/workspace?tab=people');
      expect(resolveSafeNext('/workspace?tab=payroll#top')).toBe('/workspace?tab=payroll#top');
      expect(resolveSafeNext(['/workspace?tab=people', '//evil.com'])).toBe(
        '/workspace?tab=people'
      );

      expect(resolveSafeNext(undefined)).toBe('/workspace');
      expect(resolveSafeNext('')).toBe('/workspace');
      expect(resolveSafeNext('//evil.com')).toBe('/workspace');
      expect(resolveSafeNext('///evil.com')).toBe('/workspace');
      expect(resolveSafeNext('https://evil.com')).toBe('/workspace');
      expect(resolveSafeNext('/\\evil.com')).toBe('/workspace');
      expect(resolveSafeNext('/%5cevil.com')).toBe('/workspace');
      expect(resolveSafeNext('/%2f/evil.com')).toBe('/workspace');
      expect(resolveSafeNext('javascript:alert(1)')).toBe('/workspace');
      expect(resolveSafeNext('evil.com')).toBe('/workspace');
    });

    test('resolveLoginPageState signals redirect when authenticated and stays on login when unauthenticated', async () => {
      const unauthState = await resolveLoginPageState({
        rawNext: '/workspace?tab=people',
        getSession: async () => null,
      });
      expect(unauthState).toEqual({
        nextPath: '/workspace?tab=people',
        shouldRedirect: false,
      });

      const authState = await resolveLoginPageState({
        rawNext: '/%5cevil.com',
        getSession: async () => ({
          id: 1,
          email: 'admin@grovia.io',
          name: 'Alex Rivera',
          role: 'admin',
          iat: 1000,
          exp: 9999999999,
        }),
      });
      expect(authState).toEqual({
        nextPath: '/workspace',
        shouldRedirect: true,
      });
    });

    test('unauthenticated LoginPage renders LoginForm SSR markup without nested <main>', async () => {
      // Demo disallowed (prod, no opt-in) short-circuits the hint gate before
      // any DB lookup; scoped restore keeps ambient DB_PATH/ADMIN_* inert and
      // prevents initializing the project/user database in this SSR test.
      const mutableEnv = process.env as Record<string, string | undefined>;
      const prevNodeEnv = mutableEnv.NODE_ENV;
      const prevAllowDemoAdmin = mutableEnv.ALLOW_DEMO_ADMIN;
      mutableEnv.NODE_ENV = 'production';
      delete mutableEnv.ALLOW_DEMO_ADMIN;
      try {
        const element = await LoginPage({
          searchParams: Promise.resolve({ next: '/workspace?tab=people' }),
        });
        const html = renderToStaticMarkup(element);

        expect(html).toContain('Sign in to Grovia');
        expect(html).toContain('type="email"');
        expect(html).toContain('type="password"');
        expect(html).not.toContain('<main');
      } finally {
        mutableEnv.NODE_ENV = prevNodeEnv;
        if (prevAllowDemoAdmin === undefined) delete process.env.ALLOW_DEMO_ADMIN;
        else process.env.ALLOW_DEMO_ADMIN = prevAllowDemoAdmin;
      }
    });

    test('next/navigation redirect throws 307 NEXT_REDIRECT to sanitized target', () => {
      let caughtDigest = '';
      try {
        redirect('/workspace');
      } catch (err) {
        caughtDigest = (err as { digest?: string })?.digest ?? '';
      }
      expect(caughtDigest).toBe('NEXT_REDIRECT;replace;/workspace;307;');
    });
  });
});
