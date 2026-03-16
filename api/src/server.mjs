// ════════════════════════════════════════════════════════════════════
// ASR API Server
// ════════════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import { createConfiguration, createDatabase } from './database.mjs';
import { createConfigRouter } from './routes/config.mjs';
import { createReviewsRouter } from './routes/reviews.mjs';
import { createAnswersRouter } from './routes/answers.mjs';
import { createProposedChangesRouter } from './routes/proposedChanges.mjs';
import { createAuditorCommentsRouter } from './routes/auditorComments.mjs';
import { createAdminRouter } from './routes/admin.mjs';
import { createRemediationRouter } from './routes/remediation.mjs';
import { createQuestionnaireAdminRouter } from './routes/questionnaireAdmin.mjs';
import { createGateRouter } from './routes/gates.mjs';
import { createExportRouter } from './routes/exportDocuments.mjs';
import { createAuthenticationMiddleware } from './middleware/authenticate.mjs';
import { authorize } from './middleware/authorize.mjs';
import { UserStore } from './persistence/UserStore.mjs';

const PORT = 3100;

// ────────────────────────────────────────────────────────────────────
// Bootstrap
// ────────────────────────────────────────────────────────────────────

async function bootstrap() {
  const application = express();
  application.use(cors());
  application.use(express.json());

  // Configuration-First: Infisical → Neo4j
  const configuration = await createConfiguration();
  const database = await createDatabase(configuration);
  const userStore = new UserStore(database);

  // Auth config from Infisical (optional — absent in dev = auth-optional)
  const tenantId = await configuration.getConfig('entra', 'tenantId') || null;
  const clientId = await configuration.getConfig('entra', 'clientId') || null;
  const allowedTenantsRaw = await configuration.getConfig('entra', 'allowedTenants') || '';
  const allowedTenants = allowedTenantsRaw ? allowedTenantsRaw.split(',').map((id) => id.trim()).filter(Boolean) : [];
  const isDevelopment = process.env.NODE_ENV !== 'production';

  const authenticate = createAuthenticationMiddleware({ isDevelopment, tenantId, clientId, userStore, allowedTenants });

  // Health check (unauthenticated)
  application.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount authentication on all /api/* except health
  application.use('/api', authenticate);

  // ── Auth / user info ────────────────────────────────────────────
  application.get('/api/auth/me', (request, response) => {
    const user = request.user;
    response.json({
      sub: user.sub,
      preferred_username: user.preferred_username,
      email: user.email,
      displayName: user.displayName || null,
      roles: user.roles,
      tenantId: user.tenantId || null,
    });
  });

  // Mount routes — config is public (read), reviews + answers gated
  application.use('/api/config', createConfigRouter(database));
  application.use('/api/reviews', authorize('admin', 'reviewer', 'user', 'auditor'), createReviewsRouter(database));
  application.use('/api/reviews', authorize('admin', 'reviewer', 'user', 'auditor'), createAnswersRouter(database));
  application.use('/api/reviews', authorize('admin', 'reviewer', 'user'), createProposedChangesRouter(database));
  application.use('/api/reviews', authorize('admin', 'auditor'), createAuditorCommentsRouter(database));
  application.use('/api/reviews', authorize('admin', 'reviewer', 'user', 'auditor'), createRemediationRouter(database));
  application.use('/api/admin', authorize('admin'), createAdminRouter(database, userStore));
  application.use('/api/admin/questionnaire', authorize('admin'), createQuestionnaireAdminRouter(database));
  application.use('/api', createGateRouter(database));
  application.use('/api', createExportRouter(database));

  application.listen(PORT, () => {
    console.log(`ASR API listening on port ${PORT}`);
  });

  return application;
}

bootstrap().catch((error) => {
  console.error('Failed to start ASR API:', error);
  process.exit(1);
});
