import express from 'express';
import cors from 'cors';
import { Recorder } from '@rescor-llc/core-utils';
import { ValidationError } from '@rescor-llc/core-utils/errors';
import { GraphStoreRepository } from './db/GraphStoreRepository.mjs';
import { validateGraphPayload } from './db/validateGraphPayload.mjs';
import { createOperations, getActiveAdapter } from './db/createOperations.mjs';

const PORT = Number(process.env.ASR_API_PORT || 5180);
const LOG_FILE = process.env.ASR_API_LOG_FILE || 'asr-api.log';
const ACTIVE_ADAPTER = getActiveAdapter();

const app = express();
const recorder = new Recorder(LOG_FILE, 'asr-graph-api');

const operations = createOperations({ recorder });

const repository = new GraphStoreRepository({ operations, recorder });

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.get('/asr/graph', async (_req, res) => {
  try {
    const record = await repository.getGraphRecord();

    if (!record) {
      res.status(404).json({
        success: false,
        code: 'ASR_GRAPH_NOT_FOUND',
        error: 'No ASR graph persisted yet.'
      });
      return;
    }

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    recorder.emit(7403, 'e', 'Failed to load graph', { error: error.message });
    res.status(500).json({
      success: false,
      code: 'ASR_GRAPH_READ_FAILED',
      error: 'Failed to load graph from storage.'
    });
  }
});

app.put('/asr/graph', async (req, res) => {
  const graph = req.body?.graph;

  try {
    validateGraphPayload(graph);
  } catch (error) {
    const details = error instanceof ValidationError
      ? { code: error.code, field: error.field, message: error.message }
      : { message: error.message };

    recorder.emit(7404, 'w', 'Rejected invalid graph payload', details);
    res.status(400).json({
      success: false,
      code: 'ASR_GRAPH_INVALID_PAYLOAD',
      error: 'Graph payload shape is invalid.'
    });
    return;
  }

  try {
    const result = await repository.upsertGraph(graph);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    recorder.emit(7405, 'e', 'Failed to persist graph', { error: error.message });
    res.status(500).json({
      success: false,
      code: 'ASR_GRAPH_WRITE_FAILED',
      error: 'Failed to persist graph.'
    });
  }
});

async function start() {
  await operations.connect();
  await repository.ensureStore();

  const server = app.listen(PORT, () => {
    recorder.emit(7400, 'i', 'ASR graph API listening', {
      port: PORT,
      adapter: ACTIVE_ADAPTER,
      databasePath: process.env.ASR_SQLITE_PATH || './asr.db'
    });
  });

  const shutdown = async (signalName) => {
    recorder.emit(7406, 'i', 'Shutting down ASR API', { signal: signalName });
    server.close(async () => {
      try {
        await operations.disconnect();
      } finally {
        recorder.close();
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

start().catch((error) => {
  recorder.emit(7499, 'e', 'Failed to start ASR API', { error: error.message });
  process.exit(1);
});
