// ════════════════════════════════════════════════════════════════════
// Proposed Changes Route — User role proposes answer changes
// ════════════════════════════════════════════════════════════════════
// Users cannot directly edit reviewer answers.  Instead they create
// ProposedChange nodes that reviewers/admins accept or reject.
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authorize } from '../middleware/authorize.mjs';

// ────────────────────────────────────────────────────────────────────
// createProposedChangesRouter
// ────────────────────────────────────────────────────────────────────

export function createProposedChangesRouter(database) {
  const router = Router();

  // ── Create proposed change ─────────────────────────────────────
  // Users (and admins) can propose a change to a specific question
  // within a review.
  router.post('/:reviewId/proposed-changes', authorize('admin', 'user'), async (request, response) => {
    let statusCode = 201;
    let body = null;
    const changeId = uuidv4();
    const now = new Date().toISOString();
    const proposedBy = request.user?.preferred_username || 'system';

    try {
      const { domainIndex, questionIndex, choiceText, rawScore, notes } = request.body;

      const result = await database.query(
        `MATCH (review:Review {reviewId: $reviewId})
         MATCH (question:Question {domainIndex: $domainIndex, questionIndex: $questionIndex})
         CREATE (change:ProposedChange {
           changeId:      $changeId,
           domainIndex:   $domainIndex,
           questionIndex: $questionIndex,
           choiceText:    $choiceText,
           rawScore:      $rawScore,
           notes:         $notes,
           proposedBy:    $proposedBy,
           proposedAt:    $now,
           status:        'PENDING',
           resolvedBy:    null,
           resolvedAt:    null
         })
         MERGE (review)-[:HAS_PROPOSED_CHANGE]->(change)
         MERGE (change)-[:FOR_QUESTION]->(question)
         RETURN change`,
        {
          reviewId: request.params.reviewId,
          changeId,
          domainIndex,
          questionIndex,
          choiceText,
          rawScore: rawScore ?? 0,
          notes: notes || '',
          proposedBy,
          now,
        }
      );

      body = result[0]?.change || result[0] || null;
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── List proposed changes for a review ─────────────────────────
  router.get('/:reviewId/proposed-changes', authorize('admin', 'reviewer', 'user'), async (request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      const statusFilter = request.query.status || null;
      let cypher = `MATCH (review:Review {reviewId: $reviewId})-[:HAS_PROPOSED_CHANGE]->(change:ProposedChange)
                    OPTIONAL MATCH (change)-[:FOR_QUESTION]->(question:Question)`;
      const parameters = { reviewId: request.params.reviewId };

      if (statusFilter) {
        cypher += `\nWHERE change.status = $statusFilter`;
        parameters.statusFilter = statusFilter;
      }

      cypher += `\nRETURN change, question.text AS questionText
                 ORDER BY change.proposedAt DESC`;

      const result = await database.query(cypher, parameters);
      body = result.map((record) => ({
        ...record.change,
        questionText: record.questionText || null,
      }));
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Resolve a proposed change (accept / reject) ────────────────
  // Only reviewers and admins can resolve.
  router.patch('/proposed-changes/:changeId/resolve', authorize('admin', 'reviewer'), async (request, response) => {
    let statusCode = 200;
    let body = null;
    const now = new Date().toISOString();
    const resolvedBy = request.user?.preferred_username || 'system';

    try {
      const { resolution } = request.body; // 'ACCEPTED' or 'REJECTED'
      if (resolution !== 'ACCEPTED' && resolution !== 'REJECTED') {
        response.status(400).json({ error: 'resolution must be ACCEPTED or REJECTED' });
        return;
      }

      const result = await database.query(
        `MATCH (change:ProposedChange {changeId: $changeId})
         WHERE change.status = 'PENDING'
         SET change.status     = $resolution,
             change.resolvedBy = $resolvedBy,
             change.resolvedAt = $now
         RETURN change`,
        {
          changeId: request.params.changeId,
          resolution,
          resolvedBy,
          now,
        }
      );

      if (result.length === 0) {
        statusCode = 404;
        body = { error: 'Proposed change not found or already resolved' };
      } else {
        body = result[0].change || result[0];
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  return router;
}
