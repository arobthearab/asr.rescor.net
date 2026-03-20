# Plan: Historical Questionnaire Versioning

**Status**: Proposed — awaiting review  
**Date**: 2026-03-12

---

## Problem

When the questionnaire YAML is updated (questions added, removed, reworded,
choices changed), `configureFromYaml.mjs` overwrites the active questionnaire
in Neo4j. Reviews created on an earlier version are pinned to a version hash
(`Review.questionnaireVersion`), but the system has no way to reconstruct the
questionnaire structure that existed when the review was created.

Users who started assessments on V1 are forced to see V2 questions, which may
not align with their answers. Choice text mismatches cause `findChoiceIndex`
to return `null`, orphaning saved answers from the UI.

---

## Design: Questionnaire Snapshots

### Core Idea

Each time a YAML file is imported, the pipeline captures the **complete
questionnaire configuration** as a JSON snapshot and stores it in Neo4j.
Historical reviews load their pinned snapshot instead of the current config.

### YAML Metadata (new field)

```yaml
# Added to the top of asr_questions.yaml
questionnaire_label: "v2.0 — Source/Environment Taxonomy"
```

A human-readable name for this version. Optional — the pipeline falls back to
the 12-char SHA hash if omitted. The existing SHA hash remains the canonical
version identifier.

### Neo4j Schema Addition

```
(:QuestionnaireSnapshot {
  version:  String,    // 12-char SHA hash (unique constraint)
  label:    String,    // human-readable label from YAML or hash fallback
  data:     String,    // JSON blob — full config response at import time
  created:  DateTime   // when this version was imported
})
```

**Constraint**: `CREATE CONSTRAINT questionnaire_snapshot_version FOR (qs:QuestionnaireSnapshot) REQUIRE qs.version IS UNIQUE`

**Index**: None beyond the constraint-backed index.

### Pipeline Changes (`configureFromYaml.mjs`)

After generating all Cypher statements for Domains, Questions, etc., add one
final step:

1. Build the same JSON shape that `GET /api/config` returns (domains,
   questions, choices, scoring config, classification, source/environment,
   archetypes, weight tiers).
2. `MERGE (qs:QuestionnaireSnapshot {version: $version})
   ON CREATE SET qs.label = $label, qs.data = $data, qs.created = datetime()
   ON MATCH SET qs.label = $label, qs.data = $data`
3. The MERGE ensures re-running the pipeline with the same YAML is idempotent.

### API Changes

| Endpoint | Method | Change |
|----------|--------|--------|
| `GET /api/config` | — | Unchanged — returns current active questionnaire |
| `GET /api/config?version=<hash>` | — | If `version` param provided, return snapshot `data` instead of live query. 404 if snapshot not found. |
| `GET /api/config/versions` | NEW | Returns array of `{ version, label, created }` for all snapshots, ordered by `created DESC`. |
| `POST /api/reviews` | — | Unchanged — already pins `questionnaireVersion` from `ScoringConfig` |

### Frontend Changes

#### ReviewPage — Version-Aware Config Loading

```
load review detail
  → review.questionnaireVersion vs appConfig.questionnaireVersion
  → if same: use appConfig (current behavior)
  → if different: fetch GET /api/config?version=<pinned>
       → use historical config for rendering
       → show version mismatch banner
```

#### Version Mismatch Banner

When a review's pinned version differs from the current version, display an
informational banner:

> **This review uses checklist version {label}.**
> The current checklist is {currentLabel}.
> [Upgrade to current version] (if applicable)

The "Upgrade" action is a stretch goal — it would re-pin the review to the
current version and attempt to map old answers to new questions. Not required
for Phase 1.

#### New Review — Version Selection (Phase 2)

Optional enhancement: when creating a new review, show a dropdown of available
versions. Default to "Latest". This allows starting new assessments against
historical checklists.

---

## Phased Implementation

### Phase 1 — Snapshot Storage + Version-Aware Retrieval (Minimum Viable)

| Step | Component | Change |
|------|-----------|--------|
| 1a | `001-constraints.cypher` | Add `QuestionnaireSnapshot.version` uniqueness constraint |
| 1b | `configureFromYaml.mjs` | Build snapshot JSON, MERGE `QuestionnaireSnapshot` node |
| 1c | `config.mjs` | Accept `?version=` query param; return snapshot data if present |
| 1d | `config.mjs` | Add `GET /api/config/versions` endpoint |
| 1e | YAML metadata | Add optional `questionnaire_label` field |
| 1f | Backfill | Re-run pipeline for any historical YAML files to create their snapshots |

**Outcome**: API can serve any historical questionnaire. Frontend not yet changed,
but the data foundation is in place.

### Phase 2 — Frontend Version Awareness

| Step | Component | Change |
|------|-----------|--------|
| 2a | `types.ts` | Add `QuestionnaireVersion` interface |
| 2b | `apiClient.ts` | Add `fetchConfigVersion(hash)` and `fetchVersions()` methods |
| 2c | `ReviewPage.tsx` | Version-aware config loading (use pinned snapshot if version differs) |
| 2d | `VersionBanner.tsx` (new) | Info banner showing which version a review uses |

**Outcome**: Existing V1 reviews render correctly with V1 questions/choices.
New reviews use the current version. Users see a clear indicator of which
checklist version they are working in.

### Phase 3 — Version Selection for New Reviews (Stretch)

| Step | Component | Change |
|------|-----------|--------|
| 3a | Create-review dialog | Version dropdown (populated from `/api/config/versions`) |
| 3b | `POST /api/reviews` body | Accept optional `questionnaireVersion` override |
| 3c | `reviews.mjs` | If override provided, validate snapshot exists, pin to requested version |

### Phase 4 — Version Upgrade (Stretch)

| Step | Component | Change |
|------|-----------|--------|
| 4a | Review upgrade endpoint | `POST /api/reviews/:id/upgrade` — re-pin to current version |
| 4b | Answer migration | Map old answers to new questions by `(domainIndex, questionIndex)` + text matching |
| 4c | Orphaned answer handling | Surface unmappable answers for manual review |

---

## Data Shape — Snapshot JSON

The `data` field contains the exact payload shape of `GET /api/config`:

```json
{
  "questionnaireVersion": "fb3ce5dd118c",
  "questionnaireLabel": "v2.0 — Source/Environment Taxonomy",
  "scoringConfig": {
    "dampingFactor": 4,
    "rawMax": 134,
    "naScore": 1,
    "ratingThresholds": [25, 50, 75],
    "ratingLabels": ["Low", "Moderate", "Elevated", "Critical"]
  },
  "weightTiers": { "Critical": 100, "High": 67, "Medium": 33, "Info": 13 },
  "classification": { "text": "...", "choices": [...] },
  "source": { "text": "...", "choices": [...] },
  "environment": { "text": "...", "choices": [...] },
  "archetypes": [...],
  "domains": [
    {
      "domainIndex": 0,
      "name": "...",
      "questions": [
        {
          "questionIndex": 0,
          "text": "...",
          "choices": ["...", "..."],
          "choiceScores": [20, 50, 70],
          "naScore": 1,
          "weightTier": "High",
          "applicability": ["INTERNAL_CLOUD", ...],
          "guidance": "..."
        }
      ]
    }
  ]
}
```

This is self-contained — no Neo4j lookups needed to render a historical
questionnaire. The frontend already consumes this exact shape.

---

## Backfill Strategy

Historical YAML files may not be available in git if they were overwritten
in-place. Options:

1. **Git history**: `git log --follow build/asr_questions.yaml` in the
   `asr.client-a` repo can recover prior versions. Extract each, run the
   pipeline to generate snapshots.
2. **Manual snapshot**: If only one prior version exists, extract it from git
   and run `npm run cypher:configure` against it.
3. **Synthetic snapshot**: If historical YAML is lost, reconstruct from
   memory/documentation and label it accordingly.

---

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| Snapshot JSON grows large | ~50KB per version; Neo4j handles string properties up to 2GB |
| Choice text changes break `findChoiceIndex` | Phase 2 eliminates this — historical reviews use their own snapshot |
| Index/position collision after domain reorder | Snapshots capture the exact structure; no reinterpretation needed |
| Users on old version miss newer questions | Version mismatch banner communicates this; Phase 4 offers upgrade |
| Multiple concurrent versions in production | Each review is self-contained; scoring parameters are in the snapshot |

---

## Files Modified

| File | Phase | Change |
|------|-------|--------|
| `api/cypher/001-constraints.cypher` | 1 | Add QuestionnaireSnapshot constraint |
| `api/src/configureFromYaml.mjs` | 1 | Build + store snapshot JSON |
| `api/src/routes/config.mjs` | 1 | `?version=` param + `/versions` endpoint |
| `asr.client-a/build/asr_questions.yaml` | 1 | Add `questionnaire_label` field |
| `frontend/src/lib/types.ts` | 2 | `QuestionnaireVersion` interface |
| `frontend/src/lib/apiClient.ts` | 2 | Version-aware fetch methods |
| `frontend/src/pages/ReviewPage.tsx` | 2 | Version-aware config loading |
| `frontend/src/components/VersionBanner.tsx` | 2 | New component |
