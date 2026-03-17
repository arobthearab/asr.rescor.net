// ════════════════════════════════════════════════════════════════════
// ONE-TIME CLEANUP — Remove "Simple ASR" test data, restore K12
// ════════════════════════════════════════════════════════════════════
// Run manually via Neo4j HTTP API or cypher-shell.
// DO NOT add to setupDatabase.mjs SCRIPTS array.
//
// Simple ASR version:  17d89d7457ee
// K12 version:         e54c6e3711d9
// Review:              f7c19e1d-a9f5-4750-9e95-a0d818e392cf  ("Test Gates")
// Draft:               bc914c6d-a2ed-438b-9249-4c33ef41a0c3
// ════════════════════════════════════════════════════════════════════

// Step 1: Delete answers + relationships for the orphaned review
MATCH (r:Review {reviewId: 'f7c19e1d-a9f5-4750-9e95-a0d818e392cf'})-[:CONTAINS]->(a:Answer)
DETACH DELETE a;

// Step 2: Delete gate answers for the orphaned review
MATCH (ga:GateAnswer {reviewId: 'f7c19e1d-a9f5-4750-9e95-a0d818e392cf'})
DELETE ga;

// Step 3: Delete the orphaned review itself
MATCH (r:Review {reviewId: 'f7c19e1d-a9f5-4750-9e95-a0d818e392cf'})
DETACH DELETE r;

// Step 4: Delete the Simple ASR snapshot
MATCH (s:QuestionnaireSnapshot {version: '17d89d7457ee'})
DETACH DELETE s;

// Step 5: Delete the Simple ASR draft
MATCH (d:QuestionnaireDraft {draftId: 'bc914c6d-a2ed-438b-9249-4c33ef41a0c3'})
DETACH DELETE d;

// Step 6: Restore ScoringConfig to K12 version
MATCH (c:ScoringConfig {configId: 'default'})
SET c.questionnaireVersion = 'e54c6e3711d9',
    c.questionnaireLabel   = 'v2.0 — Source/Environment Taxonomy',
    c.updated              = datetime();

// Step 7: Re-activate all K12 domains (Simple ASR deactivated domains 1+)
MATCH (d:Domain) WHERE d.active = false
SET d.active = true, d.updated = datetime();

// Step 8: Re-activate all K12 questions (may have been deactivated)
MATCH (q:Question) WHERE q.active = false
SET q.active = true, q.updated = datetime();

// Step 9: Clean up the Simple ASR "God of Thunder" domain (domainIndex 0
// was used by Simple ASR — the real K12 domainIndex 0 is "Network Security
// and Architecture". Since both share domainIndex 0, the K12 data was
// overwritten by publish. Re-running cypher:configure will fix this.)
