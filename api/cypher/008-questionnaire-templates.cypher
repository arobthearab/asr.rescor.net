// ════════════════════════════════════════════════════════════════════
// 008 — Questionnaire Template Nodes
// ════════════════════════════════════════════════════════════════════
// Introduces the Questionnaire grouping node that connects drafts and
// snapshots into a named, versioned template.
//
// Relationships:
//   (:QuestionnaireDraft)-[:BELONGS_TO]->(:Questionnaire)
//   (:QuestionnaireSnapshot)-[:VERSION_OF]->(:Questionnaire)
//   (:Questionnaire)-[:CURRENT_VERSION]->(:QuestionnaireSnapshot)
//
// Idempotent — safe to re-run.
// ════════════════════════════════════════════════════════════════════

CREATE CONSTRAINT questionnaire_id_unique IF NOT EXISTS
  FOR (q:Questionnaire) REQUIRE q.questionnaireId IS UNIQUE;

CREATE INDEX questionnaire_name_idx IF NOT EXISTS
  FOR (q:Questionnaire) ON (q.name);

CREATE INDEX questionnaire_active_idx IF NOT EXISTS
  FOR (q:Questionnaire) ON (q.active);

MATCH (s:QuestionnaireSnapshot) // Migration: create Questionnaire from snapshots
WHERE NOT (s)-[:VERSION_OF]->(:Questionnaire)
WITH s.label AS snapshotLabel, collect(s) AS snapshots
MERGE (q:Questionnaire {name: snapshotLabel})
  ON CREATE SET
    q.questionnaireId = randomUUID(),
    q.description     = '',
    q.active          = true,
    q.createdBy       = 'migration',
    q.created         = datetime(),
    q.updated         = datetime()
FOREACH (snapshot IN snapshots |
  MERGE (snapshot)-[:VERSION_OF]->(q)
)

MATCH (q:Questionnaire) // Migration: set CURRENT_VERSION to latest snapshot
WHERE NOT (q)-[:CURRENT_VERSION]->(:QuestionnaireSnapshot)
MATCH (s:QuestionnaireSnapshot)-[:VERSION_OF]->(q)
WITH q, s ORDER BY s.created DESC
WITH q, head(collect(s)) AS latest
MERGE (q)-[:CURRENT_VERSION]->(latest)

MATCH (d:QuestionnaireDraft) // Migration: link orphan drafts by label
WHERE NOT (d)-[:BELONGS_TO]->(:Questionnaire)
MATCH (q:Questionnaire)
WHERE d.label CONTAINS q.name OR q.name CONTAINS d.label
MERGE (d)-[:BELONGS_TO]->(q)

MATCH (c:ScoringConfig {configId: 'default'}) // Migration: remove version pointer
REMOVE c.questionnaireVersion, c.questionnaireLabel
SET c.updated = datetime()

MATCH (r:Review) // Migration: backfill USES_QUESTIONNAIRE for existing reviews
WHERE NOT (r)-[:USES_QUESTIONNAIRE]->(:Questionnaire)
  AND r.questionnaireVersion IS NOT NULL
MATCH (s:QuestionnaireSnapshot {version: r.questionnaireVersion})-[:VERSION_OF]->(q:Questionnaire)
MERGE (r)-[:USES_QUESTIONNAIRE]->(q)
