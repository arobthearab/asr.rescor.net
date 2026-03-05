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

As of 2026-03-04: **102 nodes** (2 Answer nodes from test data).

| Label                  | Count | Key Properties                                               | Uniqueness Constraint        |
| ---------------------- | ----: | ------------------------------------------------------------ | ---------------------------- |
| `ScoringConfig`        |     1 | configId, dampingFactor=4, rawMax=134, ratingThresholds, ratingLabels | `configId`            |
| `WeightTier`           |     4 | name (Critical/High/Medium/Info), value (100/67/33/13)       | `name`                       |
| `ScoreScale`           |     1 | Template choice-score arrays for 3/4/5-option questions      | —                            |
| `ClassificationQuestion` |   1 | text, naAllowed                                              | —                            |
| `ClassificationChoice` |     5 | text, factor (40–100), sortOrder                             | —                            |
| `Domain`               |     7 | domainIndex, name, policyRefs[], csfRefs[], ferpaNote, soxNote | `domainIndex`              |
| `Question`             |    48 | domainIndex, questionIndex, text, weightTier, choices[], choiceScores[], naScore | composite `(domainIndex, questionIndex)` |
| `Review`               |     1 | reviewId (UUID), applicationName, assessor, status, classificationChoice, classificationFactor, rskRaw, rskNormalized, rating, notes, active, created/updated/createdBy/updatedBy | `reviewId` |
| `Answer`               |     2 | domainIndex, questionIndex, choiceText, rawScore, weightTier, measurement, notes, created/updated | composite index `(domainIndex, questionIndex)` |
| `Policy`               |    20 | reference, title, description                                | `reference`                  |
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

### Planned Relationships (not yet seeded)

| Pattern                                               | Purpose                    |
| ----------------------------------------------------- | -------------------------- |
| `(Domain)-[:REFERENCES_POLICY]->(Policy)`             | Policy mapping per domain  |
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

## Quick Reference — CLI

```bash
# Start dev (both API + frontend)
npm run dev                       # from workspace root

# Seed Neo4j database
npm run cypher:setup -w api       # runs all 3 cypher files

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
| `api/cypher/003-seed-policies-csf`  | 20 Policies, 12 CsfSubcategories, ALIGNS_TO edges | Semicolon-delimited statements |

---

## References

- [Core Project Patterns](../../core.rescor.net/docs/PROJECT-PATTERNS.md)
- [CLI Reference](../../core.rescor.net/docs/CLI-REFERENCE.md)
