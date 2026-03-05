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

// ────────────────────────────────────────────────────────────────────
// createAnswersRouter
// ────────────────────────────────────────────────────────────────────

export function createAnswersRouter(database) {
  const router = Router();

  // ── Save answers (bulk upsert) ─────────────────────────────────
  router.put('/:reviewId/answers', async (request, response) => {
    let answer = null;
    const { reviewId } = request.params;
    const { classificationFactor, answers, assessor } = request.body;
    const now = new Date().toISOString();

    try {
      const scoringConfiguration = await loadScoringConfiguration(database);

      // Fetch weight tier values for measurement computation
      const weightTiersResult = await database.query(
        `MATCH (tier:WeightTier) RETURN tier.name AS name, tier.value AS value`
      );
      const weightTierMap = {};
      for (const record of weightTiersResult) {
        weightTierMap[record.name] = record.value;
      }

      // Upsert each answer and compute measurement server-side
      const allMeasurements = [];

      for (const item of answers) {
        const weightValue = weightTierMap[item.weightTier] ?? item.weightValue ?? 0;
        const measurement = questionMeasurement(
          item.rawScore,
          weightValue,
          classificationFactor
        );
        allMeasurements.push(measurement);

        await database.query(
          `MATCH (review:Review {reviewId: $reviewId})
           MATCH (question:Question {domainIndex: $domainIndex, questionIndex: $questionIndex})
           MERGE (review)-[:CONTAINS]->(existingAnswer:Answer {domainIndex: $domainIndex, questionIndex: $questionIndex})
           ON CREATE SET
             existingAnswer.choiceText = $choiceText,
             existingAnswer.rawScore = $rawScore,
             existingAnswer.weightTier = $weightTier,
             existingAnswer.measurement = $measurement,
             existingAnswer.notes = $notes,
             existingAnswer.created = $now,
             existingAnswer.createdBy = $assessor,
             existingAnswer.updated = $now,
             existingAnswer.updatedBy = $assessor
           ON MATCH SET
             existingAnswer.choiceText = $choiceText,
             existingAnswer.rawScore = $rawScore,
             existingAnswer.weightTier = $weightTier,
             existingAnswer.measurement = $measurement,
             existingAnswer.notes = $notes,
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

      // Recompute overall score
      const overall = computeScore(allMeasurements, scoringConfiguration);

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

      answer = {
        reviewId,
        rskRaw: overall.raw,
        rskNormalized: overall.normalized,
        rating: overall.rating,
        answersProcessed: answers.length,
      };
      response.json(answer);
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  return router;
}
