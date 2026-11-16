# Contributing to Grovia

Thank you for considering contributing to **Grovia**! Every contribution—bug reports, feature ideas, motion refinements, accessibility improvements, or pull requests—is welcome.

## Development Workflow

### Prerequisites

- [Bun](https://bun.sh/) (`>= 1.2.0`) — strictly required as package manager and test runner (`bun.lock` only; do not introduce `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`)
- [ripgrep (`rg`)](https://github.com/BurntSushi/ripgrep) — preferred code search tool

### Setup

```bash
git clone https://github.com/katsugtgz/grovia-app.git
cd grovia-app
bun install --frozen-lockfile
bun run dev
```

### Pull Request Checklist

Before opening a pull request against `main`, run the full local validation gate:

```bash
bun run lint
bun run typecheck
bun test
bun run build
npx react-doctor@latest --score
```

All PRs must:

1. Maintain a **`100 / 100`** score on `npx react-doctor@latest`.
2. Pass `bun run lint`, `bun run typecheck`, `bun test` (all unit & E2E suites), and `bun run build`.
3. Follow compositor-only GSAP animation practices (`transform`, `opacity`) and honor `prefers-reduced-motion`.
4. Keep commits focused with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`).

## Code of Conduct

All participants are expected to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md).
