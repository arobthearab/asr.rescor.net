// ════════════════════════════════════════════════════════════════════
// Remediation Routes — POAM CRUD for a review
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { authorize } from '../middleware/authorize.mjs';

// ────────────────────────────────────────────────────────────────────
// Default function classification per question (domainIndex:questionIndex)
// Serves as fallback until responsibleFunction is on Question nodes.
// ────────────────────────────────────────────────────────────────────

const FUNCTION_MAP = buildFunctionMap({
  LEGAL:   [[1,10], [3,1], [3,8], [3,9], [3,10], [3,11], [3,12], [4,8], [4,9], [4,10], [6,6], [6,7]],
  ERM:     [[7,6], [8,1], [8,2], [8,3], [11,1], [11,2]],
  EA:      [[1,4], [1,5], [1,11], [7,1], [7,5]],
  SEPG:    [[4,1], [4,2], [4,3], [4,4], [4,5], [4,6], [4,7], [5,1], [5,2], [5,3], [5,6], [5,7], [5,8]],
  SAE:     [[2,1],[2,2],[2,3],[2,4],[2,5],[2,6],[2,7],[2,8],[2,9],[2,10],[2,11],[2,12],[2,13],
            [3,2],[3,3],[3,4],[3,5],[3,6],[3,7], [5,4],[5,5],[5,9],
            [6,1],[6,2],[6,3],[6,4],[6,5], [7,2],[7,3],[7,4],[7,7],[7,8],[7,9],[7,10], [10,1],[10,2],[10,3]],
  GENERAL: [[1,1],[1,2],[1,3],[1,6],[1,7],[1,8],[1,9], [9,1],[9,2]],
});

const VALID_FUNCTIONS = ['LEGAL', 'ERM', 'EA', 'SEPG', 'SAE', 'GENERAL'];
const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'RISK_ACCEPTED'];
const VALID_RESPONSE_TYPES = ['CUSTOM', 'ACCEPT_RISK', 'COMPENSATING_CONTROL', 'REMEDIATION_SCHEDULED', 'RISK_TRANSFER', 'FALSE_POSITIVE'];

const RESPONSE_TYPE_DEFAULTS = {
  CUSTOM:                  0,
  ACCEPT_RISK:             0,
  COMPENSATING_CONTROL:    40,
  REMEDIATION_SCHEDULED:   50,
  RISK_TRANSFER:           30,
  FALSE_POSITIVE:          100,
};

function buildFunctionMap(mapping) {
  const result = new Map();
  for (const [functionCode, pairs] of Object.entries(mapping)) {
    for (const [domainIndex, questionIndex] of pairs) {
      result.set(`${domainIndex}:${questionIndex}`, functionCode);
    }
  }
  return result;
}

function lookupFunction(domainIndex, questionIndex) {
  return FUNCTION_MAP.get(`${domainIndex}:${questionIndex}`) || 'GENERAL';
}

// ────────────────────────────────────────────────────────────────────
// mitigationAggregate — RSK diminishing impact for multiple mitigations
// Same damping formula as rskAggregate: ceil(Σ sorted[i] / dampingFactor^i)
// ────────────────────────────────────────────────────────────────────

function mitigationAggregate(mitigations, dampingFactor = 4) {
  const valid = mitigations
    .filter((value) => typeof value === 'number' && value > 0)
    .sort((first, second) => second - first);

  let answer = 0;

  if (valid.length > 0) {
    let total = 0;
    for (let index = 0; index < valid.length; index++) {
      total += valid[index] / Math.pow(dampingFactor, index);
    }
    answer = Math.min(100, Math.ceil(total));
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// createRemediationRouter
// ────────────────────────────────────────────────────────────────────

export function createRemediationRouter(database) {
  const router = Router();

  // ── GET /api/reviews/:reviewId/remediation ─────────────────────
  // Returns answers with measurement > 25, joined with any existing
  // RemediationItem nodes.  Groups multiple remediations per answer.
  router.get('/:reviewId/remediation', async (request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      const { reviewId } = request.params;

      const rows = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer)
         WHERE answer.measurement > 25
         OPTIONAL MATCH (answer)-[:ANSWERS]->(question:Question)
         OPTIONAL MATCH (answer)-[:HAS_REMEDIATION]->(ri:RemediationItem)
         RETURN answer.domainIndex      AS domainIndex,
                answer.questionIndex    AS questionIndex,
                answer.questionText     AS questionText,
                answer.choiceText       AS choiceText,
                answer.rawScore         AS rawScore,
                answer.weightTier       AS weightTier,
                answer.measurement      AS measurement,
                question.text           AS currentQuestionText,
                question.responsibleFunction AS responsibleFunction,
                ri.remediationId        AS remediationId,
                ri.proposedAction       AS proposedAction,
                ri.assignedFunction     AS assignedFunction,
                ri.assignedTo           AS assignedTo,
                ri.status               AS status,
                ri.responseType         AS responseType,
                ri.mitigationPercent    AS mitigationPercent,
                ri.riskAcceptedBy       AS riskAcceptedBy,
                ri.riskAcceptedAt       AS riskAcceptedAt,
                ri.completedAt          AS completedAt,
                ri.targetDate           AS targetDate,
                ri.notes                AS notes,
                ri.created              AS riCreated,
                ri.updated              AS riUpdated
         ORDER BY answer.measurement DESC, answer.domainIndex, answer.questionIndex`,
        { reviewId }
      );

      // Group rows by answer (domainIndex:questionIndex) to support
      // multiple RemediationItems per answer.
      const groupMap = new Map();

      for (const row of rows) {
        const key = `${row.domainIndex}:${row.questionIndex}`;
        const defaultFunction = row.responsibleFunction
          || lookupFunction(row.domainIndex, row.questionIndex);

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            domainIndex: row.domainIndex,
            questionIndex: row.questionIndex,
            questionText: row.questionText || row.currentQuestionText || '',
            choiceText: row.choiceText,
            rawScore: row.rawScore,
            weightTier: row.weightTier,
            measurement: row.measurement,
            responsibleFunction: defaultFunction,
            remediations: [],
          });
        }

        if (row.remediationId) {
          groupMap.get(key).remediations.push({
            remediationId: row.remediationId,
            proposedAction: row.proposedAction || '',
            assignedFunction: row.assignedFunction || defaultFunction,
            assignedTo: row.assignedTo || null,
            status: row.status || 'OPEN',
            responseType: row.responseType || 'CUSTOM',
            mitigationPercent: typeof row.mitigationPercent === 'number' ? row.mitigationPercent : 0,
            riskAcceptedBy: row.riskAcceptedBy || null,
            riskAcceptedAt: row.riskAcceptedAt || null,
            completedAt: row.completedAt || null,
            targetDate: row.targetDate || null,
            notes: row.notes || '',
            created: row.riCreated || null,
            updated: row.riUpdated || null,
          });
        }
      }

      // Compute combined mitigation + residualRU for each answer
      body = Array.from(groupMap.values()).map((item) => {
        const mitigations = item.remediations.map((r) => r.mitigationPercent);
        const combined = mitigationAggregate(mitigations);
        const residual = Math.max(0, Math.round(item.measurement * (1 - combined / 100)));
        return { ...item, combinedMitigation: combined, residualRU: residual };
      });
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── POST /api/reviews/:reviewId/remediation/generate ───────────
  // Auto-create RemediationItem nodes for high-RU answers that don't
  // already have one.
  router.post('/:reviewId/remediation/generate', authorize('admin', 'reviewer'), async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { reviewId } = request.params;
      const assessor = request.user?.preferred_username || 'system';
      const now = new Date().toISOString();

      // Find answers > 25 RU without a RemediationItem
      const unplanned = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer)
         WHERE answer.measurement > 25
           AND NOT (answer)-[:HAS_REMEDIATION]->(:RemediationItem)
         RETURN answer.domainIndex   AS domainIndex,
                answer.questionIndex AS questionIndex`,
        { reviewId }
      );

      let createdCount = 0;
      for (const row of unplanned) {
        const remediationId = randomUUID();
        const assignedFunction = lookupFunction(row.domainIndex, row.questionIndex);

        await database.query(
          `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer {domainIndex: $domainIndex, questionIndex: $questionIndex})
           CREATE (answer)-[:HAS_REMEDIATION]->(ri:RemediationItem {
             remediationId:     $remediationId,
             proposedAction:    '',
             assignedFunction:  $assignedFunction,
             assignedTo:        null,
             status:            'OPEN',
             responseType:      'CUSTOM',
             mitigationPercent: 0,
             riskAcceptedBy:    null,
             riskAcceptedAt:    null,
             completedAt:       null,
             targetDate:        null,
             notes:             '',
             created:           $now,
             createdBy:         $assessor,
             updated:           $now,
             updatedBy:         $assessor
           })`,
          {
            reviewId,
            domainIndex: row.domainIndex,
            questionIndex: row.questionIndex,
            remediationId,
            assignedFunction,
            now,
            assessor,
          }
        );
        createdCount++;
      }

      body = { created: createdCount };
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── POST /api/reviews/:reviewId/remediation/add ────────────────
  // Add an additional remediation proposal to an existing answer.
  router.post('/:reviewId/remediation/add', authorize('admin', 'reviewer'), async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { reviewId } = request.params;
      const { domainIndex, questionIndex, proposedAction, assignedFunction, responseType, mitigationPercent } = request.body;
      const assessor = request.user?.preferred_username || 'system';
      const now = new Date().toISOString();
      const remediationId = randomUUID();

      if (typeof domainIndex !== 'number' || typeof questionIndex !== 'number') {
        statusCode = 400;
        body = { error: 'domainIndex and questionIndex are required' };
        response.status(statusCode).json(body);
        return;
      }

      const safeFunction = VALID_FUNCTIONS.includes(assignedFunction) ? assignedFunction : lookupFunction(domainIndex, questionIndex);
      const safeResponseType = VALID_RESPONSE_TYPES.includes(responseType) ? responseType : 'CUSTOM';
      const safeMitigation = typeof mitigationPercent === 'number'
        ? Math.max(0, Math.min(100, Math.round(mitigationPercent)))
        : RESPONSE_TYPE_DEFAULTS[safeResponseType] || 0;

      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer {domainIndex: $domainIndex, questionIndex: $questionIndex})
         CREATE (answer)-[:HAS_REMEDIATION]->(ri:RemediationItem {
           remediationId:     $remediationId,
           proposedAction:    $proposedAction,
           assignedFunction:  $assignedFunction,
           assignedTo:        null,
           status:            'OPEN',
           responseType:      $responseType,
           mitigationPercent: $mitigationPercent,
           riskAcceptedBy:    null,
           riskAcceptedAt:    null,
           completedAt:       null,
           targetDate:        null,
           notes:             '',
           created:           $now,
           createdBy:         $assessor,
           updated:           $now,
           updatedBy:         $assessor
         })
         RETURN ri`,
        {
          reviewId,
          domainIndex,
          questionIndex,
          remediationId,
          proposedAction: proposedAction || '',
          assignedFunction: safeFunction,
          responseType: safeResponseType,
          mitigationPercent: safeMitigation,
          now,
          assessor,
        }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Answer not found for the specified question' };
      } else {
        body = result[0].ri || result[0];
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── PUT /api/reviews/:reviewId/remediation/:remediationId ──────
  // Update proposed action, function, assignedTo, notes, responseType, mitigationPercent.
  router.put('/:reviewId/remediation/:remediationId', authorize('admin', 'reviewer'), async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { reviewId, remediationId } = request.params;
      const { proposedAction, assignedFunction, assignedTo, notes, responseType, mitigationPercent } = request.body;
      const assessor = request.user?.preferred_username || 'system';
      const now = new Date().toISOString();

      const safeFunction = VALID_FUNCTIONS.includes(assignedFunction) ? assignedFunction : undefined;
      const safeResponseType = VALID_RESPONSE_TYPES.includes(responseType) ? responseType : undefined;
      const safeMitigation = typeof mitigationPercent === 'number'
        ? Math.max(0, Math.min(100, Math.round(mitigationPercent)))
        : undefined;

      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer)-[:HAS_REMEDIATION]->(ri:RemediationItem {remediationId: $remediationId})
         SET ri.proposedAction    = COALESCE($proposedAction, ri.proposedAction),
             ri.assignedFunction  = COALESCE($assignedFunction, ri.assignedFunction),
             ri.assignedTo        = COALESCE($assignedTo, ri.assignedTo),
             ri.notes             = COALESCE($notes, ri.notes),
             ri.responseType      = COALESCE($responseType, ri.responseType),
             ri.mitigationPercent = COALESCE($mitigationPercent, ri.mitigationPercent),
             ri.updated           = $now,
             ri.updatedBy         = $assessor
         RETURN ri`,
        {
          reviewId,
          remediationId,
          proposedAction: proposedAction ?? null,
          assignedFunction: safeFunction ?? null,
          assignedTo: assignedTo ?? null,
          notes: notes ?? null,
          responseType: safeResponseType ?? null,
          mitigationPercent: safeMitigation ?? null,
          now,
          assessor,
        }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Remediation item not found' };
      } else {
        body = result[0].ri || result[0];
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── PATCH /api/reviews/:reviewId/remediation/:remediationId/status ─
  // Change status (OPEN, IN_PROGRESS, COMPLETED).
  router.patch('/:reviewId/remediation/:remediationId/status', authorize('admin', 'reviewer'), async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { reviewId, remediationId } = request.params;
      const { status } = request.body;
      const assessor = request.user?.preferred_username || 'system';
      const now = new Date().toISOString();

      const validStatuses = VALID_STATUSES;
      if (!validStatuses.includes(status)) {
        statusCode = 400;
        body = { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
        response.status(statusCode).json(body);
        return;
      }

      // RISK_ACCEPTED is handled by the dedicated accept-risk endpoint
      if (status === 'RISK_ACCEPTED') {
        statusCode = 400;
        body = { error: 'Use the accept-risk endpoint to mark risk as accepted' };
        response.status(statusCode).json(body);
        return;
      }

      const completedAt = status === 'COMPLETED' ? now : null;

      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer)-[:HAS_REMEDIATION]->(ri:RemediationItem {remediationId: $remediationId})
         SET ri.status      = $status,
             ri.completedAt = $completedAt,
             ri.updated     = $now,
             ri.updatedBy   = $assessor
         RETURN ri`,
        { reviewId, remediationId, status, completedAt, now, assessor }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Remediation item not found' };
      } else {
        body = result[0].ri || result[0];
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── PATCH /api/reviews/:reviewId/remediation/:remediationId/accept-risk ─
  // Mark risk as accepted — admin/reviewer only, NOT the submitting user.
  router.patch('/:reviewId/remediation/:remediationId/accept-risk', authorize('admin', 'reviewer'), async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { reviewId, remediationId } = request.params;
      const acceptedBy = request.user?.sub || request.user?.preferred_username || 'system';
      const now = new Date().toISOString();

      // Verify the accepting user is not the review's assessor (submitter)
      const reviewCheck = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         RETURN review.assessor AS assessor`,
        { reviewId }
      );

      if (reviewCheck.length === 0) {
        statusCode = 404;
        body = { error: 'Review not found' };
        response.status(statusCode).json(body);
        return;
      }

      const reviewAssessor = reviewCheck[0].assessor;
      const currentUsername = request.user?.preferred_username || request.user?.email || '';

      if (currentUsername && reviewAssessor === currentUsername) {
        statusCode = 403;
        body = { error: 'The submitting assessor cannot accept their own risk' };
        response.status(statusCode).json(body);
        return;
      }

      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer)-[:HAS_REMEDIATION]->(ri:RemediationItem {remediationId: $remediationId})
         SET ri.status          = 'RISK_ACCEPTED',
             ri.riskAcceptedBy  = $acceptedBy,
             ri.riskAcceptedAt  = $now,
             ri.updated         = $now,
             ri.updatedBy       = $acceptedBy
         RETURN ri`,
        { reviewId, remediationId, acceptedBy, now }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Remediation item not found' };
      } else {
        body = result[0].ri || result[0];
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  return router;
}
