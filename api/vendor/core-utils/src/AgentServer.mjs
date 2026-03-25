/**
 * AgentServer — Lightweight HTTP agent for remote service management.
 *
 * Wraps ServiceOrchestrator methods as HTTP endpoints with SSE streaming
 * for long-running operations and a simple mutex to prevent concurrent
 * orchestrator operations.
 *
 * Endpoints:
 *   GET  /health                         → Agent health
 *   GET  /api/services/status            → All service statuses
 *   GET  /api/services/:name/logs        → Service logs (snapshot)
 *   POST /api/services/start             → Start services (SSE stream)
 *   POST /api/services/stop              → Stop services (SSE stream)
 *   POST /api/services/restart           → Restart services (SSE stream)
 *
 * Auth: Bearer token (RESCOR_AGENT_TOKEN env var).
 *
 * @module @rescor-llc/core-utils/AgentServer
 */

import { createServer } from 'node:http';
import { ServiceOrchestrator } from './ServiceOrchestrator.mjs';
import { Recorder } from './Recorder.mjs';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parse JSON body from IncomingMessage.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<object>}
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response.
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Send SSE event.
 */
function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Simple project name → directory resolver.
 */
function resolveProjectRoot(project, repositoriesRoot) {
  const projectMap = {
    'core': 'core.rescor.net',
    'tc': 'testingcenter.rescor.net',
    'testingcenter': 'testingcenter.rescor.net',
    'spm': 'spm.rescor.net',
    'd2': 'd2.rescor.net',
    'storm': 'storm.api.rescor.net',
    'asr': 'asr.rescor.net',
    'asr-k12': 'asr.k12.com',
    'cc': 'cc.rescor.net'
  };

  const fullName = projectMap[project?.toLowerCase()] || project;
  const candidate = `${repositoriesRoot}/${fullName}`;

  return candidate;
}

/* -------------------------------------------------------------------------- */
/* AgentServer                                                                 */
/* -------------------------------------------------------------------------- */

export class AgentServer {

  /* -------------------------------------------------------------------------- */
  /**
   * @param {object} options
   * @param {string} options.token          Bearer token for authentication.
   * @param {string} options.repositoriesRoot  Path to repositories directory.
   * @param {number} [options.port=3900]    Listen port.
   * @param {string} [options.host='127.0.0.1']  Bind address.
   * @param {Recorder} [options.recorder]   Event recorder.
   */
  constructor(options = {}) {
    this.token = options.token;
    this.repositoriesRoot = options.repositoriesRoot;
    this.port = options.port || 3900;
    this.host = options.host || '127.0.0.1';
    this.recorder = options.recorder || new Recorder('rescor-agent.log', 'Agent');
    this.server = null;

    this._operationLock = false;
    this._operationProject = null;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Start the HTTP server.
   * @returns {Promise<AgentServer>}
   */
  async start() {
    this.server = createServer((req, res) => this._handleRequest(req, res));

    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        this.recorder.emit(12000, 'i', `Agent listening on ${this.host}:${this.port}`);
        resolve(this);
      });
    });
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Stop the HTTP server.
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.recorder.emit(12001, 'i', 'Agent stopped');
          resolve();
        });
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Route incoming request to handler.
   * @private
   */
  async _handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method;

    // CORS for browser-based tools
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health endpoint — no auth required
    if (path === '/health' && method === 'GET') {
      return sendJson(res, 200, {
        status: 'ok',
        agent: 'rescor-agent',
        locked: this._operationLock,
        lockedProject: this._operationProject
      });
    }

    // Auth check
    if (!this._authenticate(req)) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }

    try {
      // Route
      if (path === '/api/services/status' && method === 'GET') {
        return await this._handleStatus(req, res, url);
      }

      const logsMatch = path.match(/^\/api\/services\/([^/]+)\/logs$/);
      if (logsMatch && method === 'GET') {
        return await this._handleLogs(req, res, url, logsMatch[1]);
      }

      if (path === '/api/services/start' && method === 'POST') {
        return await this._handleLifecycle(req, res, 'start');
      }
      if (path === '/api/services/stop' && method === 'POST') {
        return await this._handleLifecycle(req, res, 'stop');
      }
      if (path === '/api/services/restart' && method === 'POST') {
        return await this._handleLifecycle(req, res, 'restart');
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      this.recorder.emit(12010, 'e', `Request error: ${error.message}`);
      sendJson(res, 500, { error: error.message });
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Verify Bearer token.
   * @private
   */
  _authenticate(req) {
    const authHeader = req.headers.authorization || '';
    const provided = authHeader.replace(/^Bearer\s+/i, '');
    return provided === this.token;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Acquire operation mutex.
   * @returns {boolean} true if acquired.
   * @private
   */
  _acquireLock(project) {
    if (this._operationLock) {
      return false;
    }
    this._operationLock = true;
    this._operationProject = project;
    return true;
  }

  /**
   * Release operation mutex.
   * @private
   */
  _releaseLock() {
    this._operationLock = false;
    this._operationProject = null;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * GET /api/services/status?project=tc
   * @private
   */
  async _handleStatus(req, res, url) {
    const project = url.searchParams.get('project') || 'core';
    const projectRoot = resolveProjectRoot(project, this.repositoriesRoot);

    const orchestrator = new ServiceOrchestrator(projectRoot, {
      recorder: this.recorder
    });
    await orchestrator.initialize();
    const statuses = await orchestrator.status();

    sendJson(res, 200, { project, statuses });
  }

  /* -------------------------------------------------------------------------- */
  /**
   * GET /api/services/:name/logs?project=tc&tail=100
   * @private
   */
  async _handleLogs(req, res, url, serviceName) {
    const project = url.searchParams.get('project') || 'core';
    const tail = parseInt(url.searchParams.get('tail') || '100', 10);
    const projectRoot = resolveProjectRoot(project, this.repositoriesRoot);

    const orchestrator = new ServiceOrchestrator(projectRoot, {
      recorder: this.recorder
    });
    await orchestrator.initialize();
    const logs = await orchestrator.logs(serviceName, { tail });

    sendJson(res, 200, { project, service: serviceName, logs });
  }

  /* -------------------------------------------------------------------------- */
  /**
   * POST /api/services/{start|stop|restart}
   * Body: { project: "tc", services: ["api"] }  (services optional, defaults to all)
   *
   * Response: SSE stream with progress events, final result.
   * @private
   */
  async _handleLifecycle(req, res, action) {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON body' });
    }

    const project = body.project || 'core';
    const services = body.services || 'all';

    // Mutex
    if (!this._acquireLock(project)) {
      return sendJson(res, 409, {
        error: 'Operation in progress',
        lockedProject: this._operationProject
      });
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    sendEvent(res, 'started', { action, project, services });

    try {
      const projectRoot = resolveProjectRoot(project, this.repositoriesRoot);

      // Create a recorder that tees events to the SSE stream
      const streamRecorder = new Recorder('rescor-agent.log', 'Agent');
      const originalEmit = streamRecorder.emit.bind(streamRecorder);
      streamRecorder.emit = (code, severity, message, metadata) => {
        originalEmit(code, severity, message, metadata);
        sendEvent(res, 'progress', { code, severity, message, metadata });
      };

      const orchestrator = new ServiceOrchestrator(projectRoot, {
        recorder: streamRecorder,
        cleanupStale: true
      });
      await orchestrator.initialize();

      sendEvent(res, 'progress', {
        message: `Orchestrator initialized for ${project}`,
        services: orchestrator.registry.getNames()
      });

      let result;
      switch (action) {
        case 'start':
          result = await orchestrator.start(services);
          break;
        case 'stop':
          result = await orchestrator.stop(services);
          break;
        case 'restart':
          result = await orchestrator.restart(services);
          break;
      }

      sendEvent(res, 'complete', { success: true, result });

      this.recorder.emit(12002, 'i', `${action} completed for ${project}`, {
        success: result.success,
        services: result.results?.map(r => `${r.service}:${r.success ? 'ok' : 'fail'}`)
      });
    } catch (error) {
      sendEvent(res, 'error', { error: error.message });
      this.recorder.emit(12003, 'e', `${action} failed for ${project}: ${error.message}`);
    } finally {
      this._releaseLock();
      res.end();
    }
  }
}
