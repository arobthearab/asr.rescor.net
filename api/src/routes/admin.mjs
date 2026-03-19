// ════════════════════════════════════════════════════════════════════
// Admin Routes — user management, review reassignment, auth events
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';

// ────────────────────────────────────────────────────────────────────
// createAdminRouter
// ────────────────────────────────────────────────────────────────────

export function createAdminRouter(database, userStore, authEventStore, auditEventStore = null, tenantStore = null) {
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
        } else if (auditEventStore) {
          auditEventStore.logEvent({
            tenantId:     request.user?.tenantId || null,
            sub:          request.user?.sub,
            action:       'role.change',
            resourceType: 'User',
            resourceId:   request.params.sub,
            ipAddress:    request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || null,
            userAgent:    request.headers['user-agent'] || null,
            meta:         { roles: requestedRoles },
          });
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
    let body = {};

    try {
      const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(request.query.offset, 10) || 0, 0);
      const sub = request.query.sub || undefined;
      const tenantId = request.user?.tenantId || null;

      const [events, total] = await Promise.all([
        authEventStore.listRecentEvents({ limit, offset, sub, tenantId }),
        authEventStore.countEvents({ sub, tenantId }),
      ]);

      body = { events, total };
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Active user count (last 30 days) ───────────────────────────
  router.get('/auth-events/active-count', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const tenantId = request.user?.tenantId || null;
      const activeCount = await authEventStore.countActiveUsers(thirtyDaysAgo, tenantId);
      body = { activeCount };
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Session-grouped auth events ────────────────────────────────
  router.get('/auth-sessions', async (request, response) => {
    let statusCode = 200;
    let body = {};

    try {
      const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 20, 1), 100);
      const offset = Math.max(parseInt(request.query.offset, 10) || 0, 0);
      const tenantId = request.user?.tenantId || null;

      body = await authEventStore.listSessions({ limit, offset, tenantId });
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Audit events (data-mutation trail) ────────────────────────
  router.get('/audit-events', async (request, response) => {
    let statusCode = 200;
    let body = {};

    if (!auditEventStore) {
      response.status(503).json({ error: 'Audit event store not available' });
      return;
    }

    try {
      const limit      = Math.min(Math.max(parseInt(request.query.limit, 10) || 50, 1), 200);
      const offset     = Math.max(parseInt(request.query.offset, 10) || 0, 0);
      const tenantId   = request.user?.tenantId || null;
      const action     = request.query.action     || undefined;
      const resourceId = request.query.resourceId || undefined;
      const since      = request.query.since      || undefined;
      const until      = request.query.until      || undefined;

      const filters = { tenantId, action, resourceId, since, until };

      const [events, total] = await Promise.all([
        auditEventStore.listEvents({ ...filters, limit, offset }),
        auditEventStore.countEvents(filters),
      ]);

      body = { events, total };
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Events within a single session ─────────────────────────────
  router.get('/auth-sessions/events', async (request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      const { sub, from, to } = request.query;
      if (!from || !to) {
        response.status(400).json({ error: 'from and to query parameters are required' });
        return;
      }
      body = await authEventStore.listSessionEvents({ sub: sub || null, from, to });
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Tenant management ──────────────────────────────────────────

  // GET /tenants — list all tenants with user counts
  router.get('/tenants', async (_request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      body = await tenantStore.listTenants();
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // POST /tenants — provision a new tenant
  router.post('/tenants', async (request, response) => {
    let statusCode = 201;
    let body = null;

    try {
      const { tenantId, name, domain } = request.body;

      if (!tenantId || typeof tenantId !== 'string' || !name || typeof name !== 'string') {
        statusCode = 400;
        body = { error: 'tenantId and name are required' };
      } else {
        await tenantStore.createTenant({ tenantId: tenantId.trim(), name: name.trim(), domain: domain?.trim() || null });
        body = { tenantId: tenantId.trim(), name: name.trim(), domain: domain?.trim() || null, active: true };

        if (auditEventStore) {
          auditEventStore.logEvent({
            tenantId:     request.user?.tenantId || null,
            sub:          request.user?.sub,
            action:       'tenant.create',
            resourceType: 'Tenant',
            resourceId:   tenantId.trim(),
            ipAddress:    request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || null,
            userAgent:    request.headers['user-agent'] || null,
            meta:         { name: name.trim(), domain: domain?.trim() || null },
          });
        }
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // DELETE /tenants/:tenantId — soft-delete tenant
  router.delete('/tenants/:tenantId', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const result = await tenantStore.deactivateTenant(request.params.tenantId);

      if (!result) {
        statusCode = 404;
        body = { error: 'Tenant not found' };
      } else {
        body = { tenantId: request.params.tenantId, active: false };

        if (auditEventStore) {
          auditEventStore.logEvent({
            tenantId:     request.user?.tenantId || null,
            sub:          request.user?.sub,
            action:       'tenant.delete',
            resourceType: 'Tenant',
            resourceId:   request.params.tenantId,
            ipAddress:    request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || null,
            userAgent:    request.headers['user-agent'] || null,
          });
        }
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  return router;
}
