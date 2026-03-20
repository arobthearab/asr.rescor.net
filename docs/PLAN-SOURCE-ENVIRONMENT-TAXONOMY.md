# Plan: Source × Environment Deployment Taxonomy

**Status**: Implemented (2026-03-12)

## Summary

Replaced the single 4-choice deployment question with a two-axis taxonomy:
**Source** (Internal / External / OTS) × **Environment** (Cloud / On-Premise / Hybrid) = 9 compound archetypes that drive question applicability filtering.

## Implementation

### Phase 1: YAML Schema (asr.client-a)

- Replaced `deployment_archetypes` (4 entries) with 9 compound archetypes
- Replaced `deployment_question` with `source_question` + `environment_question`
- Remapped 10 applicability-filtered questions to new 9-code system

### Phase 2: Neo4j Schema (asr.rescor.net)

- Added constraints: `SourceQuestion.questionId`, `SourceChoice.source`, `EnvironmentQuestion.questionId`, `EnvironmentChoice.environment`
- Old `DeploymentQuestion`/`DeploymentChoice` constraints retained (version resilience)

### Phase 3: Configuration Pipeline (asr.rescor.net)

- Updated `configureFromYaml.mjs`: validation, Cypher generation for new transcendental questions
- Archetypes now include `source` and `environment` properties

### Phase 4: API Routes (asr.rescor.net)

- `config.mjs`: serves source/environment/archetypes + applicability on questions
- `reviews.mjs`: new `PATCH /:reviewId/deployment` stores sourceChoice, environmentChoice, deploymentArchetype

### Phase 5: Frontend (asr.rescor.net)

- `types.ts`: new interfaces (SourceConfig, EnvironmentConfig, DeploymentArchetype)
- `SourceBanner.tsx` / `EnvironmentBanner.tsx`: radio group components
- `ReviewPage.tsx`: state management, banner rendering, archetype derivation
- `DomainSection.tsx`: applicability filtering of questions
- `apiClient.ts`: `updateDeployment()` method

## Design Decisions

- **9 combined archetypes** for applicability tagging (e.g., `INTERNAL_CLOUD`, `EXTERNAL_ONPREMISE`)
- **Full-word codes** per PROJECT-PATTERNS.md: `INTERNAL`, `EXTERNAL`, `OTS` / `ONPREMISE`, `CLOUD`, `HYBRID`
- **Compound code** = `${source}_${environment}`
- **Extensible**: customer adds entries in YAML; pipeline auto-generates cross-product
- **Single-select** for both source and environment
- Old deployment nodes soft-deprecated (version resilience)
- Archetype derived on frontend; all three fields stored on Review
