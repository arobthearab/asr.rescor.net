// ════════════════════════════════════════════════════════════════════
// Config Route — serves questionnaire + scoring configuration
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { loadScoringConfiguration } from '../scoring.mjs';

// ────────────────────────────────────────────────────────────────────
// createConfigRouter
// ────────────────────────────────────────────────────────────────────

export function createConfigRouter(database) {
  const router = Router();

  // ── Full questionnaire structure ───────────────────────────────
  // Supports ?version=<hash> to retrieve a historical snapshot.
  router.get('/', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const requestedVersion = request.query.version || null;
      const tenantId = request.user?.tenantId || null;

      if (requestedVersion) {
        // ── Historical snapshot lookup ───────────────────────────
        const snapshotResult = await database.query(
          `MATCH (snapshot:QuestionnaireSnapshot {version: $version})
           WHERE snapshot.tenantId = $tenantId OR snapshot.tenantId IS NULL OR $tenantId IS NULL
           RETURN snapshot.data AS data, snapshot.label AS label`,
          { version: requestedVersion, tenantId }
        );

        if (snapshotResult.length === 0) {
          statusCode = 404;
          body = { error: `Questionnaire version "${requestedVersion}" not found` };
        } else {
          body = JSON.parse(snapshotResult[0].data);
        }
      } else {
        // ── Current (live) questionnaire ──────────────────────────
        const scoringConfiguration = await loadScoringConfiguration(database, tenantId);

        const classificationResult = await database.query(
          `MATCH (classification:ClassificationQuestion)-[:HAS_CHOICE]->(choice:ClassificationChoice)
           RETURN classification, choice
           ORDER BY choice.sortOrder`
        );

        const sourceResult = await database.query(
          `MATCH (sourceQuestion:SourceQuestion)-[:HAS_CHOICE]->(choice:SourceChoice)
           RETURN sourceQuestion, choice
           ORDER BY choice.sortOrder`
        );

        const environmentResult = await database.query(
          `MATCH (environmentQuestion:EnvironmentQuestion)-[:HAS_CHOICE]->(choice:EnvironmentChoice)
           RETURN environmentQuestion, choice
           ORDER BY choice.sortOrder`
        );

        const archetypeResult = await database.query(
          `MATCH (archetype:DeploymentArchetype)
           RETURN archetype
           ORDER BY archetype.sortOrder`
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

        const policyLookupMap = await loadPolicyLookup(database);
        const csfLookupMap = await loadCsfLookup(database);
        const tagConfigMap = await loadComplianceTagConfigs(database, tenantId);

        const questionnairesResult = await database.query(
          `MATCH (q:Questionnaire)
           OPTIONAL MATCH (q)-[:CURRENT_VERSION]->(s:QuestionnaireSnapshot)
           RETURN q.questionnaireId AS questionnaireId,
                  q.name            AS name,
                  q.active          AS active,
                  s.version         AS currentVersion
           ORDER BY q.name`
        );

        body = {
          scoringConfiguration,
          questionnaires: questionnairesResult.map((record) => ({
            questionnaireId: record.questionnaireId,
            name: record.name,
            active: record.active,
            currentVersion: record.currentVersion || null,
          })),
          classification: buildClassificationResponse(classificationResult),
          source: buildTranscendentalResponse(sourceResult, 'sourceQuestion', 'source'),
          environment: buildTranscendentalResponse(environmentResult, 'environmentQuestion', 'environment'),
          archetypes: archetypeResult.map((record) => record.archetype || record),
          domains: buildDomainsResponse(domainsResult, policyLookupMap, csfLookupMap, tagConfigMap),
          weightTiers: weightTiersResult.map((record) => record.tier || record),
        };
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Scoring config only ────────────────────────────────────────
  router.get('/scoring', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      body = await loadScoringConfiguration(database, request.user?.tenantId);
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Available questionnaire versions ───────────────────────────
  router.get('/versions', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const questionnaireId = request.query.questionnaireId || null;
      const tenantId = request.user?.tenantId || null;

      // Determine current versions from Questionnaire → CURRENT_VERSION
      const currentVersionsResult = await database.query(
        `MATCH (q:Questionnaire)-[:CURRENT_VERSION]->(s:QuestionnaireSnapshot)
         WHERE s.tenantId = $tenantId OR s.tenantId IS NULL OR $tenantId IS NULL
         RETURN s.version AS version`,
        { tenantId }
      );
      const currentVersionSet = new Set(
        currentVersionsResult.map((record) => record.version)
      );

      // Build snapshot query with optional questionnaireId filter
      const snapshotCypher = questionnaireId
        ? `MATCH (snapshot:QuestionnaireSnapshot)-[:VERSION_OF]->(q:Questionnaire {questionnaireId: $questionnaireId})
           WHERE snapshot.tenantId = $tenantId OR snapshot.tenantId IS NULL OR $tenantId IS NULL
           OPTIONAL MATCH (review:Review {questionnaireVersion: snapshot.version, active: true})
           RETURN snapshot.version AS version,
                  snapshot.label   AS label,
                  toString(snapshot.created) AS created,
                  count(review)    AS reviewCount
           ORDER BY snapshot.created DESC`
        : `MATCH (snapshot:QuestionnaireSnapshot)
           WHERE snapshot.tenantId = $tenantId OR snapshot.tenantId IS NULL OR $tenantId IS NULL
           OPTIONAL MATCH (review:Review {questionnaireVersion: snapshot.version, active: true})
           RETURN snapshot.version AS version,
                  snapshot.label   AS label,
                  toString(snapshot.created) AS created,
                  count(review)    AS reviewCount
           ORDER BY snapshot.created DESC`;

      const snapshotParams = questionnaireId ? { questionnaireId, tenantId } : { tenantId };
      const result = await database.query(snapshotCypher, snapshotParams);

      body = {
        versions: result.map((record) => ({
          version: record.version,
          label: record.label,
          created: record.created,
          current: currentVersionSet.has(record.version),
          reviewCount: record.reviewCount?.low ?? record.reviewCount ?? 0,
        })),
      };
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  return router;
}

// ────────────────────────────────────────────────────────────────────
// loadPolicyLookup — reference → { title, tag, url } map
// ────────────────────────────────────────────────────────────────────

async function loadPolicyLookup(database) {
  const result = await database.query(
    `MATCH (policy:Policy)
     RETURN policy.reference AS reference, policy.title AS title,
            policy.tag AS tag, policy.url AS url`
  );

  const lookupMap = {};
  for (const record of result) {
    lookupMap[record.reference] = {
      title: record.title,
      tag: record.tag || 'Policy',
      url: record.url || null,
    };
  }

  return lookupMap;
}

// ────────────────────────────────────────────────────────────────────
// loadCsfLookup — code → { tooltip, description } map
// ────────────────────────────────────────────────────────────────────

async function loadCsfLookup(database) {
  const result = await database.query(
    `MATCH (csf:CsfSubcategory)
     RETURN csf.code AS code, csf.category AS category,
            csf.function AS function, csf.description AS description`
  );

  const lookupMap = {};
  for (const record of result) {
    lookupMap[record.code] = {
      tooltip: `${record.function}: ${record.category}`,
      description: record.description || null,
    };
  }

  return lookupMap;
}

// ────────────────────────────────────────────────────────────────────
// buildClassificationResponse
// ────────────────────────────────────────────────────────────────────

function buildClassificationResponse(records) {
  let answer = { text: '', choices: [] };

  if (records.length > 0) {
    const firstRecord = records[0];
    const classification = firstRecord.classification || {};
    answer.text = classification.text || '';
    answer.naAllowed = classification.naAllowed ?? false;
    answer.choices = records.map((record) => {
      const choice = record.choice || {};
      return {
        text: choice.text,
        factor: choice.factor,
        sortOrder: choice.sortOrder,
      };
    });
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// buildTranscendentalResponse — generic source/environment question
// ────────────────────────────────────────────────────────────────────

function buildTranscendentalResponse(records, questionKey, codeKey) {
  let answer = { text: '', choices: [] };

  if (records.length > 0) {
    const firstRecord = records[0];
    const question = firstRecord[questionKey] || {};
    answer.text = question.text || '';
    answer.naAllowed = question.naAllowed ?? false;
    answer.choices = records.map((record) => {
      const choice = record.choice || {};
      return {
        text: choice.text,
        [codeKey]: choice[codeKey],
        sortOrder: choice.sortOrder,
      };
    });
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// loadComplianceTagConfigs — tag → { action, baseUrl? } map
// ────────────────────────────────────────────────────────────────────

async function loadComplianceTagConfigs(database, tenantId) {
  const result = await database.query(
    `MATCH (config:ComplianceTagConfig)
     WHERE config.tenantId = $tenantId OR config.tenantId IS NULL OR $tenantId IS NULL
     RETURN config.tag AS tag, config.action AS action, config.baseUrl AS baseUrl`,
    { tenantId: tenantId || null }
  );

  const configMap = {};
  for (const record of result) {
    configMap[record.tag] = {
      action: record.action || null,
      baseUrl: record.baseUrl || null,
    };
  }

  return configMap;
}

// ────────────────────────────────────────────────────────────────────
// buildDomainsResponse
// ────────────────────────────────────────────────────────────────────

function buildDomainsResponse(records, policyLookupMap, csfLookupMap, tagConfigMap) {
  const answer = records.map((record) => {
    const domain = record.domain || {};
    const questions = buildQuestionsResponse(record.questions || []);
    const complianceRefs = buildComplianceReferences(domain, policyLookupMap, csfLookupMap, tagConfigMap);

    return {
      domainIndex: domain.domainIndex,
      name: domain.name,
      policyRefs: domain.policyRefs || [],
      csfRefs: domain.csfRefs || [],
      complianceRefs,
      questions,
    };
  });

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// buildQuestionsResponse — sort and shape question records
// ────────────────────────────────────────────────────────────────────

function buildQuestionsResponse(questions) {
  const answer = questions
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
      responsibleFunction: question.responsibleFunction || null,
    }));

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// buildComplianceReferences — CSF, note, and policy refs with actions
// ────────────────────────────────────────────────────────────────────
// Resolution cascade per ComplianceTagConfig:
//   action='link'   → url from Policy node (explicit) or derived from baseUrl
//   action='dialog' → description text (CSF description / note text)
//   no config       → tooltip only (no click action)

function buildComplianceReferences(domain, policyLookupMap, csfLookupMap, tagConfigMap) {
  const references = [];

  // NIST CSF subcategory references
  const nistConfig = tagConfigMap['NIST'] || null;
  for (const code of domain.csfRefs || []) {
    const lookup = csfLookupMap[code] || {};
    const reference = { tag: 'NIST', code, tooltip: lookup.tooltip || null };
    if (nistConfig) {
      reference.action = nistConfig.action;
      if (nistConfig.action === 'dialog') {
        reference.description = lookup.description || null;
      }
    }
    references.push(reference);
  }

  // Compliance notes — generic: any property ending in "Note"
  appendNoteReferences(domain, tagConfigMap, references);

  // Client-supplied policies (tag comes from Policy node data)
  appendPolicyReferences(domain.policyRefs || [], policyLookupMap, tagConfigMap, references);

  return references;
}

// ────────────────────────────────────────────────────────────────────
// appendNoteReferences — extract §-sections from any *Note property
// ────────────────────────────────────────────────────────────────────

function appendNoteReferences(domain, tagConfigMap, references) {
  const notePattern = /^(.+)Note$/;

  for (const [property, value] of Object.entries(domain)) {
    if (value == null) {
      continue;
    }
    const match = property.match(notePattern);
    if (match == null) {
      continue;
    }

    const framework = match[1].toUpperCase();
    const tagConfig = tagConfigMap[framework] || null;
    const sections = value.match(/§[\d.]+/g) || [];
    for (const section of sections) {
      const reference = { tag: framework, code: section, tooltip: value };
      if (tagConfig) {
        reference.action = tagConfig.action;
        if (tagConfig.action === 'dialog') {
          reference.description = value;
        }
      }
      references.push(reference);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// appendPolicyReferences — enrich policy refs with tag, url, action
// ────────────────────────────────────────────────────────────────────

function appendPolicyReferences(policyRefs, policyLookupMap, tagConfigMap, references) {
  for (const code of policyRefs) {
    const lookup = policyLookupMap[code] || {};
    const tag = lookup.tag || 'Policy';
    const tagConfig = tagConfigMap[tag] || null;
    const reference = {
      tag,
      code,
      tooltip: lookup.title || null,
    };
    if (tagConfig) {
      reference.action = tagConfig.action;
      if (tagConfig.action === 'link') {
        reference.url = lookup.url || null;
      }
    }
    references.push(reference);
  }
}
