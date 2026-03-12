// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Schema — Constraints and Indexes
// ════════════════════════════════════════════════════════════════════
// Run once against the `asr` database (or `asrdev` for dev).
// Idempotent — safe to re-run (IF NOT EXISTS).
// ════════════════════════════════════════════════════════════════════

// ─── Uniqueness Constraints ──────────────────────────────────────

CREATE CONSTRAINT review_id_unique IF NOT EXISTS
  FOR (review:Review)
  REQUIRE review.reviewId IS UNIQUE;

CREATE CONSTRAINT domain_index_unique IF NOT EXISTS
  FOR (domain:Domain)
  REQUIRE domain.domainIndex IS UNIQUE;

CREATE CONSTRAINT question_composite_unique IF NOT EXISTS
  FOR (question:Question)
  REQUIRE (question.domainIndex, question.questionIndex) IS UNIQUE;

CREATE CONSTRAINT weight_tier_name_unique IF NOT EXISTS
  FOR (tier:WeightTier)
  REQUIRE tier.name IS UNIQUE;

CREATE CONSTRAINT policy_ref_unique IF NOT EXISTS
  FOR (policy:Policy)
  REQUIRE policy.reference IS UNIQUE;

CREATE CONSTRAINT csf_subcategory_code_unique IF NOT EXISTS
  FOR (subcategory:CsfSubcategory)
  REQUIRE subcategory.code IS UNIQUE;

CREATE CONSTRAINT gap_id_unique IF NOT EXISTS
  FOR (gap:Gap)
  REQUIRE gap.gapId IS UNIQUE;

CREATE CONSTRAINT sra_section_id_unique IF NOT EXISTS
  FOR (section:SraSection)
  REQUIRE section.sectionId IS UNIQUE;

CREATE CONSTRAINT scoring_config_id_unique IF NOT EXISTS
  FOR (config:ScoringConfig)
  REQUIRE config.configId IS UNIQUE;

CREATE CONSTRAINT deployment_archetype_code_unique IF NOT EXISTS
  FOR (archetype:DeploymentArchetype)
  REQUIRE archetype.code IS UNIQUE;

CREATE CONSTRAINT deployment_choice_archetype_unique IF NOT EXISTS
  FOR (choice:DeploymentChoice)
  REQUIRE choice.archetype IS UNIQUE;

CREATE CONSTRAINT source_question_id_unique IF NOT EXISTS
  FOR (question:SourceQuestion)
  REQUIRE question.questionId IS UNIQUE;

CREATE CONSTRAINT source_choice_source_unique IF NOT EXISTS
  FOR (choice:SourceChoice)
  REQUIRE choice.source IS UNIQUE;

CREATE CONSTRAINT environment_question_id_unique IF NOT EXISTS
  FOR (question:EnvironmentQuestion)
  REQUIRE question.questionId IS UNIQUE;

CREATE CONSTRAINT environment_choice_environment_unique IF NOT EXISTS
  FOR (choice:EnvironmentChoice)
  REQUIRE choice.environment IS UNIQUE;

CREATE CONSTRAINT questionnaire_snapshot_version_unique IF NOT EXISTS
  FOR (snapshot:QuestionnaireSnapshot)
  REQUIRE snapshot.version IS UNIQUE;

// ─── Existence Constraints (Enterprise Edition only) ─────────────
// Uncomment when running Neo4j Enterprise:
//
// CREATE CONSTRAINT review_application_name_exists IF NOT EXISTS
//   FOR (review:Review) REQUIRE review.applicationName IS NOT NULL;
//
// CREATE CONSTRAINT review_status_exists IF NOT EXISTS
//   FOR (review:Review) REQUIRE review.status IS NOT NULL;
//
// CREATE CONSTRAINT review_active_exists IF NOT EXISTS
//   FOR (review:Review) REQUIRE review.active IS NOT NULL;
//
// CREATE CONSTRAINT domain_name_exists IF NOT EXISTS
//   FOR (domain:Domain) REQUIRE domain.name IS NOT NULL;
//
// CREATE CONSTRAINT question_text_exists IF NOT EXISTS
//   FOR (question:Question) REQUIRE question.text IS NOT NULL;
//
// CREATE CONSTRAINT question_weight_tier_exists IF NOT EXISTS
//   FOR (question:Question) REQUIRE question.weightTier IS NOT NULL;
//
// CREATE CONSTRAINT weight_tier_value_exists IF NOT EXISTS
//   FOR (tier:WeightTier) REQUIRE tier.value IS NOT NULL;

// ─── Indexes for Query Performance ──────────────────────────────

CREATE INDEX review_status_index IF NOT EXISTS
  FOR (review:Review)
  ON (review.status);

CREATE INDEX review_active_index IF NOT EXISTS
  FOR (review:Review)
  ON (review.active);

CREATE INDEX answer_domain_question_index IF NOT EXISTS
  FOR (answer:Answer)
  ON (answer.domainIndex, answer.questionIndex);

CREATE INDEX question_domain_index IF NOT EXISTS
  FOR (question:Question)
  ON (question.domainIndex);

CREATE INDEX domain_name_index IF NOT EXISTS
  FOR (domain:Domain)
  ON (domain.name);
