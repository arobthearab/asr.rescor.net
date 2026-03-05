// ════════════════════════════════════════════════════════════════════
// Reviews Route — CRUD for ASR reviews
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ────────────────────────────────────────────────────────────────────
// createReviewsRouter
// ────────────────────────────────────────────────────────────────────

export function createReviewsRouter(database) {
  const router = Router();

  // ── List reviews ────────────────────────────────────────────────
  router.get('/', async (_request, response) => {
    let answer = [];

    try {
      const result = await database.query(
        `MATCH (review:Review)
         WHERE review.active = true
         RETURN review
         ORDER BY review.updated DESC`
      );
      answer = result.map((record) => record.review || record);
      response.json(answer);
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  // ── Get single review with answers ─────────────────────────────
  router.get('/:reviewId', async (request, response) => {
    let answer = null;

    try {
      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         OPTIONAL MATCH (review)-[:CONTAINS]->(existingAnswer:Answer)-[:ANSWERS]->(question:Question)
         RETURN review, collect({answer: existingAnswer, question: question}) AS answers`,
        { reviewId: request.params.reviewId }
      );

      if (result.length === 0) {
        response.status(404).json({ error: 'Review not found' });
      } else {
        const row = result[0];
        answer = {
          review: row.review || row,
          answers: (row.answers || []).filter(
            (item) => item.answer !== null && item.question !== null
          ),
        };
        response.json(answer);
      }
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  // ── Create review ──────────────────────────────────────────────
  router.post('/', async (request, response) => {
    let answer = null;
    const reviewId = uuidv4();
    const now = new Date().toISOString();

    try {
      const result = await database.query(
        `CREATE (review:Review {
           reviewId: $reviewId,
           applicationName: $applicationName,
           assessor: $assessor,
           status: 'DRAFT',
           classificationChoice: null,
           classificationFactor: null,
           rskRaw: 0,
           rskNormalized: 0.0,
           rating: 'Low',
           notes: $notes,
           active: true,
           created: $now,
           createdBy: $assessor,
           updated: $now,
           updatedBy: $assessor
         })
         RETURN review`,
        {
          reviewId,
          applicationName: request.body.applicationName,
          assessor: request.body.assessor,
          notes: request.body.notes || '',
          now,
        }
      );
      answer = result[0].review || result[0];
      response.status(201).json(answer);
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  // ── Update classification ──────────────────────────────────────
  router.patch('/:reviewId/classification', async (request, response) => {
    let answer = null;

    try {
      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         SET review.classificationChoice = $choiceText,
             review.classificationFactor = $factor,
             review.updated = $now,
             review.updatedBy = $assessor
         RETURN review`,
        {
          reviewId: request.params.reviewId,
          choiceText: request.body.choiceText,
          factor: request.body.factor,
          now: new Date().toISOString(),
          assessor: request.body.assessor || 'system',
        }
      );

      if (result.length === 0) {
        response.status(404).json({ error: 'Review not found' });
      } else {
        answer = result[0].review || result[0];
        response.json(answer);
      }
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  // ── Submit review ──────────────────────────────────────────────
  router.post('/:reviewId/submit', async (request, response) => {
    let answer = null;

    try {
      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         SET review.status = 'SUBMITTED',
             review.submittedTimestamp = $now,
             review.updated = $now,
             review.updatedBy = $assessor
         RETURN review`,
        {
          reviewId: request.params.reviewId,
          now: new Date().toISOString(),
          assessor: request.body.assessor || 'system',
        }
      );

      if (result.length === 0) {
        response.status(404).json({ error: 'Review not found' });
      } else {
        answer = result[0].review || result[0];
        response.json(answer);
      }
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  // ── Soft delete ────────────────────────────────────────────────
  router.delete('/:reviewId', async (request, response) => {
    try {
      await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         SET review.active = false,
             review.updated = $now,
             review.updatedBy = $assessor`,
        {
          reviewId: request.params.reviewId,
          now: new Date().toISOString(),
          assessor: request.body.assessor || 'system',
        }
      );
      response.status(204).end();
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  // ── Rename review ──────────────────────────────────────────────
  router.patch('/:reviewId/rename', async (request, response) => {
    let answer = null;

    try {
      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         SET review.applicationName = $applicationName,
             review.updated = $now,
             review.updatedBy = $assessor
         RETURN review`,
        {
          reviewId: request.params.reviewId,
          applicationName: request.body.applicationName,
          now: new Date().toISOString(),
          assessor: request.body.assessor || 'system',
        }
      );

      if (result.length === 0) {
        response.status(404).json({ error: 'Review not found' });
      } else {
        answer = result[0].review || result[0];
        response.json(answer);
      }
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  return router;
}
