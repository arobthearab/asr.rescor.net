// ════════════════════════════════════════════════════════════════════
// Gate Routes — Functional-authority attestation + pre-fill logic
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import {
  questionMeasurement,
  loadScoringConfiguration,
} from '../scoring.mjs';
import { authorize, requireOwnershipOrAdmin } from '../middleware/authorize.mjs';
import { verifyReviewTenant } from '../persistence/ReviewStore.mjs';

// ────────────────────────────────────────────────────────────────────
// createGateRouter
// ────────────────────────────────────────────────────────────────────

export function createGateRouter(database, stormService) {
  const router = Router();

  // ── GET /gates — list active gate questions (config-level) ────
  router.get('/gates', async (request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      const { questionnaireId } = request.query;
      const tenantId = request.user?.tenantId || null;

      const cypher = questionnaireId
        ? `MATCH (gq:GateQuestion)-[:APPLIES_TO]->(q:Questionnaire {questionnaireId: $questionnaireId})
           WHERE gq.active = true
             AND (gq.tenantId = $tenantId OR gq.tenantId IS NULL OR $tenantId IS NULL)
           RETURN gq
           ORDER BY gq.sortOrder`
        : `MATCH (gq:GateQuestion)
           WHERE gq.active = true
             AND (gq.tenantId = $tenantId OR gq.tenantId IS NULL OR $tenantId IS NULL)
           RETURN gq
           ORDER BY gq.sortOrder`;

      const result = await database.query(cypher, { questionnaireId: questionnaireId || '', tenantId });

      body = result.map((record) => {
        const gate = record.gq || record;
        return {
          gateId: gate.gateId,
          function: gate.function,
          text: gate.text,
          choices: gate.choices || [],
          sortOrder: gate.sortOrder,
        };
      });
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── GET /reviews/:reviewId/gates — gate answers for a review ──
  router.get(
    '/reviews/:reviewId/gates',
    authorize('admin', 'reviewer', 'user', 'auditor'),
    async (request, response) => {
      let statusCode = 200;
      let body = [];

      try {
        const { reviewId } = request.params;
        const isAdmin = (request.user?.roles || []).includes('admin');
        const ownedReview = await verifyReviewTenant(database, reviewId, request.user?.tenantId, isAdmin);

        if (!ownedReview) {
          statusCode = 404;
          body = { error: 'Review not found' };
          response.status(statusCode).json(body);
          return;
        }

        const result = await database.query(
          `MATCH (review:Review {reviewId: $reviewId})
           OPTIONAL MATCH (review)-[:USES_QUESTIONNAIRE]->(q:Questionnaire)
           WITH review, q
           CALL {
             WITH q
             WITH q WHERE q IS NOT NULL
             MATCH (gq:GateQuestion)-[:APPLIES_TO]->(q)
             WHERE gq.active = true
             RETURN gq
             UNION
             WITH q
             WITH q WHERE q IS NULL
             MATCH (gq:GateQuestion)
             WHERE gq.active = true
             RETURN gq
           }
           OPTIONAL MATCH (ga:GateAnswer {reviewId: $reviewId, gateId: gq.gateId})
           RETURN gq, ga
           ORDER BY gq.sortOrder`,
          { reviewId }
        );

        body = result.map((record) => {
          const gate = record.gq || {};
          const answer = record.ga || null;
          return {
            gateId: gate.gateId,
            function: gate.function,
            text: gate.text,
            choices: gate.choices || [],
            sortOrder: gate.sortOrder,
            answer: answer
              ? {
                  choiceIndex: answer.choiceIndex,
                  respondedBy: answer.respondedBy,
                  respondedAt: answer.respondedAt,
                  evidenceNotes: answer.evidenceNotes || '',
                }
              : null,
          };
        });
      } catch (error) {
        statusCode = 500;
        body = { error: error.message };
      }

      response.status(statusCode).json(body);
    }
  );

  // ── PUT /reviews/:reviewId/gates/:gateId — answer + pre-fill ──
  router.put(
    '/reviews/:reviewId/gates/:gateId',
    authorize('admin', 'reviewer'),
    requireOwnershipOrAdmin(database),
    async (request, response) => {
      let statusCode = 200;
      let body = null;

      try {
        const { reviewId, gateId } = request.params;
        const { choiceIndex, evidenceNotes } = request.body;
        const respondedBy = request.user?.preferred_username || 'system';
        const now = new Date().toISOString();

        if (choiceIndex == null || typeof choiceIndex !== 'number') {
          statusCode = 400;
          body = { error: 'choiceIndex is required and must be a number.' };
          response.status(statusCode).json(body);
          return;
        }

        // Load gate question
        const gateResult = await database.query(
          `MATCH (gq:GateQuestion {gateId: $gateId, active: true})
           RETURN gq`,
          { gateId }
        );

        if (gateResult.length === 0) {
          statusCode = 404;
          body = { error: `Gate question "${gateId}" not found.` };
          response.status(statusCode).json(body);
          return;
        }

        const gate = gateResult[0].gq || gateResult[0];
        const prefillRules = JSON.parse(gate.prefillRules || '{}');
        const rules = prefillRules[String(choiceIndex)] || [];

        // Verify review exists
        const reviewCheck = await database.query(
          `MATCH (review:Review {reviewId: $reviewId}) RETURN review`,
          { reviewId }
        );
        if (reviewCheck.length === 0) {
          statusCode = 404;
          body = { error: `Review "${reviewId}" not found.` };
          response.status(statusCode).json(body);
          return;
        }

        // ── Clear previous gate answers for this gate ───────────
        await clearGateAnswers(database, reviewId, gateId);

        // ── Store gate answer ───────────────────────────────────
        await database.query(
          `MERGE (ga:GateAnswer {reviewId: $reviewId, gateId: $gateId})
           SET ga.choiceIndex    = $choiceIndex,
               ga.respondedBy   = $respondedBy,
               ga.respondedAt   = $now,
               ga.evidenceNotes = $evidenceNotes`,
          {
            reviewId,
            gateId,
            choiceIndex,
            respondedBy,
            now,
            evidenceNotes: evidenceNotes || '',
          }
        );

        // ── Apply pre-fill rules ────────────────────────────────
        const preFilled = await applyPreFillRules(database, reviewId, gateId, rules, respondedBy, now);

        // ── Recompute review score ──────────────────────────────
        await recomputeReviewScore(database, reviewId, request.user?.tenantId, stormService);

        body = {
          gateId,
          choiceIndex,
          preFilledCount: preFilled.length,
          preFilled,
        };
      } catch (error) {
        console.error('[gates] PUT error:', error);
        statusCode = 500;
        body = { error: error.message };
      }

      response.status(statusCode).json(body);
    }
  );

  // ── DELETE /reviews/:reviewId/gates/:gateId — undo pre-fills ──
  router.delete(
    '/reviews/:reviewId/gates/:gateId',
    authorize('admin', 'reviewer'),
    requireOwnershipOrAdmin(database),
    async (request, response) => {
      let statusCode = 200;
      let body = null;

      try {
        const { reviewId, gateId } = request.params;

        // Clear gated answers + gate answer node
        const cleared = await clearGateAnswers(database, reviewId, gateId);

        // Delete gate answer node
        await database.query(
          `MATCH (ga:GateAnswer {reviewId: $reviewId, gateId: $gateId})
           DELETE ga`,
          { reviewId, gateId }
        );

        // Recompute review score
        await recomputeReviewScore(database, reviewId, request.user?.tenantId, stormService);

        body = {
          gateId,
          clearedCount: cleared,
        };
      } catch (error) {
        statusCode = 500;
        body = { error: error.message };
      }

      response.status(statusCode).json(body);
    }
  );

  return router;
}

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

// ── applyPreFillRules — create/update answers for pre-fill targets

async function applyPreFillRules(database, reviewId, gateId, rules, respondedBy, now) {
  const preFilled = [];

  const weightTierMap = await loadWeightTierMap(database);
  const reviewResult = await database.query(
    `MATCH (review:Review {reviewId: $reviewId})
     RETURN review.classificationFactor AS classificationFactor`,
    { reviewId }
  );
  const classificationFactor = reviewResult[0]?.classificationFactor ?? 0;

  for (const rule of rules) {
    const { questionId: ruleQuestionId, domainIndex, questionIndex, choiceIndex: targetChoiceIndex } = rule;

    if (targetChoiceIndex == null) continue;

    // Support both questionId-based and positional lookup
    let questionResult;
    if (ruleQuestionId) {
      questionResult = await database.query(
        `MATCH (question:Question {questionId: $questionId})
         RETURN question`,
        { questionId: ruleQuestionId }
      );
    } else {
      questionResult = await database.query(
        `MATCH (question:Question {domainIndex: $domainIndex, questionIndex: $questionIndex})
         RETURN question`,
        { domainIndex, questionIndex }
      );
    }

    if (questionResult.length === 0) continue;

    const question = questionResult[0].question || questionResult[0];
    let rawScore = 0;
    let choiceText = '';

    if (targetChoiceIndex === -1) {
      rawScore = question.naScore ?? 1;
      choiceText = 'N/A';
    } else {
      const scores = question.choiceScores || [];
      const choices = question.choices || [];
      rawScore = scores[targetChoiceIndex] ?? 0;
      choiceText = choices[targetChoiceIndex] ?? '';
    }

    const weightValue = weightTierMap[question.weightTier] ?? 0;
    const measurement = questionMeasurement(rawScore, weightValue, classificationFactor);

    // Use indices from the resolved question node (handles both lookup modes)
    const resolvedDomainIndex = question.domainIndex;
    const resolvedQuestionIndex = question.questionIndex;

    // MERGE answer with gatedBy marker
    await database.query(
      `MATCH (review:Review {reviewId: $reviewId})
       MATCH (question:Question {domainIndex: $domainIndex, questionIndex: $questionIndex})
       MERGE (review)-[:CONTAINS]->(answer:Answer {domainIndex: $domainIndex, questionIndex: $questionIndex})
       SET answer.questionId    = question.questionId,
           answer.choiceText    = $choiceText,
           answer.questionText  = question.text,
           answer.rawScore      = $rawScore,
           answer.weightTier    = $weightTier,
           answer.measurement   = $measurement,
           answer.notes         = CASE WHEN answer.gatedBy IS NULL THEN coalesce(answer.notes, '') ELSE answer.notes END,
           answer.gatedBy       = $gateId,
           answer.updated       = $now,
           answer.updatedBy     = $respondedBy
       MERGE (answer)-[:ANSWERS]->(question)`,
      {
        reviewId,
        domainIndex: resolvedDomainIndex,
        questionIndex: resolvedQuestionIndex,
        choiceText,
        rawScore,
        weightTier: question.weightTier,
        measurement,
        gateId,
        now,
        respondedBy,
      }
    );

    preFilled.push({ domainIndex: resolvedDomainIndex, questionIndex: resolvedQuestionIndex, choiceText, rawScore });
  }

  return preFilled;
}

// ── clearGateAnswers — reset answers that were gated by this gate

async function clearGateAnswers(database, reviewId, gateId) {
  const result = await database.query(
    `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer)
     WHERE answer.gatedBy = $gateId
     SET answer.choiceText   = '',
         answer.rawScore     = 0,
         answer.measurement  = 0,
         answer.gatedBy      = null,
         answer.updated      = $now,
         answer.updatedBy    = 'system'
     RETURN count(answer) AS cleared`,
    { reviewId, gateId, now: new Date().toISOString() }
  );

  return result[0]?.cleared ?? 0;
}

// ── recomputeReviewScore — recalc from all current answers

async function recomputeReviewScore(database, reviewId, tenantId, stormService) {
  const scoringConfiguration = await loadScoringConfiguration(database, tenantId);

  const answersResult = await database.query(
    `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer)
     WHERE answer.rawScore > 0
     RETURN answer.measurement AS measurement`,
    { reviewId }
  );

  const measurements = answersResult.map((record) => record.measurement ?? 0);
  const overall = await stormService.computeScore(measurements, scoringConfiguration);

  const reviewResult = await database.query(
    `MATCH (review:Review {reviewId: $reviewId})
     RETURN review.classificationFactor AS classificationFactor`,
    { reviewId }
  );
  const classificationFactor = reviewResult[0]?.classificationFactor ?? 0;

  await database.query(
    `MATCH (review:Review {reviewId: $reviewId})
     SET review.classificationFactor = $classificationFactor,
         review.rskRaw               = $rskRaw,
         review.rskNormalized        = $rskNormalized,
         review.rating               = $rating,
         review.updated              = $now,
         review.updatedBy            = 'system'`,
    {
      reviewId,
      classificationFactor,
      rskRaw: overall.raw,
      rskNormalized: overall.normalized,
      rating: overall.rating,
      now: new Date().toISOString(),
    }
  );
}

// ── loadWeightTierMap

async function loadWeightTierMap(database) {
  const result = await database.query(
    `MATCH (tier:WeightTier) RETURN tier.name AS name, tier.value AS value`
  );

  const tierMap = {};
  for (const record of result) {
    tierMap[record.name] = record.value;
  }

  return tierMap;
}
