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
- Database: Neo4j 5.15 Community + APOC plugin — dev container `asr-neo4j` on localhost:17687 (prod: thorium.rescor.net:7687 via `bolt+s://`, database `asr`); APOC TTL purges AuthEvent nodes after 90 days
- Dev container: `docker compose up -d` → `asr-neo4j` on ports 17474 (HTTP) / 17687 (Bolt), creds: neo4j/asrdev123
- Scoring: RSK/STORM model — computation delegated to `StormService` (`api/src/StormService.mjs`, instantiated via `StormService.create({ configuration })`); all tuning parameters loaded from Neo4j
- Four tuning dials: ScoringConfig, ClassificationChoice.factor, WeightTier.value, Question.choiceScores
- Core packages: @rescor/core-db (Neo4jOperations), @rescor/core-config (Infisical), @rescor/core-utils
- Persistence stores (`api/src/persistence/`): UserStore, AuthEventStore (login trail + APOC TTL), AuditEventStore (data-mutation trail), TenantStore (lifecycle management)
- Rate limiting: authLimiter (20 req/15 min per IP on `/api/auth/*`), apiLimiter (300 req/min keyed by `tenantId || ip` on `/api/*`) — `api/src/middleware/rateLimiter.mjs`
- Infisical config keys used at runtime: `entra.tenantId`, `entra.clientId`, `entra.allowedTenants`, `server.corsAllowedOrigins` (comma-separated; absent in dev = allow all)
- Cypher DDL: api/cypher/001-constraints through 012-apoc-ttl (run via cypher:setup); new files must also be registered in api/src/setupDatabase.mjs SCRIPTS array; setup auto-bootstraps a default Questionnaire + Snapshot if none exist
- Default/demo tenant: `tenantId: 'demo'` — all seed migrations stamp global nodes with this ID
- Client overlay: `--overlay <dir>` CLI arg to cypher:setup for client-specific cypher scripts
- YAML-to-Cypher: `npm run cypher:configure -w api -- <path/to/asr_questions.yaml>`
- npm workspaces: api, frontend
- Dev: `npm run dev` (root), `npm run cypher:setup -w api` (seed Neo4j)
- Dev with client overlay: `npm run cypher:setup -w api -- --overlay /abs/path/to/overlay`
- Dev with client YAML: `npm run cypher:configure -w api -- /abs/path/to/asr_questions.yaml`

## Completed Plans

- [Source × Environment Deployment Taxonomy](docs/PLAN-SOURCE-ENVIRONMENT-TAXONOMY.md) — 9 compound archetypes (Source × Environment)
- [Questionnaire Versioning](docs/PLAN-QUESTIONNAIRE-VERSIONING.md) — Historical checklist snapshots (Phases 1–2 implemented)
- [Clickable Chips, SharePoint Links & Entra ID Auth](docs/PLAN-CLICKABLE-CHIPS-AUTH.md) — Configurable compliance chip actions, NIST CSF descriptions, ISP/IISP SharePoint links, MS365/Entra ID authentication
- [RBAC + Multi-Tenancy](docs/PLAN-RBAC-MULTITENANCY.md) — Role-based access control + tenant-scoped isolation; IDOR prevention, rate limiting, CORS, scoring/gate/config scoping, AuditEvent trail, tenant provisioning API, APOC TTL

## Active Plans

_(none currently)_
