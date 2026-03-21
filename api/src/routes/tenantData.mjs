// ════════════════════════════════════════════════════════════════════
// Tenant Data Routes — full dataset export / import
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import express from 'express';
import { TenantDataStore } from '../persistence/TenantDataStore.mjs';

export function createTenantDataRouter(database, auditEventStore = null) {
  const router = Router();
  const tenantDataStore = new TenantDataStore(database);

  // ── GET /:tenantId/export — download tenant dataset as JSON ────

  router.get('/:tenantId/export', async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { tenantId } = request.params;
      const exportedBy = request.user?.preferred_username || request.user?.sub || null;
      const exportData = await tenantDataStore.exportTenantData(tenantId, exportedBy);

      if (!exportData) {
        statusCode = 404;
        body = { error: 'Tenant not found' };
      } else {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `asr_tenant_${tenantId}_${timestamp}.json`;

        response.set({
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
        });

        body = exportData;

        if (auditEventStore) {
          auditEventStore.logEvent({
            tenantId: request.user?.tenantId || null,
            sub: request.user?.sub,
            action: 'tenant.export',
            resourceType: 'Tenant',
            resourceId: tenantId,
            ipAddress: request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || null,
            userAgent: request.headers['user-agent'] || null,
            meta: { counts: exportData.manifest.counts },
          });
        }
      }
    } catch (error) {
      statusCode = 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  // ── POST /:tenantId/import — upload tenant dataset JSON ────────

  router.post('/:tenantId/import', express.json({ limit: '10mb' }), async (request, response) => {
    let statusCode = 200;
    let body = null;

    try {
      const { tenantId } = request.params;
      const conflictStrategy = request.query.conflictStrategy || 'reject';
      const regenerateIds = request.query.regenerateIds === 'true';
      const exportData = request.body;

      if (!exportData?.manifest?.formatVersion) {
        statusCode = 400;
        body = { error: 'Invalid export file: missing manifest.formatVersion' };
      } else if (exportData.manifest.formatVersion !== 1) {
        statusCode = 400;
        body = { error: `Unsupported format version: ${exportData.manifest.formatVersion}` };
      } else {
        const importResult = await tenantDataStore.importTenantData(
          tenantId,
          exportData,
          {
            conflictStrategy,
            regenerateIds,
            importedBy: request.user?.preferred_username || request.user?.sub || 'system',
          }
        );

        body = importResult;

        if (auditEventStore) {
          auditEventStore.logEvent({
            tenantId: request.user?.tenantId || null,
            sub: request.user?.sub,
            action: 'tenant.import',
            resourceType: 'Tenant',
            resourceId: tenantId,
            ipAddress: request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || null,
            userAgent: request.headers['user-agent'] || null,
            meta: {
              sourceTenantId: exportData.manifest.sourceTenantId,
              conflictStrategy,
              regenerateIds,
              counts: importResult.counts,
            },
          });
        }
      }
    } catch (error) {
      statusCode = error.statusCode || 500;
      body = { error: error.message };
    }

    response.status(statusCode).json(body);
  });

  return router;
}
