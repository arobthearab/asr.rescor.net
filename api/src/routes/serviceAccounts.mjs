// ════════════════════════════════════════════════════════════════════
// Service Account Admin Routes — CRUD for machine-to-machine keys
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

const SERVICE_ACCOUNT_KEY_PREFIX = 'sa_';

// ────────────────────────────────────────────────────────────────────
// createServiceAccountRouter
// ────────────────────────────────────────────────────────────────────

export function createServiceAccountRouter(serviceAccountStore, auditEventStore = null) {
  const router = Router();

  // ── Create service account ───────────────────────────────────────
  router.post('/', async (request, response) => {
    let statusCode = 201;
    let body = null;

    try {
      const { label, roles, tenantId } = request.body;

      if (!label || typeof label !== 'string') {
        statusCode = 400;
        body = { error: 'label is required' };
      } else {
        const validRoles = ['admin', 'reviewer', 'user', 'auditor'];
        const requestedRoles = Array.isArray(roles)
          ? roles.filter((role) => validRoles.includes(role))
          : ['admin'];

        const serviceAccountId = randomUUID();
        const rawKey = randomBytes(32).toString('hex');
        const apiKey = `${SERVICE_ACCOUNT_KEY_PREFIX}${rawKey}`;
        const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
        const resolvedTenantId = tenantId || request.user?.tenantId || 'demo';

        const account = await serviceAccountStore.create({
          serviceAccountId,
          label: label.trim(),
          apiKeyHash,
          roles: requestedRoles,
          tenantId: resolvedTenantId,
          createdBy: request.user?.preferred_username || request.user?.sub || 'unknown',
        });

        body = {
          serviceAccountId: account.serviceAccountId,
          label: account.label,
          roles: account.roles,
          tenantId: account.tenantId,
          apiKey,
        };

        if (auditEventStore) {
          auditEventStore.logEvent({
            tenantId: request.user?.tenantId || null,
            sub: request.user?.sub,
            action: 'service-account.create',
            resourceType: 'ServiceAccount',
            resourceId: serviceAccountId,
            ipAddress: request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || null,
            userAgent: request.headers['user-agent'] || null,
            meta: { label: label.trim(), roles: requestedRoles },
          });
        }
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── List service accounts ────────────────────────────────────────
  router.get('/', async (request, response) => {
    let statusCode = 200;
    let body = [];

    try {
      const tenantId = request.user?.tenantId || null;
      body = await serviceAccountStore.list(tenantId);
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── Revoke (deactivate) service account ──────────────────────────
  router.delete('/:serviceAccountId', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const found = await serviceAccountStore.deactivate(request.params.serviceAccountId);

      if (!found) {
        statusCode = 404;
        body = { error: 'Service account not found' };
      } else {
        body = { serviceAccountId: request.params.serviceAccountId, active: false };

        if (auditEventStore) {
          auditEventStore.logEvent({
            tenantId: request.user?.tenantId || null,
            sub: request.user?.sub,
            action: 'service-account.revoke',
            resourceType: 'ServiceAccount',
            resourceId: request.params.serviceAccountId,
            ipAddress: request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || null,
            userAgent: request.headers['user-agent'] || null,
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
