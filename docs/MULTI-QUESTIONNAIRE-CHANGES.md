# Multi-Questionnaire Support

**Created**: 2026-03-16
**Status**: Active

---

## Problem Statement

The questionnaire system uses a `ScoringConfig` singleton (`configId: 'default'`)
to point to ONE live questionnaire version. Publishing any draft overwrites the
global pointer, making it the active questionnaire for all tenants and all new
assessments. This caused a test questionnaire ("Simple ASR", 3 questions, domain
"God of Thunder") to replace the production K12 questionnaire when published —
with no way to revert, edit (published status locks it), or delete (reviews
reference it).

### Root Causes

1. **Single global pointer**: `ScoringConfig.questionnaireVersion` is a singleton.
   Publishing a draft stomps the previous value.
2. **No questionnaire grouping**: Drafts and snapshots are disconnected nodes.
   There is no "template" concept to group versions of the same questionnaire.
3. **No selection at review creation**: `POST /api/reviews` auto-pins to
   whatever `ScoringConfig.questionnaireVersion` says — no user choice.
4. **Hard-coded gate indices**: `GateQuestion.prefillRules` uses fragile
   `(domainIndex, questionIndex)` positional references tied to K12's specific
   domain/question structure. Different questionnaires break them.

### Desired Outcome

- Multiple questionnaires can be simultaneously active
- User selects which questionnaire to use when creating an assessment
- Each questionnaire is a named template with version history
- Gating questions are questionnaire-specific (not global)
- Gate pre-fill rules use stable `questionId` UUIDs instead of positional indices

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Grouping model | New `Questionnaire` template node | Groups drafts + snapshots by name; supports version history per template |
| Gate reference migration | `questionId` UUIDs | Survives question reordering; decouples from positional layout |
| Cleanup timing | One-time Cypher script first | Restores K12 immediately; redesign builds on clean data |
| Scoring parameters | Keep `ScoringConfig` global | dampingFactor, rawMax, thresholds shared across questionnaires for now |
| ScoringConfig changes | Remove `questionnaireVersion` / `questionnaireLabel` | Version pointer moves to `Questionnaire` → `CURRENT_VERSION` → `QuestionnaireSnapshot` |
| Tenant scoping | Deferred | OWNED_BY relationships addressed in PLAN-FULL-MULTITENANCY-USERLOG.md Phase 2–3 |

---

## Phase 0 — Data Cleanup

**Goal**: Delete "Simple ASR" snapshot, orphaned review, restore K12 as live.

### Steps

1. Write `cleanup-simple-asr.cypher` — one-time script (NOT in cypher:setup)
   - Identify Simple ASR `QuestionnaireSnapshot` by label
   - Delete `Review` nodes referencing its version hash + their `Answer` / relationship chains
   - Delete the Simple ASR `QuestionnaireSnapshot`
   - Delete the Simple ASR `QuestionnaireDraft` (status = PUBLISHED)
   - Restore `ScoringConfig.questionnaireVersion` to the K12 version hash
2. Re-activate K12 domains/questions if soft-deactivated (SET `active = true`)
3. Execute via Neo4j browser or `cypher-shell`

### Verification

- `MATCH (s:QuestionnaireSnapshot) RETURN s.version, s.label` — only K12 versions
- `MATCH (r:Review) RETURN r.questionnaireVersion` — no Simple ASR hash
- Frontend dashboard renders K12 reviews correctly

---

## Phase 1 — Questionnaire Template Node (Schema + Migration)

**Goal**: Introduce `Questionnaire` node that groups drafts and snapshots.

### Schema

```
(:Questionnaire {
  questionnaireId: String (UUID),
  name:            String,
  description:     String,
  active:          Boolean,
  createdBy:       String,
  created:         DateTime,
  updated:         DateTime
})
```

### Relationships

```
(:QuestionnaireDraft)-[:BELONGS_TO]->(:Questionnaire)
(:QuestionnaireSnapshot)-[:VERSION_OF]->(:Questionnaire)
(:Questionnaire)-[:CURRENT_VERSION]->(:QuestionnaireSnapshot)
```

### Constraints & Indexes

```cypher
CREATE CONSTRAINT questionnaire_id_unique IF NOT EXISTS
  FOR (q:Questionnaire) REQUIRE q.questionnaireId IS UNIQUE;
CREATE INDEX questionnaire_name_idx IF NOT EXISTS
  FOR (q:Questionnaire) ON (q.name);
CREATE INDEX questionnaire_active_idx IF NOT EXISTS
  FOR (q:Questionnaire) ON (q.active);
```

### Migration (idempotent)

1. For each distinct `QuestionnaireSnapshot.label`, create a `Questionnaire` node
2. Link snapshots via `VERSION_OF`
3. Set `CURRENT_VERSION` to the snapshot matching `ScoringConfig.questionnaireVersion`
4. Link existing `QuestionnaireDraft` nodes via `BELONGS_TO` (match by label)
5. Remove `questionnaireVersion` and `questionnaireLabel` from `ScoringConfig`

### Files

- `api/cypher/008-questionnaire-templates.cypher` (NEW)
- `api/src/setupDatabase.mjs` — add `008` to SCRIPTS

### Verification

- `MATCH (q:Questionnaire)-[:CURRENT_VERSION]->(s) RETURN q.name, s.version`
- `ScoringConfig` has no `questionnaireVersion` property

---

## Phase 2 — API: Questionnaire CRUD + Publish Refactor

**Goal**: API supports template CRUD; publish links to template instead of ScoringConfig.

### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/questionnaire/questionnaires` | List all templates (name, active, current version) |
| POST | `/admin/questionnaire/questionnaires` | Create template (name, description) |
| PATCH | `/admin/questionnaire/questionnaires/:id` | Update name / description / active |
| DELETE | `/admin/questionnaire/questionnaires/:id` | Delete (only if no reviews reference its versions) |

### Modified Endpoints

- **POST `/drafts`** — accepts optional `questionnaireId`; links draft via `BELONGS_TO`
- **POST `/drafts/:draftId/publish`** — links snapshot via `VERSION_OF`, updates
  `CURRENT_VERSION` on `Questionnaire`. Removes `ScoringConfig` version stamp.
- **DELETE `/versions/:version`** — removes ScoringConfig live-version check;
  still blocks if reviews reference the version.

### Modified Modules

- `scoring.mjs` — `loadScoringConfiguration()` no longer reads `questionnaireVersion`
- `config.mjs` — `GET /api/config` includes `questionnaires` array
- `config.mjs` — `GET /api/config/versions` accepts `?questionnaireId=` filter
- `configureFromYaml.mjs` — creates/updates `Questionnaire` node; removes
  `ScoringConfig.questionnaireVersion` stamp

### Files

- `api/src/routes/questionnaireAdmin.mjs` (MODIFY — major)
- `api/src/scoring.mjs` (MODIFY)
- `api/src/routes/config.mjs` (MODIFY)
- `api/src/configureFromYaml.mjs` (MODIFY)

### Verification

- POST `/questionnaires` → 201 with `questionnaireId`
- Publish updates `CURRENT_VERSION` on `Questionnaire`
- `ScoringConfig` untouched by publish
- `npm run cypher:configure` creates `Questionnaire` node

---

## Phase 3 — API: Review Creation with Questionnaire Selection

**Goal**: Reviews explicitly linked to a questionnaire; selection at creation.

### Changes

- **POST `/api/reviews`** — accepts optional `questionnaireId`
  - If provided → resolve `CURRENT_VERSION`, pin review to that snapshot
  - If omitted, 1 active questionnaire → auto-select (backward compat)
  - If omitted, multiple active → 400 `"questionnaireId required"`
  - Creates `(:Review)-[:USES_QUESTIONNAIRE]->(:Questionnaire)` relationship
  - `questionnaireVersion` still set on Review (snapshot pinning)
- **GET `/api/reviews`** — includes `questionnaireName` in response
- **Migration** — backfill `USES_QUESTIONNAIRE` for existing reviews by matching
  `questionnaireVersion` → snapshot → `VERSION_OF` → `Questionnaire`

### Files

- `api/src/routes/reviews.mjs` (MODIFY)
- `api/cypher/008-questionnaire-templates.cypher` (backfill migration)

### Verification

- POST `/reviews` with `questionnaireId` → creates linked review
- Auto-selection works with single active questionnaire
- 400 with multiple active and no selection
- Review list shows `questionnaireName`

---

## Phase 4 — Frontend: Questionnaire Selection

**Goal**: Create Assessment dialog shows questionnaire picker when multiple are active.

### Changes

- `apiClient.ts` — add `fetchQuestionnaires()`, modify `createReview()` to
  accept `questionnaireId`
- `types.ts` — add `Questionnaire` interface, add `questionnaireName` to
  `ReviewSummary`
- `DashboardPage.tsx` — Create dialog:
  - 1 active → auto-select, show read-only label
  - Multiple active → `<Select>` dropdown
  - 0 active → error message
  - Add "Questionnaire" column to review list table
- `QuestionnaireEditorPage.tsx` — template management section:
  - List templates with active/inactive toggle
  - Draft creation associates with template
  - Publish shows target template
  - Version history grouped by template

### Files

- `frontend/src/lib/apiClient.ts` (MODIFY)
- `frontend/src/lib/types.ts` (MODIFY)
- `frontend/src/pages/DashboardPage.tsx` (MODIFY)
- `frontend/src/pages/QuestionnaireEditorPage.tsx` (MODIFY)

### Verification

- Create dialog shows questionnaire picker
- "Questionnaire" column in review list
- Editor shows template grouping

---

## Phase 5 — Gate Migration: Per-Questionnaire + questionId

**Goal**: Gates associate with specific questionnaires; prefillRules use `questionId`.

### Schema

```
(:GateQuestion)-[:APPLIES_TO]->(:Questionnaire)
```

### Changes

1. **Migration** — link existing `GateQuestion` nodes to K12 `Questionnaire`
   via `APPLIES_TO`; transform `prefillRules` from
   `{domainIndex, questionIndex, choiceIndex}` →
   `{questionId, choiceIndex}` using Question node lookup
2. **`gates.mjs`** — `GET /gates` accepts `?questionnaireId=` filter via
   `APPLIES_TO`; `applyPreFillRules()` resolves by `questionId` instead of
   positional indices
3. **`004-seed-gates.cypher`** — update prefillRules format; link to
   questionnaire
4. **Review gate loading** — filter gates by review's questionnaire via
   `USES_QUESTIONNAIRE`

### Files

- `api/cypher/008-questionnaire-templates.cypher` (EXTEND — gate migration)
- `api/cypher/004-seed-gates.cypher` (MODIFY)
- `api/src/routes/gates.mjs` (MODIFY — major)
- `api/src/routes/reviews.mjs` (MODIFY — gate filter)
- Frontend gate components (MODIFY — pass `questionnaireId`)

### Verification

- `MATCH (g:GateQuestion)-[:APPLIES_TO]->(q:Questionnaire) RETURN g.gateId, q.name`
- GET `/gates?questionnaireId=...` returns correct subset
- Gate pre-fill creates correct answers via `questionId` resolution

---

## End-to-End Verification

1. Fresh install: `cypher:setup` → `cypher:configure` → one active `Questionnaire`
2. Create second questionnaire via editor → publish → two active templates
3. Create assessment → pick questionnaire → review pinned to selected version
4. Gate answers trigger prefillRules via `questionId` → correct answers
5. Existing K12 reviews unaffected (load from pinned snapshot)
6. Deactivate questionnaire → disappears from create dropdown
7. Delete questionnaire → blocked if reviews reference its versions

---

## Future Considerations

1. **Per-questionnaire scoring parameters** — If different questionnaires need
   different `dampingFactor` / `rawMax`, move scoring config to per-Questionnaire.
   Revisit when concrete use case arises.
2. **Gate editor UI** — No gate CRUD in frontend yet. Create gates via YAML
   import or Cypher scripts.
3. **Backward compatibility** — Existing reviews need `USES_QUESTIONNAIRE`
   backfill via `version → snapshot → Questionnaire` chain.
