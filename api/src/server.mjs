// ════════════════════════════════════════════════════════════════════
// ASR API Server
// ════════════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import { createConfiguration, createDatabase } from './database.mjs';
import { createConfigRouter } from './routes/config.mjs';
import { createReviewsRouter } from './routes/reviews.mjs';
import { createAnswersRouter } from './routes/answers.mjs';
import { createAuthenticationMiddleware } from './middleware/authenticate.mjs';

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

  // Auth config from Infisical (optional — absent in dev = auth-optional)
  const tenantId = await configuration.getConfig('entra', 'tenantId') || process.env.VITE_MSAL_TENANT_ID || null;
  const clientId = await configuration.getConfig('entra', 'clientId') || process.env.VITE_MSAL_CLIENT_ID || null;
  const isDevelopment = process.env.NODE_ENV !== 'production';

  const authenticate = createAuthenticationMiddleware({ isDevelopment, tenantId, clientId });

  // Health check (unauthenticated)
  application.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount authentication on all /api/* except health
  application.use('/api', authenticate);

  // Mount routes
  application.use('/api/config', createConfigRouter(database));
  application.use('/api/reviews', createReviewsRouter(database));
  application.use('/api/reviews', createAnswersRouter(database));

  application.listen(PORT, () => {
    console.log(`ASR API listening on port ${PORT}`);
  });

  return application;
}

bootstrap().catch((error) => {
  console.error('Failed to start ASR API:', error);
  process.exit(1);
});
