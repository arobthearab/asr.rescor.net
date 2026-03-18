// ════════════════════════════════════════════════════════════════════
// Answers Route — bulk upsert answers for a review
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import {
  questionMeasurement,
  computeScore,
  loadScoringConfiguration,
  ratingFromNormalized,
} from '../scoring.mjs';
import { authorize, requireOwnershipOrAdmin } from '../middleware/authorize.mjs';

// ────────────────────────────────────────────────────────────────────
// createAnswersRouter
// ────────────────────────────────────────────────────────────────────

export function createAnswersRouter(database) {
  const router = Router();

  // ── Save answers (bulk upsert) ─────────────────────────────────
  router.put('/:reviewId/answers', authorize('admin', 'reviewer'), requireOwnershipOrAdmin(database), async (request, response) => {
    let statusCode = 200;
    let body = null;
    const { reviewId } = request.params;
    const { classificationFactor, answers } = request.body;
    const assessor = request.user?.preferred_username || 'system';
    const now = new Date().toISOString();

    try {
      const scoringConfiguration = await loadScoringConfiguration(database, request.user?.tenantId);
      const weightTierMap = await loadWeightTierMap(database);

      const measurements = await upsertAnswers(
        database, reviewId, answers, weightTierMap, classificationFactor, assessor, now
      );

      const overall = computeScore(measurements, scoringConfiguration);

      await updateReviewScore(
        database, reviewId, classificationFactor, overall, assessor, now
      );

      body = {
        reviewId,
        rskRaw: overall.raw,
        rskNormalized: overall.normalized,
        rating: overall.rating,
        answersProcessed: answers.length,
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
// loadWeightTierMap — name → value lookup
// ────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────
// upsertAnswers — MERGE each answer, return measurement array
// ────────────────────────────────────────────────────────────────────

async function upsertAnswers(database, reviewId, answers, weightTierMap, classificationFactor, assessor, now) {
  const measurements = [];

  for (const item of answers) {
    const weightValue = weightTierMap[item.weightTier] ?? item.weightValue ?? 0;
    const measurement = questionMeasurement(item.rawScore, weightValue, classificationFactor);
    measurements.push(measurement);

    await database.query(
      `MATCH (review:Review {reviewId: $reviewId})
       MATCH (question:Question {domainIndex: $domainIndex, questionIndex: $questionIndex})
       MERGE (review)-[:CONTAINS]->(existingAnswer:Answer {domainIndex: $domainIndex, questionIndex: $questionIndex})
       ON CREATE SET
         existingAnswer.questionId = question.questionId,
         existingAnswer.choiceText = $choiceText,
         existingAnswer.questionText = question.text,
         existingAnswer.rawScore = $rawScore,
         existingAnswer.weightTier = $weightTier,
         existingAnswer.measurement = $measurement,
         existingAnswer.notes = $notes,
         existingAnswer.created = $now,
         existingAnswer.createdBy = $assessor,
         existingAnswer.updated = $now,
         existingAnswer.updatedBy = $assessor
       ON MATCH SET
         existingAnswer.questionId = question.questionId,
         existingAnswer.choiceText = $choiceText,
         existingAnswer.questionText = question.text,
         existingAnswer.rawScore = $rawScore,
         existingAnswer.weightTier = $weightTier,
         existingAnswer.measurement = $measurement,
         existingAnswer.notes = $notes,
         existingAnswer.gatedBy = null,
         existingAnswer.updated = $now,
         existingAnswer.updatedBy = $assessor
       MERGE (existingAnswer)-[:ANSWERS]->(question)`,
      {
        reviewId,
        domainIndex: item.domainIndex,
        questionIndex: item.questionIndex,
        choiceText: item.choiceText,
        rawScore: item.rawScore,
        weightTier: item.weightTier,
        measurement,
        notes: item.notes || '',
        now,
        assessor: assessor || 'system',
      }
    );
  }

  return measurements;
}

// ────────────────────────────────────────────────────────────────────
// updateReviewScore — persist recomputed RSK score on the Review node
// ────────────────────────────────────────────────────────────────────

async function updateReviewScore(database, reviewId, classificationFactor, overall, assessor, now) {
  await database.query(
    `MATCH (review:Review {reviewId: $reviewId})
     SET review.classificationFactor = $classificationFactor,
         review.rskRaw = $rskRaw,
         review.rskNormalized = $rskNormalized,
         review.rating = $rating,
         review.updated = $now,
         review.updatedBy = $updatedBy`,
    {
      reviewId,
      classificationFactor,
      rskRaw: overall.raw,
      rskNormalized: overall.normalized,
      rating: overall.rating,
      now,
      updatedBy: assessor || 'system',
    }
  );
}
