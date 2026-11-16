# Project: Grovia Fullstack Prototype

## Architecture
- **Framework & Runtime**: Next.js 15 App Router + React 19 + Bun (runtime, package manager, and test runner).
- **Styling & Design System**: Tailwind CSS with CSS Variables for Grovia warm pale green palette, Outfit & Inter fonts, 26-icon SVG sprite, 38px/28px rounded bento cards, inset white hairline elevation.
- **Motion & Physics Engine**: GSAP 3.15 + Flip plugin wrapped in `@gsap/react` (`useGSAP`) with strict `prefers-reduced-motion` compliance. Zero layout property animations (strictly compositor `transform` and `opacity`).
- **Backend & Persistence**: Next.js App Router route handlers (`app/api/.../route.ts`) backed by `bun:sqlite` for microsecond transactional data storage (waitlist, leads, inquiry tickets, real-time metrics).
- **Quality & Standards**: 100 score in `react-doctor@latest`, adherence to Google Chrome Modern Web Guidance (LCP prioritization, INP 50ms task slicing with `scheduler.yield()`, CLS containment, full WCAG keyboard and focus accessibility).
- **Repository & CI/CD**: Public GitHub repository (`katsugtgz/grovia-app`) with automated GitHub Actions CI/CD pipeline using `oven-sh/setup-bun@v2`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Bun Scaffolding & Tooling | Next.js 15, React 19, TypeScript, Bun package management (single `bun.lock`), `bun test` runner | M1 | survey |
| 2 | Design Tokens & Global CSS | Warm pale green bento palette, elevation hairline, shadows, border radii | M1 | survey |
| 3 | Typography & SVG Icon Sprite | Self-hosted Outfit & Inter fonts, 26 SVG icons sprite (`Icon.tsx`), accessibility labels | M1 | survey |
| 4 | Shell Layout & Navigation Bar | Responsive container, brand conic dot, sliding navigation pill with direction-aware delays | M1 | survey |
| 5 | Template Core & Procedural Avatars | Configuration normalization, URL escaping, procedural SVG avatar generator (`no(look)`) | M1 | survey |
| 6 | Database Engine (`bun:sqlite`) | SQLite schema, tables for waitlist & inquiries, indexing, singleton client | M2 | survey |
| 7 | System Health Endpoint | `GET /api/health` reporting uptime, version, runtime, and DB health | M2 | survey |
| 8 | SaaS Metrics Endpoint | `GET /api/metrics` returning live pipeline, team stats, benchmark quartiles | M2 | survey |
| 9 | ROI & Growth Calculator Endpoint | `POST /api/roi` computing projected revenue, conversion lift, ROI trajectory | M2 | survey |
| 10 | Waitlist Booking Endpoint | `GET & POST /api/waitlist` with Zod validation, deduplication, persistent store | M2 | survey |
| 11 | Inquiries Management Endpoint | `GET, POST, PATCH /api/inquiries` ticketing system with status workflow | M2 | survey |
| 12 | App Entrance Choreography | Cascading 1.6s entrance timeline (`power3.out`, `back.out(2)`, `power4.out` text split) | M3 | survey |
| 13 | Overview View & Bento Grid | Full Overview dashboard: animated greeting, hiring rail, stats counter row | M3 | survey |
| 14 | Profile Bento Card | Portrait avatar, role, glass compensation chip with 3D parallax tilt physics | M3 | survey |
| 15 | Progress Bento Card | Workday average (6.6h), interactive 7-day bar chart with animated tooltip | M3 | survey |
| 16 | Circular Stopwatch Dial Card | SVG circular arc timer, sweep dot (6°/s), 60 ticks, digit roller, play/pause/reset/alarm | M3 | survey |
| 17 | Onboarding Checklist Card | Interactive checklist, strike-through, counter roll, 14-particle celebration burst | M3 | survey |
| 18 | Accordion & Calendar Cards | Expandable accordion sections, week calendar with event chips & live red line | M3 | survey |
| 19 | Growth ROI Interactive Card | Client-side interactive ROI calculator wired to `/api/roi` endpoint | M3 | survey |
| 20 | People View with GSAP Flip | Real-time search, team category filter pills with Flip layout morphing, selectable table, action tray | M3 | survey |
| 21 | Payroll View & PDF Export | Teammate selector, monthly timesheet calendar, paystub calculations, client-side PDF export | M3 | survey |
| 22 | Modal Dialogs | Native `<dialog>` for Settings, Invite Teammate, and Demo Booking with error shake | M3 | survey |
| 23 | Micro-interactions & Physics | Magnetic button physics (0.28 factor), card hover lift, notification tray bell shake, toasts | M3 | survey |
| 24 | Git & Public GitHub Repository | Git init, commit, `gh repo create grovia-app --public` push | M4 | survey |
| 25 | GitHub Actions CI/CD Pipeline | Workflow running bun install, lint, typecheck, bun test, build, react-doctor gate | M4 | survey |
| 26 | E2E Test Suite Validation | 100% pass on 4 tiers of requirement-driven opaque-box E2E tests | M5 | survey |
| 27 | Adversarial Hardening (Tier 5) | White-box edge-case and boundary verification | M5 | survey |
| 28 | Final react-doctor Quality Gate | `npx react-doctor@latest` achieves 100 score with all green status | M5 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation & Core Shell | Features 1-5: Scaffolding, tokens, typography, SVG sprite, shell layout, template core | none | DONE |
| M2 | Backend API & Persistence | Features 6-11: SQLite schema, 5 API route handlers, Zod validation, API tests | M1 | DONE |
| M3 | UI Views, Bento Grid & Motion | Features 12-23: Overview, People, Payroll, Bento cards, Stopwatch, Modals, GSAP animations | M1, M2 | DONE |
| M4 | GitHub Repo & CI/CD | Features 24-25: Public repository creation, GitHub Actions CI/CD workflow | M1, M2, M3 | DONE |
| M5 | E2E Test Pass & react-doctor Gate | Features 26-28: 100% E2E tests pass (Tiers 1-4), Tier 5 adversarial, react-doctor 100 | M1-M4, E2E | DONE |

## Interface Contracts

### M1 ↔ M2, M3: Base Types & Core Helpers (`lib/types.ts`, `lib/template-core.ts`)
- `ViewType = 'overview' | 'people' | 'payroll'`
- `normalizeView(hash: string): ViewType`
- `Person`: `{ id: string, name: string, role: string, team: string, city: string, hireDate: string, status: 'Active' | 'On leave' | 'Invited', avatar?: string, look?: AppearanceConfig }`
- `Icon`: `<Icon name={IconName} className={string} aria-hidden={boolean} />`

### M2 ↔ M3: API Route Signatures
- `GET /api/health` -> `HealthResponse` `{ status: "ok", timestamp: string, version: string, database: "healthy", system: { runtime: "bun", version: string } }`
- `GET /api/metrics` -> `MetricsResponse` `{ teamCount: number, hiringCount: number, projectsCount: number, pipeline: { interviews: number, hired: number, projectTime: number, output: number }, weeklyWorkdayAverage: number, activeSessions: number, benchmarkQuartile: string }`
- `POST /api/roi` -> In: `{ monthlyTraffic: number, conversionRate: number, averageOrderValue: number, industry?: string }` -> Out: `{ currentMonthlyRevenue: number, projectedMonthlyRevenue: number, projectedConversionRate: number, incrementalMonthlyRevenue: number, incrementalAnnualGain: number, projectedRoiMultiple: string, monthlyTrajectory: Array<{ month: string, revenue: number }> }`
- `GET & POST /api/waitlist` -> In: `{ name: string, email: string, company?: string, teamSize?: string }` -> Out: `{ success: boolean, message: string, position: number }`
- `GET, POST, PATCH /api/inquiries` -> POST In: `{ name: string, email: string, subject: string, message: string, priority?: string }` -> Out: `{ success: boolean, ticketId: string, status: string }`

## Code Layout
- `app/`: Next.js App Router (layout, page, route handlers, globals.css)
- `components/`: UI components (Header, views, cards, modals, ui)
- `lib/`: DB client (`db.ts`), TypeScript definitions (`types.ts`), analytics (`analytics.ts`), core helpers (`template-core.ts`)
- `tests/`: Bun test suite (API tests, core logic tests)
- `public/`: Static assets (`photos/grovia/demo-avatar.svg`, favicon)
- `.github/workflows/`: CI/CD pipeline definition (`ci.yml`)
