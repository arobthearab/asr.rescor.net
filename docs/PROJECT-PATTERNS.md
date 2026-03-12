# ASR Project Patterns

> Cross-project patterns (secrets, code style, CLI) are in
> **[core.rescor.net/docs/PROJECT-PATTERNS.md](../../core.rescor.net/docs/PROJECT-PATTERNS.md)**.
> This file contains ASR-specific content only.

---

## Architecture

| Layer     | Stack                               | Port  |
| --------- | ----------------------------------- | ----- |
| Frontend  | React 19 + MUI 7 + Vite 6          | 5174  |
| API       | Express 4 + @rescor/core-*          | 3100  |
| Database  | Neo4j 5.15 Community                | 17687 |

### Database

- **Dev container**: `asr-neo4j` via `docker-compose.yml` (ports 17474 HTTP / 17687 Bolt)
- **Production target**: `thorium.rescor.net:7687`, database `asr`
- **Dev creds**: `neo4j / asrdev123`
- **Memory**: heap 256m–512m (dev); Community Edition — single database only

Graph database chosen for policy → CSF → question → answer → gap traversals.

---

## Neo4j Schema — Node Labels

As of 2026-03-12: **82+ nodes** (Policy nodes added by client overlay; snapshots added per import).

| Label                  | Count | Key Properties                                               | Uniqueness Constraint        |
| ---------------------- | ----: | ------------------------------------------------------------ | ---------------------------- |
| `ScoringConfig`        |     1 | configId, dampingFactor=4, rawMax=134, ratingThresholds, ratingLabels, questionnaireVersion, questionnaireLabel | `configId`            |
| `WeightTier`           |     4 | name (Critical/High/Medium/Info), value (100/67/33/13)       | `name`                       |
| `ScoreScale`           |     1 | Template choice-score arrays for 3/4/5-option questions      | —                            |
| `ClassificationQuestion` |   1 | text, naAllowed                                              | —                            |
| `ClassificationChoice` |     5 | text, factor (40–100), sortOrder                             | —                            |
| `Domain`               |    11 | domainIndex, name, csfRefs[]                                 | `domainIndex`              |
| `Question`             |    82 | domainIndex, questionIndex, text, weightTier, choices[], choiceScores[], naScore, applicability[] | composite `(domainIndex, questionIndex)` |
| `Review`               |     — | reviewId (UUID), applicationName, assessor, status, classificationChoice, classificationFactor, sourceChoice, environmentChoice, deploymentArchetype, questionnaireVersion, rskRaw, rskNormalized, rating, notes, active, created/updated/createdBy/updatedBy | `reviewId` |
| `Answer`               |     — | domainIndex, questionIndex, choiceText, rawScore, weightTier, measurement, notes, created/updated | composite index `(domainIndex, questionIndex)` |
| `QuestionnaireSnapshot`|     — | version (12-char SHA), label, data (JSON blob), created      | `version`                    |
| `SourceQuestion`       |     1 | questionId='source', text, naAllowed                         | `questionId`                 |
| `SourceChoice`         |     3 | source (INTERNAL/EXTERNAL/OTS), text, sortOrder              | `source`                     |
| `EnvironmentQuestion`  |     1 | questionId='environment', text, naAllowed                    | `questionId`                 |
| `EnvironmentChoice`    |     3 | environment (CLOUD/ONPREMISE/HYBRID), text, sortOrder        | `environment`                |
| `DeploymentArchetype`  |     9 | code, label, description, source, environment, sortOrder     | `code`                       |
| `Policy`               |     — | reference, title, tag, description (seeded by client overlay) | `reference`                  |
| `CsfSubcategory`       |    12 | code, description                                            | `code`                       |
| `Gap`                  |     0 | gapId (future)                                               | `gapId`                      |
| `SraSection`           |     0 | sectionId (future)                                           | `sectionId`                  |

## Neo4j Schema — Relationships

6 relationship types currently in use:

| Pattern                                               | Count | Purpose                           |
| ----------------------------------------------------- | ----: | --------------------------------- |
| `(Question)-[:BELONGS_TO]->(Domain)`                  |    48 | Domain membership                 |
| `(Question)-[:HAS_WEIGHT]->(WeightTier)`              |    48 | Risk weight assignment            |
| `(ClassificationQuestion)-[:HAS_CHOICE]->(ClassificationChoice)` | 5 | Classification factor options  |
| `(Domain)-[:ALIGNS_TO]->(CsfSubcategory)`             |    12 | NIST CSF 2.0 framework mapping    |
| `(Review)-[:CONTAINS]->(Answer)`                      |     2 | Answers owned by review           |
| `(Answer)-[:ANSWERS]->(Question)`                     |     2 | Answer → question link            |

### Client Overlay Relationships

| Pattern                                               | Purpose                    |
| ----------------------------------------------------- | -------------------------- |
| `(Domain)-[:REFERENCES_POLICY]->(Policy)`             | Policy mapping per domain (client overlay) |

### Planned Relationships (not yet seeded)

| Pattern                                               | Purpose                    |
| ----------------------------------------------------- | -------------------------- |
| `(Answer)-[:IDENTIFIES]->(Gap)`                       | Gap register generation    |
| `(Gap)-[:REFERENCES]->(SraSection)`                   | SRA document cross-ref     |

## Neo4j Schema — Indexes

Beyond constraint-backed indexes, these explicit indexes exist:

| Index Name                      | Label        | Properties                   | Purpose                    |
| ------------------------------- | ------------ | ---------------------------- | -------------------------- |
| `review_active_index`           | Review       | active                       | Filter soft-deleted        |
| `review_status_index`           | Review       | status                       | Filter by DRAFT/SUBMITTED  |
| `question_domain_index`         | Question     | domainIndex                  | Domain query performance   |
| `domain_name_index`             | Domain       | name                         | Name lookups               |
| `answer_domain_question_index`  | Answer       | domainIndex, questionIndex   | Answer upsert performance  |

---

## RSK/STORM Scoring Model — Four Tuning Dials

1. **ScoringConfig node** — dampingFactor, rawMax, ratingThresholds, ratingLabels
2. **ClassificationChoice.factor** — global multiplier per review (40–100)
3. **WeightTier.value** — Critical=100, High=67, Medium=33, Info=13
4. **Question.choiceScores** — per-question override (seeded from ScoreScale templates)

### Formulas

```
measurement = floor(rawScore/100 × weightValue/100 × classificationFactor)
rskRaw      = ceil(Σ V_j / dampingFactor^j)    (V sorted descending)
rskNormalized = min(100, rskRaw / rawMax × 100)
```

All parameters loaded from Neo4j at runtime — zero hardcoded constants.

---

## Questionnaire Version Resilience

When YAML configuration changes, existing reviews must not be corrupted.

### Design Principles

1. **Answer self-containment** — Each Answer snapshots `questionText` (the question wording at answer-time) so historical reviews are readable even if the question is later reworded or removed.
2. **Soft-delete, not hard-delete** — `configureFromYaml` sets `active = false` on deprecated Questions/Domains instead of `DETACH DELETE`. This preserves `Answer → Question` graph links for old reviews.
3. **Version stamp** — A SHA-256 fingerprint (12 hex chars) of the YAML content is stored on `ScoringConfig.questionnaireVersion` and copied to `Review.questionnaireVersion` at review creation time.
4. **Active-only serving** — The `/api/config` endpoint filters `WHERE domain.active = true` and `WHERE question.active = true`, so only current-version questions appear in the assessment UI.

### What Happens on YAML Reconfiguration

| Scenario | Behaviour |
|---|---|
| Question text or choices modified | MERGE updates Question in-place; existing Answers retain their snapshotted `questionText` and `choiceText` |
| Question removed (count reduced) | Question gets `active = false`; old Answer → Question link preserved |
| Domain removed | Domain gets `active = false`; child Questions stay linked |
| New questions added | New Question nodes created with `active = true` |
| Re-added question (same index) | MERGE restores `active = true` on existing node |

### Invariants

- Answers are **immutable snapshots** — `choiceText`, `rawScore`, `weightTier`, `measurement`, `questionText` frozen at submission time.
- A submitted review's RSK score never changes unless explicitly recalculated.
- `Review.questionnaireVersion` records which YAML hash the review was created against.

---

## Quick Reference — CLI

```bash
# Start dev (both API + frontend)
npm run dev                       # from workspace root

# Seed Neo4j database
npm run cypher:setup -w api       # runs all 3 cypher files

# Seed with client overlay (e.g., Stride)
npm run cypher:setup -w api -- --overlay ../asr.k12.com/cypher

# Start API only
npm run dev -w api               # node --watch api/src/server.mjs

# Start frontend only
npm run dev -w frontend           # vite on :5174
```

## Quick Reference — Docker

```bash
# Start ASR Neo4j container (from repo root)
docker compose up -d

# Verify Neo4j health
docker exec asr-neo4j cypher-shell -u neo4j -p asrdev123 'RETURN 1'

# Node inventory
docker exec asr-neo4j cypher-shell -u neo4j -p asrdev123 \
  "MATCH (n) WITH labels(n)[0] AS label, count(*) AS c ORDER BY label RETURN label, c"

# Relationship inventory
docker exec asr-neo4j cypher-shell -u neo4j -p asrdev123 \
  "MATCH ()-[r]->() WITH type(r) AS t, count(*) AS c ORDER BY t RETURN t, c"
```

## Quick Reference — Environment Management

```bash
# Deploy .env from template
rescor env deploy asr.rescor.net

# Validate .env
rescor env validate asr.rescor.net --template .env.example
```

---

## Cypher DDL Files

| File                          | Purpose                               | Notes                          |
| ----------------------------- | ------------------------------------- | ------------------------------ |
| `api/cypher/001-constraints`  | 9 uniqueness + 5 indexes              | Existence constraints commented out (Enterprise-only) |
| `api/cypher/002-seed-questionnaire` | ScoringConfig, 4 WeightTiers, ScoreScale, ClassificationQuestion + 5 choices, 7 Domains, 48 Questions | Uses MERGE for idempotency |
| `api/cypher/003-seed-policies-csf`  | 12 CsfSubcategories, ALIGNS_TO edges               | Policies added by client overlay |

---

## References

- [Core Project Patterns](../../core.rescor.net/docs/PROJECT-PATTERNS.md)
- [CLI Reference](../../core.rescor.net/docs/CLI-REFERENCE.md)
