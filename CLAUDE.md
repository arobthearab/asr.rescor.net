# Claude Instructions — asr.rescor.net

## Mandatory: Read Cross-Project Patterns First

Before writing any code or making any changes, read:

```
/Volumes/Overflow/Repositories/core.rescor.net/docs/PROJECT-PATTERNS.md
```

This file defines mandatory patterns for all RESCOR projects:
- Code style (single return point, full words, short functions)
- Secrets policy (Infisical-first, no .env for application config)
- Configuration-First Runtime Policy
- Source control discipline (scoped commits)
- CLI usage patterns
- Build-vs-Buy disclosure

## Project-Specific Patterns

See [docs/PROJECT-PATTERNS.md](docs/PROJECT-PATTERNS.md) for ASR-specific conventions
(Neo4j schema, scoring model, quick-reference CLI commands).

## Key Facts

- Frontend: React 19 + MUI 7 + Vite 6 (TypeScript, port 5174)
- API: Express 4 + @rescor/core-* (ESM `.mjs`, port 3100)
- Database: Neo4j 5.15 Community — dev container `asr-neo4j` on localhost:17687 (prod: thorium.rescor.net:7687, database `asr`)
- Dev container: `docker compose up -d` → `asr-neo4j` on ports 17474 (HTTP) / 17687 (Bolt), creds: neo4j/asrdev123
- Scoring: RSK/STORM model — all parameters loaded from Neo4j (zero hardcoded constants)
- Four tuning dials: ScoringConfig, ClassificationChoice.factor, WeightTier.value, Question.choiceScores
- Core packages: @rescor/core-db (Neo4jOperations), @rescor/core-config (Infisical), @rescor/core-utils
- Cypher DDL: api/cypher/001-constraints, 002-seed-questionnaire, 003-seed-csf
- Client overlay: `--overlay <dir>` CLI arg to cypher:setup for client-specific cypher scripts
- YAML-to-Cypher: `npm run cypher:configure -w api -- <path/to/asr_questions.yaml>`
- npm workspaces: api, frontend
- Dev: `npm run dev` (root), `npm run cypher:setup -w api` (seed Neo4j)
- Dev with client overlay: `npm run cypher:setup -w api -- --overlay /abs/path/to/overlay`
- Dev with client YAML: `npm run cypher:configure -w api -- /abs/path/to/asr_questions.yaml`

## Completed Plans

- [Source × Environment Deployment Taxonomy](docs/PLAN-SOURCE-ENVIRONMENT-TAXONOMY.md) — 9 compound archetypes (Source × Environment)
- [Questionnaire Versioning](docs/PLAN-QUESTIONNAIRE-VERSIONING.md) — Historical checklist snapshots (Phases 1–2 implemented)
