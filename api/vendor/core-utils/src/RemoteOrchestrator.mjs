/**
 * RemoteOrchestrator — HTTP client for the rescor agent.
 *
 * Drop-in replacement for ServiceOrchestrator when operating remotely.
 * Connects to an AgentServer, sends commands, and streams SSE events
 * back to the caller via an onEvent callback.
 *
 * @module @rescor-llc/core-utils/RemoteOrchestrator
 */

/* -------------------------------------------------------------------------- */
/* RemoteOrchestrator                                                          */
/* -------------------------------------------------------------------------- */

export class RemoteOrchestrator {

  /* -------------------------------------------------------------------------- */
  /**
   * @param {object} options
   * @param {string} options.host     Agent base URL (e.g. 'https://cfg.rsc.rescor.net:3900')
   * @param {string} options.token    Bearer token for authentication.
   * @param {string} options.project  Project name (e.g. 'tc').
   * @param {Function} [options.onEvent]  Callback for SSE events: (event, data) => void
   */
  constructor(options = {}) {
    this.host = options.host.replace(/\/$/, '');
    this.token = options.token;
    this.project = options.project;
    this.onEvent = options.onEvent || (() => {});
  }

  /* -------------------------------------------------------------------------- */
  /**
   * GET JSON from agent.
   * @param {string} path   URL path.
   * @returns {Promise<object>}
   * @private
   */
  async _get(path) {
    const response = await fetch(`${this.host}${path}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Agent returned ${response.status}`);
    }

    return response.json();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * POST to agent and consume SSE stream.
   * @param {string} path   URL path.
   * @param {object} body   Request body.
   * @returns {Promise<object>}  The final 'complete' or 'error' event data.
   * @private
   */
  async _postStream(path, body) {
    const response = await fetch(`${this.host}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (response.status === 409) {
      const data = await response.json();
      throw new Error(`Agent busy: operation in progress for ${data.lockedProject}`);
    }

    if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const data = await response.json();
      throw new Error(data.error || `Agent returned ${response.status}`);
    }

    // Parse SSE stream
    let finalResult = null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      let currentEvent = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ') && currentEvent) {
          try {
            const data = JSON.parse(line.slice(6));
            this.onEvent(currentEvent, data);

            if (currentEvent === 'complete') {
              finalResult = data;
            } else if (currentEvent === 'error') {
              throw new Error(data.error || 'Agent operation failed');
            }
          } catch (parseError) {
            if (parseError.message !== 'Agent operation failed' &&
                !parseError.message.startsWith('Agent')) {
              // JSON parse error — skip malformed event
            } else {
              throw parseError;
            }
          }
          currentEvent = null;
        }
      }
    }

    return finalResult || { success: true };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * No-op for API compatibility with ServiceOrchestrator.
   * @returns {Promise<RemoteOrchestrator>}
   */
  async initialize() {
    // Verify agent is reachable
    const health = await this._get('/health');
    if (health.status !== 'ok') {
      throw new Error('Agent unhealthy');
    }
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Start services.
   * @param {string|string[]} [services='all']
   * @returns {Promise<object>}
   */
  async start(services) {
    const result = await this._postStream('/api/services/start', {
      project: this.project,
      services: services || 'all'
    });
    return result.result || result;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Stop services.
   * @param {string|string[]} [services='all']
   * @returns {Promise<object>}
   */
  async stop(services) {
    const result = await this._postStream('/api/services/stop', {
      project: this.project,
      services: services || 'all'
    });
    return result.result || result;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Restart services.
   * @param {string|string[]} [services='all']
   * @returns {Promise<object>}
   */
  async restart(services) {
    const result = await this._postStream('/api/services/restart', {
      project: this.project,
      services: services || 'all'
    });
    return result.result || result;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get service statuses.
   * @returns {Promise<object[]>}
   */
  async status() {
    const data = await this._get(`/api/services/status?project=${this.project}`);
    return data.statuses;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get service logs.
   * @param {string} serviceName
   * @param {object} [options={}]
   * @returns {Promise<string>}
   */
  async logs(serviceName, options = {}) {
    const tail = options.tail || 100;
    const data = await this._get(
      `/api/services/${serviceName}/logs?project=${this.project}&tail=${tail}`
    );
    return data.logs;
  }
}
