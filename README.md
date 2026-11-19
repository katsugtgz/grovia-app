<div align="center">

<table>
  <tr>
    <td width="50%" align="center">
      <img src="./public/showcase/01-overview-bento.gif" alt="Overview Bento Grid, Stopwatch Dial, 3D Tilt & Onboarding Particles (30fps)" width="100%" />
      <br />
      <sub><b>1. Overview Bento & Physics</b> — Zero-delay LCP shell, 3D tilt, SVG stopwatch, 14-particle burst</sub>
    </td>
    <td width="50%" align="center">
      <img src="./public/showcase/02-people-flip.gif" alt="People Directory GSAP Flip Morphing, Search & Action Tray (30fps)" width="100%" />
      <br />
      <sub><b>2. People Directory & GSAP Flip</b> — Category filter morphing, live search & bulk action tray</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="./public/showcase/03-payroll-roi.gif" alt="Payroll Timesheet Cycling, PDF Payslips & Growth ROI API (30fps)" width="100%" />
      <br />
      <sub><b>3. Payroll & Growth ROI Engine</b> — Staggered timesheet chips, PDF export & <code>/api/roi</code> model</sub>
    </td>
    <td width="50%" align="center">
      <img src="./public/showcase/04-modals-interactions.gif" alt="Notification Tray, Workspace Settings & Invite Dialog Modals (30fps)" width="100%" />
      <br />
      <sub><b>4. Modals & Micro-Interactions</b> — Bell shake drawer, spring <code>&lt;dialog&gt;</code> & validation shake</sub>
    </td>
  </tr>
</table>

<p>
  <sub>View <a href="./public/showcase/grovia-2x2-showcase-30fps.gif">unified 2×2 30fps composite showcase GIF</a></sub>
</p>

# Grovia Motion — Fullstack SaaS & Workforce Platform

**Production fullstack workspace replicating Grovia's Bento design & GSAP 3.15 choreography, backed by Bun SQLite, Next.js 15 App Router, Zod APIs, CI/CD, and a 100/100 React Doctor score.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)](https://grovia-motion-fullstack.netlify.app)
[![CI Status](https://github.com/katsugtgz/grovia-app/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/katsugtgz/grovia-app/actions/workflows/ci.yml)
[![React Doctor](https://img.shields.io/badge/React_Doctor-100%2F100_Great-22c55e?style=flat-square)](https://react.doctor)
[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-000000?style=flat-square&logo=next.js)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react)](https://react.dev)
[![Bun](https://img.shields.io/badge/Bun-Package_Manager_%26_SQLite-fbf0df?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)
[![GSAP 3.15](https://img.shields.io/badge/GSAP-3.15_%2B_Flip-88ce02?style=flat-square&logo=greensock&logoColor=black)](https://gsap.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)

**[Live Netlify Deployment](https://grovia-motion-fullstack.netlify.app)** · **[Report Bug](https://github.com/katsugtgz/grovia-app/issues/new?template=bug_report.md)** · **[Request Feature](https://github.com/katsugtgz/grovia-app/issues/new?template=feature_request.md)** · **[Contributing](./CONTRIBUTING.md)**

</div>

---

## Highlights

- **Exact Grovia Aesthetic & Motion Choreography**: Warm sage-green Bento surfaces (`38px` / `28px` radii, inset white hairline elevation), Outfit & Inter typography, 31-glyph SVG sprite (`Icon.tsx`), sliding navigation pill with direction-aware `capL` / `mid` / `capR` GSAP delays, and an immediate zero-opacity-delay shell render (LCP optimization) while preserving interactive GSAP view transitions.
- **Compositor-Only Physics & `prefers-reduced-motion` Safety**: All animations strictly animate GPU-composited `transform` and `opacity` properties via GSAP 3.15 (`Flip`, `quickTo`, `power3.out`, `back.out`, `elastic.out`) and automatically snap when `prefers-reduced-motion: reduce` is enabled.
- **Fullstack Next.js 15 Route Handlers + Bun SQLite (`WAL`)**: Real API persistence for waitlist signups, support inquiries/tickets, hiring pipeline metrics, and dynamic 12-month ROI modeling (`bun:sqlite` locally, with seamless in-memory serverless fallback on Netlify Node runtimes).
- **Google Chrome Modern Web Guidance Aligned**: LCP portrait prioritization (`priority`), non-blocking interactions (INP-friendly transitions), CLS containment, native `<dialog>` modals with ESC/backdrop closing, and semantic ARIA landmarks/tablists.
- **Zero-Defect Verification**: `381/381` passing tests across 48 suites (unit, contract, integration, stress, and live HTTP E2E tiers 1–4), strict ESLint + TypeScript checks, automated GitHub Actions CI & Netlify CD, and **`100 / 100 Great`** on `npx react-doctor@latest`.

---

## Routes, Authentication & Access Control

| Route | Access | Description |
| --- | --- | --- |
| `/` | Public | Marketing landing page with product pitch, Bento feature highlights, pricing tiers, interactive waitlist signup (`POST /api/waitlist`), and zero employee PII in public JS bundles |
| `/login` | Public | Email/password sign-in (`POST /api/auth/login`) with open-redirect-safe `next` target sanitization (`307` -> `/workspace` when already authenticated) |
| `/workspace` | Authenticated | Protected Bento people-ops workspace (`Overview`, `People`, `Payroll`, `InviteModal`, `NotificationTray`, profile/sign-out menu); redirects unauthenticated requests (`307`) to `/login?next=%2Fworkspace` |

- **Seeded Demo Workspace Account**:
  - **Email**: `admin@grovia.io`
  - **Password**: `grovia-demo-2026`
- **Session Signing (`AUTH_SECRET`)**:
  - Edge-compatible Web Crypto HMAC-SHA256 stateless `grovia_session` cookie (`HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`) with server-side revocation on logout.
  - `AUTH_SECRET` (or `SESSION_SECRET`) is **required in production** (fails closed if unset); falls back to a deterministic development secret only in non-production (`development`/`test`) environments. Demo admin seeding in production is disabled unless `ALLOW_DEMO_ADMIN=1` is explicitly configured.

---

## Architecture & Views

| Surface / Module | Capabilities | Implementation |
| --- | --- | --- |
| **Public Landing (`/`)** | Semantic `<header>` + `<main>` landmarks, Bento feature showcase, pricing tiers, waitlist signup form (`POST /api/waitlist`), PII-free client bundle | [`components/landing/LandingPage.tsx`](./components/landing/LandingPage.tsx) |
| **Auth & Edge Guard** | Web Crypto `grovia_session` signing/verification, bounded `decodeURIComponent` open-redirect sanitizer, Edge `middleware.ts`, `/login` UI | [`middleware.ts`](./middleware.ts), [`lib/auth-edge.ts`](./lib/auth-edge.ts), [`components/auth/LoginForm.tsx`](./components/auth/LoginForm.tsx) |
| **Overview Bento** | Animated split-text greeting, hiring pipeline rail (`17% / 15% / 56% / 12%`), live metrics counters, 3D parallax profile card, 7-day progress chart, SVG circular stopwatch (`6°/s`, 60 ticks, digit rollers), 14-particle onboarding checklist, accordion & week calendar, Growth & ROI calculator | [`components/views/OverviewView.tsx`](./components/views/OverviewView.tsx) |
| **People Directory** | Instant search across name/role/team, GSAP `Flip` animated team filter pills (`All`, `Design`, `Engineering`, `Product`, `Operations`), selectable table rows, procedural SVG avatars (`no()`), floating bulk action tray with CSV export | [`components/views/PeopleView.tsx`](./components/views/PeopleView.tsx) |
| **Payroll & PDF Export** | Keyboard-navigable teammate roster, 30-day PRNG timesheet matrix with staggered chip reveals, base + 1.5x overtime & deduction computation, pure client-side binary PDF 1.4 contract & payslip generator | [`components/views/PayrollView.tsx`](./components/views/PayrollView.tsx) |
| **Modals & Tray** | Notification drawer with bell-shake trigger, Workspace Settings dialog (`localStorage` persisted), Invite Teammate dialog (`POST /api/people`) with field-shake validation, Demo Booking modal | [`components/modals/`](./components/modals/) |
| **Persistence Engine** | WAL-mode `bun:sqlite` schema (`users`, `people`, `waitlist`, `inquiries`) with unique indexes, transactional inserts, health probes, and serverless fallback | [`lib/db.ts`](./lib/db.ts) |

---

## REST API Endpoints

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | [`/api/health`](https://grovia-motion-fullstack.netlify.app/api/health) | Public | System status, Bun runtime version, uptime, and SQLite health check |
| `POST` | `/api/roi` | Public | Zod-validated 12-month revenue projection & ROI multiple computation |
| `POST` | `/api/waitlist` | Public | Book waitlist spot with case-insensitive deduplication (`409`) |
| `GET` | `/api/waitlist` | Authenticated | List waitlist entries and total queue count (`401` when unauthenticated) |
| `POST` | `/api/auth/login` | Public | Authenticate user and set `HttpOnly` `grovia_session` cookie |
| `POST` | `/api/auth/logout` | Public | Clear `grovia_session` cookie (`Max-Age=0`) |
| `GET` | `/api/auth/session` | Authenticated | Inspect active session user (`200` authenticated, `401` unauthenticated) |
| `GET`, `POST` | `/api/people` | Authenticated | List employee roster or invite teammate (`201` created, `409` duplicate email) |
| `GET` | `/api/metrics` | Authenticated | Live team/waitlist count, hiring pipeline distribution, and benchmark quartile |
| `GET`, `POST`, `PATCH` | `/api/inquiries` (& `/[id]`) | Authenticated | Create & manage support tickets (`GROV-XXXX`) with status transitions |

<details>
<summary>Quick API verification with <code>curl</code></summary>

```bash
# Health probe
curl -s https://grovia-motion-fullstack.netlify.app/api/health

# Live ROI forecast
curl -s -X POST https://grovia-motion-fullstack.netlify.app/api/roi \
  -H "Content-Type: application/json" \
  -d '{"monthlyTraffic":100000,"conversionRate":3,"averageOrderValue":120}'
```

</details>

---

## Quickstart (Local Development)

> **Tooling policy:** This repository uses **Bun** exclusively for package management (`bun.lock` only) and **`rg`** (ripgrep) for search.

```bash
# 1. Clone repository
git clone https://github.com/katsugtgz/grovia-app.git
cd grovia-app

# 2. Install dependencies strictly via Bun
bun install --frozen-lockfile

# 3. (Optional) Configure custom session secret (falls back to dev secret locally)
export AUTH_SECRET="replace-with-32-byte-secret"

# 4. Run development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public landing page, sign in at [http://localhost:3000/login](http://localhost:3000/login) with `admin@grovia.io` / `grovia-demo-2026`, and access the authenticated workspace at [http://localhost:3000/workspace](http://localhost:3000/workspace) backed by `grovia.db` (`bun:sqlite`).

### Scripts & Quality Gates

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start Next.js 15 development server |
| `bun run build` | Production Next.js build |
| `bun run lint` | Run ESLint (`next lint`) |
| `bun run typecheck` | Strict TypeScript type checking (`tsc --noEmit`) |
| `bun run test` | Run core template/helper tests (`tests/core.test.ts`, invoked by `bun run validate`) |
| `bun test` / `bun run test:all` | Run all 381 tests across 48 suites (unit, stress, E2E tiers 1–4, live HTTP v2) |
| `bun run doctor` | Execute `npx react-doctor@latest` (enforces `100 / 100` score) |
| `bun run validate` | Fast validation pipeline (`lint && typecheck && test && build && doctor`); run `bun test` for the full 48-suite run |

---

## CI/CD & Repository Governance

- **Continuous Integration ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml))**: Runs on every push and PR to `main`: `bun install --frozen-lockfile` → `bun run lint` → `bun run typecheck` → `bun test` → `bun run build` → `npx react-doctor@latest --score` (`100`).
- **Continuous Deployment ([`.github/workflows/cd.yml`](./.github/workflows/cd.yml))**: Automatically builds and deploys `main` to [Netlify Production](https://grovia-motion-fullstack.netlify.app) via `bunx netlify-cli deploy --prod`.
- **Branch Protection**: `main` requires passing `test` status check, up-to-date branches, conversation resolution, pull request review, and disallows force-pushes or branch deletion.
- **Security & Community**: Equipped with [`LICENSE`](./LICENSE) (MIT), [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md), [`SECURITY.md`](./SECURITY.md), [`CHANGELOG.md`](./CHANGELOG.md), Dependabot updates, and PR/Issue templates.

---

## License

Released under the [MIT License](./LICENSE).
