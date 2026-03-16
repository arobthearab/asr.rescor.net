// ════════════════════════════════════════════════════════════════════
// Admin Routes — user management, review reassignment, auth events
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';

// ────────────────────────────────────────────────────────────────────
// createAdminRouter
// ────────────────────────────────────────────────────────────────────

export function createAdminRouter(database, userStore, authEventStore) {
  const router = Router();

  // ── List all users ─────────────────────────────────────────────
  router.get('/users', async (_request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      body = await userStore.listUsers();
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Provision user (pre-register by email with roles) ──────────
  router.post('/users', async (request, response) => {
    let statusCode = 201;
    let body = null;

    try {
      const { email, roles } = request.body;

      if (!email || typeof email !== 'string') {
        statusCode = 400;
        body = { error: 'email is required' };
      } else {
        const validRoles = ['admin', 'reviewer', 'user', 'auditor'];
        const requestedRoles = Array.isArray(roles) ? roles.filter((role) => validRoles.includes(role)) : ['user'];
        body = await userStore.provisionUser(email.trim(), requestedRoles);
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Update user roles ──────────────────────────────────────────
  router.patch('/users/:sub/roles', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { roles } = request.body;
      const validRoles = ['admin', 'reviewer', 'user', 'auditor'];
      const requestedRoles = Array.isArray(roles) ? roles.filter((role) => validRoles.includes(role)) : [];

      if (requestedRoles.length === 0) {
        statusCode = 400;
        body = { error: 'At least one valid role is required' };
      } else {
        body = await userStore.updateRoles(request.params.sub, requestedRoles);
        if (!body) {
          statusCode = 404;
          body = { error: 'User not found' };
        }
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Reassign review to another assessor ────────────────────────
  router.patch('/reviews/:reviewId/reassign', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { assessor } = request.body;

      if (!assessor || typeof assessor !== 'string') {
        statusCode = 400;
        body = { error: 'assessor (username or email) is required' };
      } else {
        const now = new Date().toISOString();
        const updatedBy = request.user?.preferred_username || 'admin';

        const result = await database.query(
          `MATCH (review:Review {reviewId: $reviewId})
           SET review.assessor  = $assessor,
               review.updated   = $now,
               review.updatedBy = $updatedBy
           RETURN review`,
          { reviewId: request.params.reviewId, assessor: assessor.trim(), now, updatedBy }
        );

        if (result.length === 0) {
          statusCode = 404;
          body = { error: 'Review not found' };
        } else {
          body = result[0].review || result[0];
        }
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── List recent auth events ────────────────────────────────────
  router.get('/auth-events', async (request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(request.query.offset, 10) || 0, 0);
      const sub = request.query.sub || undefined;

      body = await authEventStore.listRecentEvents({ limit, offset, sub });
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Active user count (last 30 days) ───────────────────────────
  router.get('/auth-events/active-count', async (_request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const activeCount = await authEventStore.countActiveUsers(thirtyDaysAgo);
      body = { activeCount };
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  return router;
}
