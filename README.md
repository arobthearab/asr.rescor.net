# ASR (Application Security Review)

ASR is evolving from a legacy prototype (`legacy/`) into a modern React/MUI adjunct to Testing Center.

## Current State
- Legacy prototype exists under `legacy/` with STORM + StackMap based risk assessment UI.
- Modern frontend scaffold now lives under `frontend/`.
- Shared behavior with Testing Center is currently replicated in ASR and explicitly tracked for later extraction.

## Near-Term Goals
1. Preserve legacy functional coverage (asset value, threat probability/impact, vulnerability exposure, control efficacy).
2. Rebuild ASR UX in React/MUI using Testing Center conventions where practical.
3. Track every replication in `docs/REPLICATION-LOG.md` so common modules can be extracted into shared packages later.

## Project Patterns

See [PROJECT-PATTERNS.md](PROJECT-PATTERNS.md) for ASR-specific conventions.
Cross-project patterns (DB2, secrets, code style, CLI) are in
[core.rescor.net/docs/PROJECT-PATTERNS.md](../core.rescor.net/docs/PROJECT-PATTERNS.md).

## Development (frontend)
- `cd frontend`
- `npm install`
- `npm run dev`
- `npm run stack:dev` (recommended: runs `rescor` preflight + API VitalSigns + frontend dev, and cleans up API on exit)

## Development (graph API, relational)
- `cd api`
- `npm install`
- `npm run start`

The frontend uses `GET/PUT /asr/graph` and, in dev mode, proxies `/asr/*` to `http://localhost:5180`.

API implementation notes:
- DB access uses `@rescor/core-db` operation abstractions.
- Logging uses `Recorder` from `@rescor/core-utils`.
- Lifecycle orchestration uses VitalSigns (`npm run vitals:start|status|stop|force`).
- DB adapter is selected by `ASR_DB_ADAPTER` (`sqlite` default, `db2` supported via core-db adapter factory).

Stack lifecycle commands (from `frontend/`) route through API VitalSigns and use project-scoped `rescor env list --project asr.rescor.net` preflight before start/restart/force:
- `npm run stack:start`
- `npm run stack:status`
- `npm run stack:stop`
- `npm run stack:restart`
- `npm run stack:force`
