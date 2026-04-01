# ASR Changes Log

## 2026-04-01 — Code Style Conformance + Test Coverage

### Code Style (PROJECT-PATTERNS.md Conformance)

- **Decompose authenticate middleware** (`39c9b8c`): 147-line authenticate.mjs split into 12 focused functions with single return point
- **Single-return pattern** applied across 6 commits:
  - TokenDenylist.mjs + setupDatabase.mjs (`9b08e45`)
  - server.mjs error handler + TenantDataStore.mjs (`55e6629`)
  - RskChip.tsx, formatDuration.ts, versionDisplay.tsx (`4a34313`)
- **Naming fixes**: `err` → `thrownError` in GateAttestationSection (`c26abf7`), `col` → `column` in exportExcel (`61da17d`)
- **Long function decomposition** (`627907d`): exportDocuments.mjs (~800 lines → 30 builder functions), questionnaireAdmin.mjs (publishDraft 256 → 12 builders), config.mjs (extracted loadCurrentQuestionnaire)

### Test Coverage

- **Tier 1** (`e5a45fc`): TokenDenylist (14), authenticate (16), scoring (22), requireTenantContext (7) — 59 tests
- **Tier 2** (`cf6ad01`): TenantDataStore (13), yamlValidation (17), route smoke (12) — 42 tests; extracted yamlValidation.mjs from configureFromYaml.mjs for testability
- **Tier 3** (`80d1d6e`): Frontend scoring.ts (23), apiClient.ts (9) — 32 tests; configured Vitest + jsdom + testing-library for frontend workspace
- **Coverage reporting** (`bbf1e5d`): Added @vitest/coverage-v8 with 60% threshold
- **E2E tests** (`099f19b` → `f0fbf0e`): 26 Playwright tests covering health checks, dashboard CRUD, review lifecycle, exports; CI pipeline job added

**Final count**: 166 unit tests + 26 E2E tests = 192 tests, 0 failures

### Infrastructure

- **AuthenticationError alignment** (`710ff49`): Extends core-utils AuthenticationError instead of plain Error

---
