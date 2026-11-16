# E2E Test Infra: Grovia Fullstack Prototype

## Test Philosophy
- **Requirement-Driven**: Derived strictly from `ORIGINAL_REQUEST.md` and `PROJECT.md § Feature Inventory` and interface contracts.
- **Opaque-Box**: Tests treat the application as a black box. Verification operates through public HTTP endpoints, API contracts, exported contract interfaces, and DOM structure / CLI validations without relying on internal private implementations.
- **Progressive Testability**: Early tests (Tier 1 API & core) verify baseline contracts without depending on unfinished higher-level features.
- **Robustness & Negative Testing**: Comprehensive coverage of boundary values, invalid schemas, malformed inputs, SQL injection attempts, and concurrency.
- **Methodology**: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Test Architecture
- **Test Runner**: `bun test`
- **Invocation Command**: `bun test tests/e2e/` (or scoped: `bun test tests/e2e/tier1-features/`)
- **Pass/Fail Semantics**: All test suites must execute cleanly with exit code 0 and 0 assertions failed.
- **Directory Layout**:
  ```
  tests/e2e/
  ├── harness/
  │   ├── test-client.ts            # Opaque HTTP fetch & route handler invocation wrapper
  │   ├── fixtures.ts               # Test payloads, valid/invalid inputs, edge cases
  │   └── assertions.ts             # Schema validation and response assertion helpers
  ├── tier1-features/               # Tier 1: Feature Coverage (>=5 tests per feature)
  │   ├── api-health.test.ts        # F7: System health endpoint
  │   ├── api-metrics.test.ts       # F8: SaaS metrics endpoint
  │   ├── api-roi.test.ts           # F9: ROI & growth calculator endpoint
  │   ├── api-waitlist.test.ts      # F10: Waitlist booking endpoint
  │   ├── api-inquiries.test.ts     # F11: Inquiries ticketing endpoint
  │   ├── template-core.test.ts     # F5: Template core & procedural avatar generator
  │   ├── db-engine.test.ts         # F6: Database engine persistence & indexing
  │   ├── tooling-structure.test.ts # F1-F4: Bun tooling, tokens, typography, shell contracts
  │   └── views-contracts.test.ts   # F13-F23: Bento grid, navigation, modals, physics specs
  ├── tier2-boundaries/             # Tier 2: Boundary & Corner Cases (>=5 per feature)
  │   ├── boundary-api-roi.test.ts       # Zero/negative traffic, extreme AOV, floating rates
  │   ├── boundary-api-waitlist.test.ts  # Malformed emails, 10KB names, duplicate prevention
  │   ├── boundary-api-inquiries.test.ts # Missing fields, invalid status transition, SQL injection
  │   ├── boundary-template-core.test.ts # Missing/null looks, invalid hex, URL safety
  │   └── boundary-db-engine.test.ts     # Transaction rollbacks, SQLite locks, duplicate keys
  ├── tier3-combinations/           # Tier 3: Cross-Feature Interactions (Pairwise combinations)
  │   ├── waitlist-metrics-sync.test.ts     # F8 + F10: Waitlist additions reflect in live metrics
  │   ├── inquiries-status-workflow.test.ts # F11 + F7: Ticket creation -> status PATCH -> audit log
  │   ├── roi-pipeline-integration.test.ts  # F8 + F9: Metrics pipeline data feeds ROI calculations
  │   └── concurrent-access-state.test.ts   # F6 + F10 + F11: Concurrent waitlist + inquiries + DB
  └── tier4-scenarios/              # Tier 4: Real-World Application Scenarios
      ├── enterprise-lead-inquiry-flow.test.ts  # End-to-end enterprise contact & ticket lifecycle
      ├── investor-roi-simulation-flow.test.ts  # Executive ROI modeling across multi-tier scenarios
      ├── launch-waitlist-surge-flow.test.ts    # High-throughput launch day booking simulation
      └── audit-readiness-flow.test.ts          # Full system health, DB integrity & compliance check
  ```

## Feature Coverage Matrix

| # | Feature Name | Requirement / Contract | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|--------------|------------------------|:------:|:------:|:------:|:------:|
| F1 | Bun Scaffolding & Tooling | Next 15, Bun lock, bun test runner | 5 | 5 | ✓ | ✓ |
| F2 | Design Tokens & Global CSS | Bento variables, hairline elevation | 5 | 5 | ✓ | ✓ |
| F3 | Typography & SVG Icon Sprite | Outfit, Inter, 26 SVG icons sprite | 5 | 5 | ✓ | ✓ |
| F4 | Shell Layout & Navigation Bar | Container, conic dot, sliding pill nav | 5 | 5 | ✓ | ✓ |
| F5 | Template Core & Avatars | Config normalize, avatar SVG generator | 6 | 6 | ✓ | ✓ |
| F6 | Database Engine (`bun:sqlite`)| Schema, tables, persistence, indexing | 6 | 6 | ✓ | ✓ |
| F7 | System Health Endpoint | `GET /api/health` ok, uptime, db check | 5 | 5 | ✓ | ✓ |
| F8 | SaaS Metrics Endpoint | `GET /api/metrics` pipeline, quartiles | 5 | 5 | ✓ | ✓ |
| F9 | ROI Calculator Endpoint | `POST /api/roi` trajectory, incremental | 6 | 6 | ✓ | ✓ |
| F10| Waitlist Booking Endpoint | `GET & POST /api/waitlist` validation | 6 | 6 | ✓ | ✓ |
| F11| Inquiries Ticketing Endpoint | `GET, POST, PATCH /api/inquiries` | 6 | 6 | ✓ | ✓ |
| F12-23| UI Views, Cards & Motion | Contracts, types, physics params | 10 | 10 | ✓ | ✓ |
| F24-25| Repo & CI/CD Pipeline | Workflow definition, bun steps | 5 | 5 | ✓ | ✓ |
| **Totals** | | | **64** | **64** | **18** | **12** |

Total Test Cases Target: **158+ tests**.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity | Pass Criteria |
|---|----------|--------------------|------------|---------------|
| 1 | Enterprise Lead & Inquiry Lifecycle | F6, F7, F10, F11, F22 | High | Ingest inquiry, verify DB row, advance status (open->in_progress->resolved), verify audit trail |
| 2 | Executive ROI Modeling & Growth Projection | F8, F9, F19 | High | Model multi-year growth from live pipeline metrics, verify incremental revenue curve monotonicity |
| 3 | Launch Day Waitlist Surge & Concurrency | F6, F8, F10 | High | 50 sequential/concurrent submissions, verify deduplication, position sequentiality, metrics count bump |
| 4 | Full System Health & Audit Readiness | F1, F6, F7, F8, F24, F25 | Medium | Validate healthcheck, DB sanity, schema consistency, configuration validation |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 tests per feature domain. Total ≥ 60.
- **Tier 2 (Boundary & Corner Cases)**: ≥5 tests per feature domain. Total ≥ 60.
- **Tier 3 (Cross-Feature Combinations)**: ≥15 pairwise tests across database, API routes, and state.
- **Tier 4 (Real-World Scenarios)**: ≥4 complete end-user scenario flows (≥12 tests).
- **Global Minimum**: 100% pass on all test files executed via `bun test tests/e2e/`.
