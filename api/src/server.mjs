// ════════════════════════════════════════════════════════════════════
// ASR API Server
// ════════════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import { createDatabase } from './database.mjs';
import { createConfigRouter } from './routes/config.mjs';
import { createReviewsRouter } from './routes/reviews.mjs';
import { createAnswersRouter } from './routes/answers.mjs';

const PORT = process.env.ASR_API_PORT || 3100;

// ────────────────────────────────────────────────────────────────────
// Bootstrap
// ────────────────────────────────────────────────────────────────────

async function bootstrap() {
  const application = express();
  application.use(cors());
  application.use(express.json());

  // Connect to Neo4j
  const database = await createDatabase();

  // Mount routes
  application.use('/api/config', createConfigRouter(database));
  application.use('/api/reviews', createReviewsRouter(database));
  application.use('/api/reviews', createAnswersRouter(database));

  // Health check
  application.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  application.listen(PORT, () => {
    console.log(`ASR API listening on port ${PORT}`);
  });

  return application;
}

bootstrap().catch((error) => {
  console.error('Failed to start ASR API:', error);
  process.exit(1);
});
