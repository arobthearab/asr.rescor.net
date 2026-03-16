// ════════════════════════════════════════════════════════════════════
// Questionnaire Admin Routes — Draft CRUD, Import, Export, Publish
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { loadScoringConfiguration } from '../scoring.mjs';

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const VALID_RISK_LEVELS = new Set(['L', 'G', 'M', 'E', 'H']);
const VALID_WEIGHT_TIERS = new Set(['Critical', 'High', 'Medium', 'Info']);
const VALID_FUNCTIONS = new Set(['LEGAL', 'ERM', 'EA', 'SEPG', 'SAE', 'GENERAL']);

// ────────────────────────────────────────────────────────────────────
// Validation — draft data structure
// ────────────────────────────────────────────────────────────────────

function validateDraftData(data) {
  const errors = [];

  if (!Array.isArray(data.domains) || data.domains.length === 0) {
    errors.push('Draft must have a non-empty "domains" array.');
    return errors;
  }

  for (let domainIndex = 0; domainIndex < data.domains.length; domainIndex++) {
    const domain = data.domains[domainIndex];
    const domainLabel = `Domain ${domainIndex} (${domain.name || 'unnamed'})`;

    if (!domain.name || typeof domain.name !== 'string') {
      errors.push(`${domainLabel}: missing or invalid "name".`);
    }

    if (!Array.isArray(domain.questions) || domain.questions.length === 0) {
      errors.push(`${domainLabel}: must have at least one question.`);
      continue;
    }

    for (let questionIndex = 0; questionIndex < domain.questions.length; questionIndex++) {
      const question = domain.questions[questionIndex];
      const questionLabel = `D${domainIndex} Q${questionIndex}`;

      if (!question.text || typeof question.text !== 'string') {
        errors.push(`${questionLabel}: missing "text".`);
      }

      if (!VALID_WEIGHT_TIERS.has(question.weightTier)) {
        errors.push(`${questionLabel}: invalid weightTier "${question.weightTier}".`);
      }

      if (!Array.isArray(question.choices) || question.choices.length < 2) {
        errors.push(`${questionLabel}: must have at least 2 choices.`);
        continue;
      }

      if (!Array.isArray(question.choiceScores) || question.choiceScores.length !== question.choices.length) {
        errors.push(`${questionLabel}: choiceScores must match choices length.`);
      }
    }
  }

  return errors;
}

// ────────────────────────────────────────────────────────────────────
// Live config reader — builds editable draft shape from Neo4j
// ────────────────────────────────────────────────────────────────────

async function readLiveConfig(database) {
  const scoringConfiguration = await loadScoringConfiguration(database);

  const classificationResult = await database.query(
    `MATCH (c:ClassificationQuestion)-[:HAS_CHOICE]->(choice:ClassificationChoice)
     RETURN c, choice ORDER BY choice.sortOrder`
  );

  const sourceResult = await database.query(
    `MATCH (s:SourceQuestion)-[:HAS_CHOICE]->(choice:SourceChoice)
     RETURN s, choice ORDER BY choice.sortOrder`
  );

  const environmentResult = await database.query(
    `MATCH (e:EnvironmentQuestion)-[:HAS_CHOICE]->(choice:EnvironmentChoice)
     RETURN e, choice ORDER BY choice.sortOrder`
  );

  const archetypeResult = await database.query(
    `MATCH (a:DeploymentArchetype) RETURN a ORDER BY a.sortOrder`
  );

  const domainsResult = await database.query(
    `MATCH (domain:Domain)
     WHERE domain.active = true
     OPTIONAL MATCH (domain)<-[:BELONGS_TO]-(question:Question)
     WHERE question.active = true
     RETURN domain, collect(question) AS questions
     ORDER BY domain.domainIndex`
  );

  const weightTiersResult = await database.query(
    `MATCH (tier:WeightTier) RETURN tier ORDER BY tier.value DESC`
  );

  const complianceResult = await database.query(
    `MATCH (config:ComplianceTagConfig) RETURN config`
  );

  // Build classification
  let classification = null;
  if (classificationResult.length > 0) {
    const first = classificationResult[0].c || {};
    classification = {
      text: first.text || '',
      choices: classificationResult.map((record) => {
        const choice = record.choice || {};
        return { text: choice.text, factor: choice.factor, sortOrder: choice.sortOrder };
      }),
    };
  }

  // Build source question
  let source = null;
  if (sourceResult.length > 0) {
    const first = sourceResult[0].s || {};
    source = {
      text: first.text || '',
      choices: sourceResult.map((record) => {
        const choice = record.choice || {};
        return { text: choice.text, source: choice.source, sortOrder: choice.sortOrder };
      }),
    };
  }

  // Build environment question
  let environment = null;
  if (environmentResult.length > 0) {
    const first = environmentResult[0].e || {};
    environment = {
      text: first.text || '',
      choices: environmentResult.map((record) => {
        const choice = record.choice || {};
        return { text: choice.text, environment: choice.environment, sortOrder: choice.sortOrder };
      }),
    };
  }

  // Build archetypes
  const archetypes = archetypeResult.map((record) => {
    const archetype = record.a || record;
    return {
      code: archetype.code,
      label: archetype.label,
      description: archetype.description,
      source: archetype.source,
      environment: archetype.environment,
      sortOrder: archetype.sortOrder,
    };
  });

  // Build domains + questions
  const domains = domainsResult.map((record) => {
    const domain = record.domain || {};
    const questions = (record.questions || [])
      .sort((first, second) => (first.questionIndex ?? 0) - (second.questionIndex ?? 0))
      .map((question) => ({
        questionId: question.questionId || null,
        domainIndex: question.domainIndex,
        questionIndex: question.questionIndex,
        text: question.text,
        weightTier: question.weightTier,
        choices: question.choices || [],
        choiceScores: question.choiceScores || [],
        naScore: question.naScore ?? 1,
        applicability: question.applicability || [],
        guidance: question.guidance || null,
        responsibleFunction: question.responsibleFunction || null,
      }));

    return {
      domainIndex: domain.domainIndex,
      name: domain.name,
      policyRefs: domain.policyRefs || [],
      csfRefs: domain.csfRefs || [],
      questions,
    };
  });

  // Build weight tiers
  const weightTiers = weightTiersResult.map((record) => {
    const tier = record.tier || record;
    return { name: tier.name, value: tier.value };
  });

  // Build compliance sources
  const complianceSources = {};
  for (const record of complianceResult) {
    const config = record.config || record;
    complianceSources[config.tag] = { action: config.action, baseUrl: config.baseUrl || null };
  }

  const result = {
    scoringConfiguration,
    classification,
    source,
    environment,
    archetypes,
    domains,
    weightTiers,
    complianceSources,
  };

  return result;
}

// ────────────────────────────────────────────────────────────────────
// Publish — apply draft data to live Neo4j nodes
// ────────────────────────────────────────────────────────────────────

async function publishDraft(database, draftData, questionnaireLabel, publishedBy) {
  const statements = [];

  // ── Domains and questions ─────────────────────────────────────
  for (let domainIndex = 0; domainIndex < draftData.domains.length; domainIndex++) {
    const domain = draftData.domains[domainIndex];

    statements.push({
      cypher: `
        MERGE (domain:Domain {domainIndex: $domainIndex})
          SET domain.name       = $name,
              domain.policyRefs = $policyRefs,
              domain.csfRefs    = $csfRefs,
              domain.active     = true,
              domain.updated    = datetime()
      `,
      params: {
        domainIndex,
        name: domain.name,
        policyRefs: domain.policyRefs || [],
        csfRefs: domain.csfRefs || [],
      },
    });

    for (let questionIndex = 0; questionIndex < domain.questions.length; questionIndex++) {
      const question = domain.questions[questionIndex];

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
          weightTier: question.weightTier,
          choices: question.choices || [],
          choiceScores: question.choiceScores || [],
          naScore: question.naScore ?? 1,
          applicability: question.applicability || [],
          guidance: question.guidance || null,
          responsibleFunction: question.responsibleFunction || null,
        },
      });
    }

    // Wire relationships
    statements.push({
      cypher: `
        MATCH (domain:Domain {domainIndex: $domainIndex})
        MATCH (question:Question) WHERE question.domainIndex = $domainIndex
        MERGE (question)-[:BELONGS_TO]->(domain)
      `,
      params: { domainIndex },
    });

    statements.push({
      cypher: `
        MATCH (question:Question) WHERE question.domainIndex = $domainIndex
        MATCH (tier:WeightTier {name: question.weightTier})
        MERGE (question)-[:HAS_WEIGHT]->(tier)
      `,
      params: { domainIndex },
    });
  }

  // ── Soft-deactivate orphaned domains ──────────────────────────
  statements.push({
    cypher: `
      MATCH (domain:Domain) WHERE domain.domainIndex >= $domainCount
      SET domain.active = false, domain.updated = datetime()
    `,
    params: { domainCount: draftData.domains.length },
  });

  // ── Soft-deactivate orphaned questions ────────────────────────
  for (let domainIndex = 0; domainIndex < draftData.domains.length; domainIndex++) {
    const questionCount = draftData.domains[domainIndex].questions.length;
    statements.push({
      cypher: `
        MATCH (question:Question {domainIndex: $domainIndex})
        WHERE question.questionIndex >= $questionCount
        SET question.active = false, question.updated = datetime()
      `,
      params: { domainIndex, questionCount },
    });
  }

  // ── Compute version hash from draft JSON ──────────────────────
  const draftJson = JSON.stringify(draftData);
  const questionnaireVersion = createHash('sha256').update(draftJson).digest('hex').slice(0, 12);

  // ── Stamp ScoringConfig ───────────────────────────────────────
  statements.push({
    cypher: `
      MATCH (config:ScoringConfig {configId: 'default'})
      SET config.questionnaireVersion = $questionnaireVersion,
          config.questionnaireLabel   = $questionnaireLabel,
          config.updated              = datetime()
    `,
    params: { questionnaireVersion, questionnaireLabel },
  });

  // ── Create QuestionnaireSnapshot ──────────────────────────────
  const snapshotData = { ...draftData, questionnaireVersion, questionnaireLabel };
  statements.push({
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
      data: JSON.stringify(snapshotData),
    },
  });

  // ── Execute all statements ────────────────────────────────────
  for (const { cypher, params } of statements) {
    await database.query(cypher, params);
  }

  return { questionnaireVersion, statementCount: statements.length };
}

// ────────────────────────────────────────────────────────────────────
// YAML export builder — converts live config to YAML-compatible shape
// ────────────────────────────────────────────────────────────────────

function buildYamlExport(liveConfig) {
  const yamlData = {};

  yamlData.questionnaire_label = liveConfig.scoringConfiguration?.questionnaireLabel || '';

  // Weight tiers
  yamlData.weight_tiers = {};
  for (const tier of liveConfig.weightTiers || []) {
    yamlData.weight_tiers[tier.name] = tier.value;
  }

  // Classification
  if (liveConfig.classification) {
    yamlData.classification_question = {
      text: liveConfig.classification.text,
      choices: liveConfig.classification.choices.map((choice) => ({
        text: choice.text,
        factor: choice.factor,
      })),
    };
  }

  // Score scales (reconstruct from known defaults — these are static)
  yamlData.score_scales = {
    3: { L: 20, M: 50, H: 70 },
    4: { L: 20, G: 40, M: 60, H: 80 },
    5: { L: 15, G: 35, M: 50, E: 70, H: 85 },
  };

  yamlData.na_score = 1;

  // Source question
  if (liveConfig.source) {
    yamlData.source_question = {
      text: liveConfig.source.text,
      choices: liveConfig.source.choices.map((choice) => ({
        text: choice.text,
        source: choice.source,
      })),
    };
  }

  // Environment question
  if (liveConfig.environment) {
    yamlData.environment_question = {
      text: liveConfig.environment.text,
      choices: liveConfig.environment.choices.map((choice) => ({
        text: choice.text,
        environment: choice.environment,
      })),
    };
  }

  // Deployment archetypes
  yamlData.deployment_archetypes = {};
  for (const archetype of liveConfig.archetypes || []) {
    yamlData.deployment_archetypes[archetype.code] = {
      source: archetype.source,
      environment: archetype.environment,
      label: archetype.label,
      description: archetype.description,
    };
  }

  // Compliance sources
  yamlData.compliance_sources = {};
  for (const [tag, config] of Object.entries(liveConfig.complianceSources || {})) {
    const entry = { action: config.action };
    if (config.baseUrl) {
      entry.base_url = config.baseUrl;
    }
    yamlData.compliance_sources[tag] = entry;
  }

  // Domains
  yamlData.domains = (liveConfig.domains || []).map((domain) => ({
    name: domain.name,
    policy_refs: domain.policyRefs || [],
    csf_refs: domain.csfRefs || [],
    questions: domain.questions.map((question) => ({
      text: question.text,
      weight: question.weightTier,
      responsible_function: question.responsibleFunction || 'GENERAL',
      applicability: question.applicability || [],
      guidance: question.guidance || undefined,
      choices: question.choices.map((choiceText, index) => {
        // Reverse-derive risk level from choiceScores (best effort)
        const score = question.choiceScores?.[index] ?? 50;
        const risk = reverseRiskLevel(score, question.choices.length);
        return { text: choiceText, risk };
      }),
    })),
  }));

  return yamlData;
}

// ────────────────────────────────────────────────────────────────────
// reverseRiskLevel — best-effort score → risk level mapping
// ────────────────────────────────────────────────────────────────────

function reverseRiskLevel(score, choiceCount) {
  const scales = {
    3: { 20: 'L', 50: 'M', 70: 'H' },
    4: { 20: 'L', 40: 'G', 60: 'M', 80: 'H' },
    5: { 15: 'L', 35: 'G', 50: 'M', 70: 'E', 85: 'H' },
  };

  const scale = scales[choiceCount];
  let result = 'M';

  if (scale) {
    let bestDistance = Infinity;
    for (const [scoreStr, level] of Object.entries(scale)) {
      const distance = Math.abs(Number(scoreStr) - score);
      if (distance < bestDistance) {
        bestDistance = distance;
        result = level;
      }
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────
// createQuestionnaireAdminRouter
// ────────────────────────────────────────────────────────────────────

export function createQuestionnaireAdminRouter(database) {
  const router = Router();

  // ── GET /drafts — list all drafts ─────────────────────────────
  router.get('/drafts', async (_request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      const result = await database.query(
        `MATCH (draft:QuestionnaireDraft)
         RETURN draft
         ORDER BY draft.updated DESC`
      );

      body = result.map((record) => {
        const draft = record.draft || record;
        return {
          draftId: draft.draftId,
          label: draft.label,
          status: draft.status,
          createdBy: draft.createdBy,
          created: draft.created,
          updated: draft.updated,
        };
      });
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── POST /drafts — create draft from current live config ──────
  router.post('/drafts', async (request, response) => {
    let statusCode = 201;
    let body = null;

    try {
      const label = request.body.label || 'Untitled Draft';
      const creator = request.user?.preferred_username || 'system';
      const draftId = randomUUID();

      const liveConfig = await readLiveConfig(database);

      await database.query(
        `CREATE (draft:QuestionnaireDraft {
           draftId:   $draftId,
           label:     $label,
           status:    'DRAFT',
           data:      $data,
           createdBy: $createdBy,
           created:   $now,
           updated:   $now
         })`,
        {
          draftId,
          label,
          data: JSON.stringify(liveConfig),
          createdBy: creator,
          now: new Date().toISOString(),
        }
      );

      body = { draftId, label, status: 'DRAFT' };
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── GET /drafts/:draftId — get draft content ──────────────────
  router.get('/drafts/:draftId', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const result = await database.query(
        `MATCH (draft:QuestionnaireDraft {draftId: $draftId})
         RETURN draft`,
        { draftId: request.params.draftId }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Draft not found' };
      } else {
        const draft = result[0].draft || result[0];
        body = {
          draftId: draft.draftId,
          label: draft.label,
          status: draft.status,
          data: JSON.parse(draft.data),
          createdBy: draft.createdBy,
          created: draft.created,
          updated: draft.updated,
        };
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── PUT /drafts/:draftId — update draft (full JSON) ───────────
  router.put('/drafts/:draftId', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { draftId } = request.params;
      const { label, data } = request.body;

      // Verify draft exists and is still DRAFT
      const existing = await database.query(
        `MATCH (draft:QuestionnaireDraft {draftId: $draftId})
         RETURN draft.status AS status`,
        { draftId }
      );

      if (existing.length === 0) {
        statusCode = 404;
        body = { error: 'Draft not found' };
      } else if (existing[0].status === 'PUBLISHED') {
        statusCode = 409;
        body = { error: 'Cannot edit a published draft' };
      } else {
        // Validate data if provided
        if (data) {
          const errors = validateDraftData(data);
          if (errors.length > 0) {
            statusCode = 400;
            body = { error: 'Validation failed', details: errors };
            response.status(statusCode).json(body);
            return;
          }
        }

        const updates = [];
        const params = { draftId, now: new Date().toISOString() };

        if (label !== undefined) {
          updates.push('draft.label = $label');
          params.label = label;
        }
        if (data !== undefined) {
          updates.push('draft.data = $data');
          params.data = JSON.stringify(data);
        }
        updates.push('draft.updated = $now');

        await database.query(
          `MATCH (draft:QuestionnaireDraft {draftId: $draftId})
           SET ${updates.join(', ')}`,
          params
        );

        body = { draftId, updated: true };
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── POST /drafts/:draftId/publish — publish draft ─────────────
  router.post('/drafts/:draftId/publish', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { draftId } = request.params;
      const publisher = request.user?.preferred_username || 'system';

      // Fetch draft
      const draftResult = await database.query(
        `MATCH (draft:QuestionnaireDraft {draftId: $draftId})
         RETURN draft`,
        { draftId }
      );

      if (draftResult.length === 0) {
        statusCode = 404;
        body = { error: 'Draft not found' };
      } else {
        const draft = draftResult[0].draft || draftResult[0];

        if (draft.status === 'PUBLISHED') {
          statusCode = 409;
          body = { error: 'Draft already published' };
        } else {
          const draftData = JSON.parse(draft.data);

          // Validate before publish
          const errors = validateDraftData(draftData);
          if (errors.length > 0) {
            statusCode = 400;
            body = { error: 'Draft validation failed', details: errors };
          } else {
            const publishResult = await publishDraft(
              database, draftData, draft.label, publisher
            );

            // Mark draft as published
            await database.query(
              `MATCH (draft:QuestionnaireDraft {draftId: $draftId})
               SET draft.status      = 'PUBLISHED',
                   draft.publishedBy = $publishedBy,
                   draft.publishedAt = $now,
                   draft.updated     = $now`,
              { draftId, publishedBy: publisher, now: new Date().toISOString() }
            );

            body = {
              draftId,
              status: 'PUBLISHED',
              questionnaireVersion: publishResult.questionnaireVersion,
              statementsExecuted: publishResult.statementCount,
            };
          }
        }
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── DELETE /drafts/:draftId — delete unpublished draft ────────
  router.delete('/drafts/:draftId', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { draftId } = request.params;

      const existing = await database.query(
        `MATCH (draft:QuestionnaireDraft {draftId: $draftId})
         RETURN draft.status AS status`,
        { draftId }
      );

      if (existing.length === 0) {
        statusCode = 404;
        body = { error: 'Draft not found' };
      } else if (existing[0].status === 'PUBLISHED') {
        statusCode = 409;
        body = { error: 'Cannot delete a published draft' };
      } else {
        await database.query(
          `MATCH (draft:QuestionnaireDraft {draftId: $draftId}) DETACH DELETE draft`,
          { draftId }
        );
        body = { deleted: true };
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── DELETE /versions/:version — delete unused version ─────────
  router.delete('/versions/:version', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { version } = request.params;

      // Check if snapshot exists
      const snapshotResult = await database.query(
        `MATCH (snapshot:QuestionnaireSnapshot {version: $version})
         RETURN snapshot.version AS version`,
        { version }
      );

      if (snapshotResult.length === 0) {
        statusCode = 404;
        body = { error: 'Version not found' };
      } else {
        // Block deletion of the current live version
        const scoringConfiguration = await loadScoringConfiguration(database);
        const currentVersion = scoringConfiguration.questionnaireVersion || null;

        if (version === currentVersion) {
          statusCode = 403;
          body = { error: 'Cannot delete the current live version. Publish a different version first.' };
        } else {
          // Count active reviews using this version
          const reviewResult = await database.query(
            `MATCH (review:Review {questionnaireVersion: $version, active: true})
             RETURN count(review) AS reviewCount`,
            { version }
          );
          const reviewCount = reviewResult[0]?.reviewCount?.low ?? reviewResult[0]?.reviewCount ?? 0;

          if (reviewCount > 0) {
            statusCode = 409;
            body = { error: `Cannot delete version with ${reviewCount} active assessment(s).` };
          } else {
            // Safe to hard-delete — no reviews, not current
            await database.query(
              `MATCH (snapshot:QuestionnaireSnapshot {version: $version}) DETACH DELETE snapshot`,
              { version }
            );
            body = { deleted: true, version };
          }
        }
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── POST /import — import from YAML text body ────────────────
  router.post('/import', async (request, response) => {
    let statusCode = 201;
    let body = null;

    try {
      const { yamlContent, label } = request.body;

      if (!yamlContent || typeof yamlContent !== 'string') {
        statusCode = 400;
        body = { error: 'yamlContent (string) is required' };
        response.status(statusCode).json(body);
        return;
      }

      const parsed = yaml.load(yamlContent);
      if (!parsed || !Array.isArray(parsed.domains)) {
        statusCode = 400;
        body = { error: 'Invalid YAML — must contain a "domains" array' };
        response.status(statusCode).json(body);
        return;
      }

      // Convert YAML structure to draft data shape
      const scoreScales = parsed.score_scales || {};
      const naScore = parsed.na_score ?? 1;

      const draftData = {
        classification: parsed.classification_question ? {
          text: parsed.classification_question.text,
          choices: parsed.classification_question.choices.map((choice, index) => ({
            text: choice.text, factor: choice.factor, sortOrder: index,
          })),
        } : null,
        source: parsed.source_question ? {
          text: parsed.source_question.text,
          choices: parsed.source_question.choices.map((choice, index) => ({
            text: choice.text, source: choice.source, sortOrder: index,
          })),
        } : null,
        environment: parsed.environment_question ? {
          text: parsed.environment_question.text,
          choices: parsed.environment_question.choices.map((choice, index) => ({
            text: choice.text, environment: choice.environment, sortOrder: index,
          })),
        } : null,
        archetypes: Object.entries(parsed.deployment_archetypes || {}).map(
          ([code, meta], index) => ({
            code, label: meta.label, description: meta.description,
            source: meta.source, environment: meta.environment, sortOrder: index,
          })
        ),
        domains: parsed.domains.map((domain, domainIndex) => ({
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
              guidance: question.guidance || null,
              responsibleFunction: question.responsible_function || null,
            };
          }),
        })),
        weightTiers: Object.entries(parsed.weight_tiers || {}).map(
          ([name, value]) => ({ name, value })
        ),
        complianceSources: parsed.compliance_sources || {},
      };

      const creator = request.user?.preferred_username || 'system';
      const draftId = randomUUID();
      const draftLabel = label || parsed.questionnaire_label || 'YAML Import';

      await database.query(
        `CREATE (draft:QuestionnaireDraft {
           draftId:   $draftId,
           label:     $label,
           status:    'DRAFT',
           data:      $data,
           createdBy: $createdBy,
           created:   $now,
           updated:   $now
         })`,
        {
          draftId,
          label: draftLabel,
          data: JSON.stringify(draftData),
          createdBy: creator,
          now: new Date().toISOString(),
        }
      );

      body = { draftId, label: draftLabel, status: 'DRAFT' };
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── GET /export — export live config as YAML or JSON ──────────
  router.get('/export', async (request, response) => {
    let statusCode = 200;

    try {
      const format = request.query.format || 'json';
      const liveConfig = await readLiveConfig(database);

      if (format === 'yaml') {
        const yamlData = buildYamlExport(liveConfig);
        const yamlString = yaml.dump(yamlData, { lineWidth: 120, noRefs: true });
        response.set('Content-Type', 'text/yaml');
        response.set('Content-Disposition', 'attachment; filename="asr_questions.yaml"');
        response.send(yamlString);
      } else {
        response.json(liveConfig);
      }
    } catch (error) {
      statusCode = 500;
      response.status(statusCode).json({ error: error.message });
    }
  });

  return router;
}

// ────────────────────────────────────────────────────────────────────
// Score derivation — from risk level and choice count
// (duplicated from configureFromYaml.mjs — shared for YAML import)
// ────────────────────────────────────────────────────────────────────

function deriveChoiceScores(choices, scoreScales) {
  const choiceCount = choices.length;
  const scale = scoreScales[choiceCount];

  if (!scale) {
    const result = choices.map((_, index) =>
      Math.round(15 + (index / (choiceCount - 1)) * 70)
    );
    return result;
  }

  const result = choices.map((choice) => scale[choice.risk] || 50);
  return result;
}
