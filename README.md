# asr.rescor.net — Application Security Review

React 19 + MUI 7 web application for conducting Application Security Reviews
with configurable RSK/STORM scoring against a Neo4j graph backend.

## Architecture

```
frontend/   React 19 + MUI 7 + Vite 6 (TypeScript)    → :5174
api/        Express 4 + @rescor/core-* (ESM)           → :3100
neo4j       asr-neo4j container (dev :17687)   prod: thorium:7687
```

## Quick Start

```bash
# 1. Start Neo4j container
docker compose up -d

# 2. Install dependencies
npm install

# 3. Seed Neo4j database (generic defaults)
npm run cypher:setup -w api

# 3a. Or seed with client-specific overlay (from client repo)
ASR_OVERLAY_CYPHER_DIR=../asr.client-a/cypher npm run cypher:setup -w api

# 4. Start dev servers
npm run dev
```

Frontend proxies `/api` requests to `:3100` via Vite config.

## Project Structure

```
api/
  cypher/          Cypher DDL scripts (001-003)
  src/
    server.mjs     Express bootstrap
    database.mjs   Neo4jOperations factory
    scoring.mjs    RSK/STORM scoring engine (fully configurable)
    setupDatabase.mjs   Cypher file runner
    routes/
      config.mjs   GET /api/config — questionnaire + scoring config
      reviews.mjs  CRUD /api/reviews
      answers.mjs  PUT /api/reviews/:id/answers — bulk upsert + scoring

frontend/
  src/
    main.tsx       React root (BrowserRouter + ThemeProvider)
    App.tsx        Route definitions
    theme/         MUI theme (brand colors)
    lib/           Scoring engine mirror, localStorage drafts, API client
    pages/         DashboardPage, ReviewPage
    components/    ClassificationBanner, ScoreDashboard, QuestionCard, DomainSection, ReviewActions

docs/              Project patterns, architecture docs
legacy/            Original asrRisk.html prototype
legacy2/           Previous React + SQLite scaffold
```

## Scoring Model

Four admin-tunable dials for risk calibration:

1. **ScoringConfig** — dampingFactor, rawMax, rating thresholds/labels
2. **Classification factor** — global multiplier (40–100) per review
3. **Weight tier values** — Critical=100, High=67, Medium=33, Info=13
4. **Per-question choiceScores** — fine-grained score arrays

All scoring parameters loaded from Neo4j — zero hardcoded constants.

## Dependencies

- `@rescor/core-db` — Neo4jOperations (graph database access)
- `@rescor/core-config` — Configuration + Infisical secrets
- `@rescor/core-utils` — VitalSigns, ServiceOrchestrator

## References

- [ASR Project Patterns](docs/PROJECT-PATTERNS.md)
- [Core Project Patterns](../core.rescor.net/docs/PROJECT-PATTERNS.md)
