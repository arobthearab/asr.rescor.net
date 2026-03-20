// ════════════════════════════════════════════════════════════════════
// ASR YAML-to-Cypher Configuration Tool
// ════════════════════════════════════════════════════════════════════
// Reads a client YAML questionnaire file and applies its content to
// Neo4j as Domain, Question, ClassificationQuestion, and related
// nodes.  This is the single-source-of-truth pipeline — question
// content lives in YAML, not in hand-maintained Cypher scripts.
//
// Usage:
//   node --env-file=../.env src/configureFromYaml.mjs \
//     ../asr.client-a/build/asr_questions.yaml
//
// Prerequisites: run `npm run cypher:setup -w api` first to seed
// scaffolding (ScoringConfig, WeightTier, ScoreScale, constraints).
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import yaml from 'js-yaml';
import { createConfiguration, createDatabase } from './database.mjs';

// ────────────────────────────────────────────────────────────────────
// YAML validation helpers
// ────────────────────────────────────────────────────────────────────

const VALID_RISK_LEVELS = new Set(['L', 'G', 'M', 'E', 'H']);
const VALID_WEIGHT_TIERS = new Set(['Critical', 'High', 'Medium', 'Info']);

function validateYaml(data) {
  const errors = [];

  if (!Array.isArray(data.domains) || data.domains.length === 0) {
    errors.push('YAML must have a non-empty "domains" array.');
  }

  const validArchetypes = new Set(Object.keys(data.deployment_archetypes || {}));

  // Validate source × environment archetype structure
  for (const [code, meta] of Object.entries(data.deployment_archetypes || {})) {
    if (!meta.source || !meta.environment) {
      errors.push(`Archetype "${code}": must have "source" and "environment" properties.`);
    }
  }

  if (!data.source_question || !Array.isArray(data.source_question.choices)) {
    errors.push('YAML must have a "source_question" with a "choices" array.');
  }
  if (!data.environment_question || !Array.isArray(data.environment_question.choices)) {
    errors.push('YAML must have an "environment_question" with a "choices" array.');
  }

  for (let domainIndex = 0; domainIndex < (data.domains || []).length; domainIndex++) {
    const domain = data.domains[domainIndex];
    const domainLabel = `Domain ${domainIndex} (${domain.name || 'unnamed'})`;

    if (!domain.name) {
      errors.push(`${domainLabel}: missing "name".`);
    }

    if (!Array.isArray(domain.questions) || domain.questions.length === 0) {
      errors.push(`${domainLabel}: must have at least one question.`);
      continue;
    }

    for (let questionIndex = 0; questionIndex < domain.questions.length; questionIndex++) {
      const question = domain.questions[questionIndex];
      const questionLabel = `D${domainIndex} Q${questionIndex}`;

      if (!question.text) {
        errors.push(`${questionLabel}: missing "text".`);
      }

      if (!VALID_WEIGHT_TIERS.has(question.weight)) {
        errors.push(`${questionLabel}: invalid weight "${question.weight}". Must be one of: ${[...VALID_WEIGHT_TIERS].join(', ')}`);
      }

      if (!Array.isArray(question.choices) || question.choices.length < 2) {
        errors.push(`${questionLabel}: must have at least 2 choices.`);
        continue;
      }

      for (let choiceIndex = 0; choiceIndex < question.choices.length; choiceIndex++) {
        const choice = question.choices[choiceIndex];
        if (!choice.text) {
          errors.push(`${questionLabel} choice ${choiceIndex}: missing "text".`);
        }
        if (!VALID_RISK_LEVELS.has(choice.risk)) {
          errors.push(`${questionLabel} choice ${choiceIndex}: invalid risk "${choice.risk}".`);
        }
      }

      const applicability = question.applicability || [];
      for (const code of applicability) {
        if (validArchetypes.size > 0 && !validArchetypes.has(code)) {
          errors.push(`${questionLabel}: unknown archetype code "${code}". Valid: ${[...validArchetypes].join(', ')}`);
        }
      }
    }
  }

  return errors;
}

// ────────────────────────────────────────────────────────────────────
// Score derivation — from risk level and choice count
// ────────────────────────────────────────────────────────────────────

function deriveChoiceScores(choices, scoreScales) {
  const choiceCount = choices.length;
  const scale = scoreScales[choiceCount];

  if (!scale) {
    // Fallback: linear interpolation for unusual choice counts
    const result = choices.map((_, index) =>
      Math.round(15 + (index / (choiceCount - 1)) * 70)
    );
    return result;
  }

  const result = choices.map((choice) => scale[choice.risk] || 50);
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Cypher generation
// ────────────────────────────────────────────────────────────────────

function generateDomainStatements(data) {
  const statements = [];
  const scoreScales = data.score_scales || {};
  const naScore = data.na_score ?? 1;

  // ── Classification question ──────────────────────────────────────
  const classification = data.classification_question;
  if (classification) {
    const choiceParams = classification.choices.map((choice, index) => ({
      text: choice.text,
      factor: choice.factor,
      sortOrder: index,
    }));

    statements.push({
      cypher: `
        MERGE (classification:ClassificationQuestion {questionId: 'classification'})
          SET classification.text      = $text,
              classification.naAllowed = false,
              classification.updated   = datetime()
        WITH classification
        UNWIND $choices AS choice
        MERGE (classification)-[:HAS_CHOICE]->(c:ClassificationChoice {text: choice.text})
          SET c.factor    = choice.factor,
              c.sortOrder = choice.sortOrder,
              c.updated   = datetime()
      `,
      params: { text: classification.text, choices: choiceParams },
    });
  }

  // ── Source question (transcendental) ────────────────────────────
  const sourceQuestion = data.source_question;
  if (sourceQuestion) {
    const choiceParams = sourceQuestion.choices.map((choice, index) => ({
      text: choice.text,
      source: choice.source,
      sortOrder: index,
    }));

    statements.push({
      cypher: `
        MERGE (sourceQuestion:SourceQuestion {questionId: 'source'})
          SET sourceQuestion.text      = $text,
              sourceQuestion.naAllowed = false,
              sourceQuestion.updated   = datetime()
        WITH sourceQuestion
        UNWIND $choices AS choice
        MERGE (sourceQuestion)-[:HAS_CHOICE]->(c:SourceChoice {source: choice.source})
          SET c.text      = choice.text,
              c.sortOrder = choice.sortOrder,
              c.updated   = datetime()
      `,
      params: { text: sourceQuestion.text, choices: choiceParams },
    });
  }

  // ── Environment question (transcendental) ─────────────────────
  const environmentQuestion = data.environment_question;
  if (environmentQuestion) {
    const choiceParams = environmentQuestion.choices.map((choice, index) => ({
      text: choice.text,
      environment: choice.environment,
      sortOrder: index,
    }));

    statements.push({
      cypher: `
        MERGE (environmentQuestion:EnvironmentQuestion {questionId: 'environment'})
          SET environmentQuestion.text      = $text,
              environmentQuestion.naAllowed = false,
              environmentQuestion.updated   = datetime()
        WITH environmentQuestion
        UNWIND $choices AS choice
        MERGE (environmentQuestion)-[:HAS_CHOICE]->(c:EnvironmentChoice {environment: choice.environment})
          SET c.text      = choice.text,
              c.sortOrder = choice.sortOrder,
              c.updated   = datetime()
      `,
      params: { text: environmentQuestion.text, choices: choiceParams },
    });
  }

  // ── Deployment archetypes ────────────────────────────────────────
  const archetypes = data.deployment_archetypes || {};
  for (const [code, meta] of Object.entries(archetypes)) {
    statements.push({
      cypher: `
        MERGE (archetype:DeploymentArchetype {code: $code})
          SET archetype.label       = $label,
              archetype.description = $description,
              archetype.source      = $source,
              archetype.environment = $environment,
              archetype.sortOrder   = $sortOrder,
              archetype.updated     = datetime()
      `,
      params: {
        code,
        label: meta.label,
        description: meta.description,
        source: meta.source,
        environment: meta.environment,
        sortOrder: Object.keys(archetypes).indexOf(code),
      },
    });
  }

  // ── Domains and questions ────────────────────────────────────────
  for (let domainIndex = 0; domainIndex < data.domains.length; domainIndex++) {
    const domain = data.domains[domainIndex];

    statements.push({
      cypher: `
        MERGE (domain:Domain {domainIndex: $domainIndex})
          SET domain.name       = $name,
              domain.policyRefs = $policyRefs,
              domain.csfRefs    = $csfRefs,
              domain.ferpaNote  = $ferpaNote,
              domain.soxNote    = $soxNote,
              domain.active     = true,
              domain.updated    = datetime()
      `,
      params: {
        domainIndex,
        name: domain.name,
        policyRefs: domain.policy_refs || [],
        csfRefs: domain.csf_refs || [],
        ferpaNote: domain.ferpa_note || null,
        soxNote: domain.sox_note || null,
      },
    });

    for (let questionIndex = 0; questionIndex < domain.questions.length; questionIndex++) {
      const question = domain.questions[questionIndex];
      const choiceTexts = question.choices.map((choice) => choice.text);
      const choiceScores = deriveChoiceScores(question.choices, scoreScales);

      statements.push({
        cypher: `
          MERGE (question:Question {domainIndex: $domainIndex, questionIndex: $questionIndex})
            ON CREATE SET question.questionId = randomUUID()
            SET question.text                = $text,
                question.weightTier          = $weightTier,
                question.choices             = $choices,
                question.choiceScores        = $choiceScores,
                question.naScore             = $naScore,
                question.applicability       = $applicability,
                question.guidance            = $guidance,
                question.responsibleFunction = $responsibleFunction,
                question.active              = true,
                question.updated             = datetime()
        `,
        params: {
          domainIndex,
          questionIndex,
          text: question.text,
          weightTier: question.weight,
          choices: choiceTexts,
          choiceScores,
          naScore,
          applicability: question.applicability || [],
          guidance: question.guidance || null,
          responsibleFunction: question.responsible_function || null,
        },
      });
    }

    // Wire BELONGS_TO relationships for this domain
    statements.push({
      cypher: `
        MATCH (domain:Domain {domainIndex: $domainIndex})
        MATCH (question:Question) WHERE question.domainIndex = $domainIndex
        MERGE (question)-[:BELONGS_TO]->(domain)
      `,
      params: { domainIndex },
    });

    // Wire HAS_WEIGHT relationships for this domain
    statements.push({
      cypher: `
        MATCH (question:Question) WHERE question.domainIndex = $domainIndex
        MATCH (tier:WeightTier {name: question.weightTier})
        MERGE (question)-[:HAS_WEIGHT]->(tier)
      `,
      params: { domainIndex },
    });
  }

  // ── Compliance sources (per-tag chip behavior) ──────────────────
  const complianceSources = data.compliance_sources || {};
  for (const [tag, config] of Object.entries(complianceSources)) {
    statements.push({
      cypher: `
        MERGE (tagConfig:ComplianceTagConfig {tag: $tag})
          SET tagConfig.action  = $action,
              tagConfig.baseUrl = $baseUrl,
              tagConfig.updated = datetime()
      `,
      params: {
        tag,
        action: config.action || null,
        baseUrl: config.base_url || null,
      },
    });
  }

  return statements;
}

// ────────────────────────────────────────────────────────────────────
// Snapshot builder — produces the same shape as GET /api/config
// ────────────────────────────────────────────────────────────────────

function buildSnapshot(data, questionnaireVersion) {
  const scoreScales = data.score_scales || {};
  const naScore = data.na_score ?? 1;

  const weightTiers = Object.entries(data.weight_tiers || {}).map(
    ([name, value]) => ({ name, value })
  );
  weightTiers.sort((first, second) => second.value - first.value);

  const classification = data.classification_question
    ? {
        text: data.classification_question.text,
        naAllowed: false,
        choices: data.classification_question.choices.map((choice, index) => ({
          text: choice.text,
          factor: choice.factor,
          sortOrder: index,
        })),
      }
    : { text: '', naAllowed: false, choices: [] };

  const source = data.source_question
    ? {
        text: data.source_question.text,
        naAllowed: false,
        choices: data.source_question.choices.map((choice, index) => ({
          text: choice.text,
          source: choice.source,
          sortOrder: index,
        })),
      }
    : { text: '', naAllowed: false, choices: [] };

  const environment = data.environment_question
    ? {
        text: data.environment_question.text,
        naAllowed: false,
        choices: data.environment_question.choices.map((choice, index) => ({
          text: choice.text,
          environment: choice.environment,
          sortOrder: index,
        })),
      }
    : { text: '', naAllowed: false, choices: [] };

  const archetypes = Object.entries(data.deployment_archetypes || {}).map(
    ([code, meta], index) => ({
      code,
      label: meta.label,
      description: meta.description,
      source: meta.source,
      environment: meta.environment,
      sortOrder: index,
    })
  );

  const domains = (data.domains || []).map((domain, domainIndex) => ({
    domainIndex,
    name: domain.name,
    policyRefs: domain.policy_refs || [],
    csfRefs: domain.csf_refs || [],
    questions: domain.questions.map((question, questionIndex) => {
      const choiceTexts = question.choices.map((choice) => choice.text);
      const choiceScores = deriveChoiceScores(question.choices, scoreScales);
      return {
        domainIndex,
        questionIndex,
        text: question.text,
        weightTier: question.weight,
        choices: choiceTexts,
        choiceScores,
        naScore,
        applicability: question.applicability || [],
        responsibleFunction: question.responsible_function || null,
      };
    }),
  }));

  const snapshot = {
    questionnaireVersion,
    questionnaireLabel: data.questionnaire_label || questionnaireVersion,
    scoringConfiguration: {
      dampingFactor: 4,
      rawMax: 134,
      ratingThresholds: [25, 50, 75],
      ratingLabels: ['Low', 'Moderate', 'Elevated', 'Critical'],
      questionnaireVersion,
    },
    classification,
    source,
    environment,
    archetypes,
    domains,
    weightTiers,
  };

  return snapshot;
}

// ────────────────────────────────────────────────────────────────────
// Orphan cleanup — remove questions/domains that no longer exist
// ────────────────────────────────────────────────────────────────────

function generateCleanupStatements(data) {
  const statements = [];
  const domainCount = data.domains.length;

  // Soft-deactivate domains beyond the current count (preserve for old reviews)
  statements.push({
    cypher: `
      MATCH (domain:Domain)
      WHERE domain.domainIndex >= $domainCount
      SET domain.active = false,
          domain.updated = datetime()
    `,
    params: { domainCount },
  });

  // Soft-deactivate excess questions per domain (preserve Answer → Question links)
  for (let domainIndex = 0; domainIndex < domainCount; domainIndex++) {
    const questionCount = data.domains[domainIndex].questions.length;

    statements.push({
      cypher: `
        MATCH (question:Question {domainIndex: $domainIndex})
        WHERE question.questionIndex >= $questionCount
        SET question.active = false,
            question.updated = datetime()
      `,
      params: { domainIndex, questionCount },
    });
  }

  return statements;
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

async function configureFromYaml() {
  const yamlPath = process.argv[2];
  if (!yamlPath) {
    console.error('Error: YAML file path required.');
    console.error('Usage: node src/configureFromYaml.mjs <path/to/asr_questions.yaml>');
    process.exit(1);
  }

  const absolutePath = resolve(yamlPath);
  console.log(`Reading YAML from ${absolutePath}`);

  const raw = readFileSync(absolutePath, 'utf-8');
  const data = yaml.load(raw);

  // Validate
  const errors = validateYaml(data);
  if (errors.length > 0) {
    console.error('YAML validation failed:');
    for (const error of errors) {
      console.error(`  • ${error}`);
    }
    process.exit(1);
  }

  const domainCount = data.domains.length;
  const questionCount = data.domains.reduce(
    (sum, domain) => sum + domain.questions.length, 0
  );
  console.log(`Validated: ${domainCount} domains, ${questionCount} questions`);

  // Generate Cypher
  const domainStatements = generateDomainStatements(data);
  const cleanupStatements = generateCleanupStatements(data);
  const allStatements = [...domainStatements, ...cleanupStatements];

  // Stamp questionnaireVersion (hash of raw YAML)
  const questionnaireVersion = createHash('sha256').update(raw).digest('hex').slice(0, 12);

  // Store complete questionnaire snapshot for historical review support
  const snapshot = buildSnapshot(data, questionnaireVersion);
  const questionnaireLabel = data.questionnaire_label || questionnaireVersion;
  allStatements.push({
    cypher: `
      MERGE (snapshot:QuestionnaireSnapshot {version: $version})
        ON CREATE SET snapshot.label   = $label,
                      snapshot.data    = $data,
                      snapshot.created = datetime()
        ON MATCH  SET snapshot.label   = $label,
                      snapshot.data    = $data
    `,
    params: {
      version: questionnaireVersion,
      label: questionnaireLabel,
      data: JSON.stringify(snapshot),
    },
  });

  // Create or match Questionnaire template node and wire relationships
  allStatements.push({
    cypher: `
      MERGE (q:Questionnaire {name: $name})
        ON CREATE SET
          q.questionnaireId = randomUUID(),
          q.description     = '',
          q.active          = true,
          q.createdBy       = 'cli',
          q.created         = datetime(),
          q.updated         = datetime()
      WITH q
      MATCH (s:QuestionnaireSnapshot {version: $version})
      MERGE (s)-[:VERSION_OF]->(q)
      WITH q
      OPTIONAL MATCH (q)-[old:CURRENT_VERSION]->()
      DELETE old
      WITH q
      MATCH (s:QuestionnaireSnapshot {version: $version})
      CREATE (q)-[:CURRENT_VERSION]->(s)
      SET q.updated = datetime()
    `,
    params: { name: questionnaireLabel, version: questionnaireVersion },
  });

  // Link any unlinked GateQuestion nodes to this questionnaire
  allStatements.push({
    cypher: `
      MATCH (q:Questionnaire {name: $name})
      MATCH (gq:GateQuestion)
      WHERE gq.active = true AND NOT (gq)-[:APPLIES_TO]->(q)
      MERGE (gq)-[:APPLIES_TO]->(q)
    `,
    params: { name: questionnaireLabel },
  });

  console.log(`Generated ${allStatements.length} Cypher statements (version: ${questionnaireVersion})`);

  // Connect and execute
  const configuration = await createConfiguration();
  const database = await createDatabase(configuration);

  let executed = 0;
  for (const { cypher, params } of allStatements) {
    await database.query(cypher, params);
    executed++;
  }

  console.log(`Executed ${executed} statements successfully`);

  // Summary
  const archetypeCount = Object.keys(data.deployment_archetypes || {}).length;
  const complianceSourceCount = Object.keys(data.compliance_sources || {}).length;
  const hasClassification = !!data.classification_question;
  const hasSource = !!data.source_question;
  const hasEnvironment = !!data.environment_question;
  console.log(`\nConfiguration applied:`);
  console.log(`  ${domainCount} domains, ${questionCount} questions`);
  console.log(`  Classification question: ${hasClassification ? 'yes' : 'no'}`);
  console.log(`  Source question: ${hasSource ? 'yes' : 'no'}`);
  console.log(`  Environment question: ${hasEnvironment ? 'yes' : 'no'}`);
  console.log(`  Deployment archetypes: ${archetypeCount}`);
  console.log(`  Compliance sources: ${complianceSourceCount}`);
  console.log(`  Questionnaire version: ${questionnaireVersion}`);

  await database.disconnect();
  console.log('Done.');
}

configureFromYaml().catch((error) => {
  console.error('Configuration failed:', error);
  process.exit(1);
});
