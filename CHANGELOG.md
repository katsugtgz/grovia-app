# Changelog

All notable changes to **Grovia** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-17

### Added

- **Fullstack Next.js 15 + React 19 + Bun Application**: Overview bento dashboard, People directory with GSAP `Flip` layout morphing, Payroll timesheets & client-side PDF export, Notification tray, Settings modal, Invite modal, and Demo booking modal.
- **Motion & Physics Engine**: GSAP 3.15 entrance choreography, character split reveals, 3D portrait parallax tilt, circular SVG stopwatch dial (`6 deg/s`), 14-particle onboarding burst, magnetic buttons (`0.28` factor), and strict `prefers-reduced-motion` support.
- **SQLite Persistence & REST API**: `bun:sqlite` WAL-mode schema (`waitlist`, `inquiries`) with Node serverless fallback (`lib/db.ts`), Zod request validation, and route handlers (`/api/health`, `/api/metrics`, `/api/roi`, `/api/waitlist`, `/api/inquiries`, `/api/inquiries/[id]`).
- **Verification & OSS Infrastructure**: 235 passing tests (unit, contract, integration, scenario), GitHub Actions CI & Netlify CD workflows, MIT license, governance docs, and `100 / 100` score on `npx react-doctor@latest`.
