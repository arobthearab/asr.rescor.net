// ════════════════════════════════════════════════════════════════════
// Reviews Route — CRUD for ASR reviews
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { loadScoringConfiguration } from '../scoring.mjs';

// ────────────────────────────────────────────────────────────────────
// getAssessor — derive assessor identity from authenticated user
// ────────────────────────────────────────────────────────────────────

function getAssessor(request) {
  return request.user?.preferred_username || 'system';
}

// ────────────────────────────────────────────────────────────────────
// sendResult — single response dispatch for all handlers
// ────────────────────────────────────────────────────────────────────

function sendResult(response, statusCode, body) {
  if (body == null) {
    response.status(statusCode).end();
  } else {
    response.status(statusCode).json(body);
  }
}

// ────────────────────────────────────────────────────────────────────
// createReviewsRouter
// ────────────────────────────────────────────────────────────────────

export function createReviewsRouter(database) {
  const router = Router();

  // ── List reviews ────────────────────────────────────────────────
  router.get('/', async (_request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      const result = await database.query(
        `MATCH (review:Review)
         WHERE review.active = true
         RETURN review
         ORDER BY review.updated DESC`
      );
      body = result.map((record) => record.review || record);
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    sendResult(response, statusCode, body);
  });

  // ── Get single review with answers ─────────────────────────────
  router.get('/:reviewId', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         OPTIONAL MATCH (review)-[:CONTAINS]->(existingAnswer:Answer)
         OPTIONAL MATCH (existingAnswer)-[:ANSWERS]->(question:Question)
         RETURN review, collect({answer: existingAnswer, question: question}) AS answers`,
        { reviewId: request.params.reviewId }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Review not found' };
      } else {
        const row = result[0];
        body = {
          review: row.review || row,
          answers: (row.answers || []).filter(
            (item) => item.answer !== null
          ),
        };
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    sendResult(response, statusCode, body);
  });

  // ── Create review ──────────────────────────────────────────────
  router.post('/', async (request, response) => {
    let statusCode = 201;
    let body = null;
    const reviewId = uuidv4();
    const now = new Date().toISOString();

    try {
      const scoringConfiguration = await loadScoringConfiguration(database);
      const questionnaireVersion = scoringConfiguration.questionnaireVersion || null;

      const result = await database.query(
        `CREATE (review:Review {
           reviewId: $reviewId,
           applicationName: $applicationName,
           assessor: $assessor,
           status: 'DRAFT',
           classificationChoice: null,
           classificationFactor: null,
           sourceChoice: null,
           environmentChoice: null,
           deploymentArchetype: null,
           questionnaireVersion: $questionnaireVersion,
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
          assessor: getAssessor(request),
          notes: request.body.notes || '',
          questionnaireVersion,
          now,
        }
      );
      body = result[0].review || result[0];
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    sendResult(response, statusCode, body);
  });

  // ── Update classification ──────────────────────────────────────
  router.patch('/:reviewId/classification', async (request, response) => {
    let statusCode = 200;
    let body = null;

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
          assessor: getAssessor(request),
        }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Review not found' };
      } else {
        body = result[0].review || result[0];
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    sendResult(response, statusCode, body);
  });

  // ── Update deployment (source × environment) ──────────────────
  router.patch('/:reviewId/deployment', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const sourceChoice = request.body.sourceChoice || null;
      const environmentChoice = request.body.environmentChoice || null;
      const deploymentArchetype =
        sourceChoice && environmentChoice
          ? `${sourceChoice}_${environmentChoice}`
          : null;

      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         SET review.sourceChoice         = $sourceChoice,
             review.environmentChoice    = $environmentChoice,
             review.deploymentArchetype  = $deploymentArchetype,
             review.updated              = $now,
             review.updatedBy            = $assessor
         RETURN review`,
        {
          reviewId: request.params.reviewId,
          sourceChoice,
          environmentChoice,
          deploymentArchetype,
          now: new Date().toISOString(),
          assessor: getAssessor(request),
        }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Review not found' };
      } else {
        body = result[0].review || result[0];
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    sendResult(response, statusCode, body);
  });

  // ── Submit review ──────────────────────────────────────────────
  router.post('/:reviewId/submit', async (request, response) => {
    let statusCode = 200;
    let body = null;

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
          assessor: getAssessor(request),
        }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Review not found' };
      } else {
        body = result[0].review || result[0];
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    sendResult(response, statusCode, body);
  });

  // ── Soft delete ────────────────────────────────────────────────
  router.delete('/:reviewId', async (request, response) => {
    let statusCode = 204;
    let body = null;

    try {
      await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         SET review.active = false,
             review.updated = $now,
             review.updatedBy = $assessor`,
        {
          reviewId: request.params.reviewId,
          now: new Date().toISOString(),
          assessor: getAssessor(request),
        }
      );
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    sendResult(response, statusCode, body);
  });

  // ── Rename review ──────────────────────────────────────────────
  router.patch('/:reviewId/rename', async (request, response) => {
    let statusCode = 200;
    let body = null;

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
          assessor: getAssessor(request),
        }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Review not found' };
      } else {
        body = result[0].review || result[0];
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    sendResult(response, statusCode, body);
  });

  return router;
}
