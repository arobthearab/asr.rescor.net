/**
 * NpmRunner - Manage Node.js applications via npm scripts
 *
 * @module @rescor-llc/core-utils/NpmRunner
 *
 * Runs npm scripts as background processes with health monitoring.
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from 'fs';
import { join } from 'path';
import { checkHttpEndpoint, checkTcpPort } from './HealthCheck.mjs';

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

export class NpmRunner {
  /**
   * Create an npm service runner
   *
   * @param {ServiceDefinition} service - Service definition
   * @param {object} [options={}] - Runner options
   * @param {Recorder} [options.recorder] - Event recorder
   */
  constructor(service, options = {}) {
    this.service = service;
    this.recorder = options.recorder;
    this.process = null;
    this.state = 'stopped';
    this.logEntries = [];
    this.maxLogLines = 1000;
    this.cleanupStale = options.cleanupStale !== false;
    this.protectedPids = options.protectedPids || new Set();
    this._logFilePath = null;
  }

  /**
   * Start the service
   * @returns {Promise<object>} Status result
   */
  async start() {
    try {
      if (this.process) {
        return {
          success: false,
          service: this.service.name,
          error: 'Service already running'
        };
      }

      if (this.recorder) {
        this.recorder.emit(11010, 'i', `Starting npm service: ${this.service.name}`, {
          service: this.service.name,
          script: this.service.script,
          cwd: this.service.cwd
        });
      }

      const startTime = Date.now();

      if (!existsSync(this.service.cwd)) {
        throw new Error(`Service cwd does not exist: ${this.service.cwd}`);
      }

      if (this.cleanupStale) {
        await this._cleanupStaleProcesses('start');
      }

      // Open log files so child stdio goes to disk instead of pipes.
      // Pipes would break when the parent CLI process exits, sending
      // SIGPIPE to the child and killing it — the root cause of
      // "services die after rescor process restart reports success".
      const logDirectory = join(this.service.cwd, 'logs');
      mkdirSync(logDirectory, { recursive: true });
      this._logFilePath = join(logDirectory, `${this.service.name}.log`);
      const outFd = openSync(this._logFilePath, 'a');
      const errFd = openSync(this._logFilePath, 'a');

      // Spawn npm process
      // Clear NODE_OPTIONS to prevent VS Code debugger auto-attach from
      // propagating into child processes (causes immediate exit on detach).
      this.process = spawn('npm', ['run', this.service.script], {
        cwd: this.service.cwd,
        env: { ...process.env, NODE_OPTIONS: '', ...this.service.env },
        stdio: ['ignore', outFd, errFd],
        detached: true
      });

      this.process.unref();

      // Close the parent's copy of the file descriptors.
      // The child retains its own copy — writes go directly to the log file.
      closeSync(outFd);
      closeSync(errFd);

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        if (this.recorder) {
          this.recorder.emit(11011, 'i', `Service process exited: ${this.service.name}`, {
            service: this.service.name,
            code,
            signal
          });
        }
        this.process = null;
        this.state = 'stopped';
      });

      // Handle process errors
      this.process.on('error', (error) => {
        if (this.recorder) {
          this.recorder.emit(11012, 'e', `Service process error: ${this.service.name}`, {
            service: this.service.name,
            error: error.message
          });
        }
      });

      this.state = 'starting';

      // Wait for service to be healthy
      const healthy = await this.waitForHealthy();

      if (healthy) {
        // Stability verification: wait then confirm the process is still alive
        // and the health check still passes (catches late-crash scenarios).
        const stabilityDelayMs = 2000;
        await new Promise((resolve) => setTimeout(resolve, stabilityDelayMs));

        if (!this.process) {
          this.state = 'failed';

          if (this.recorder) {
            this.recorder.emit(11014, 'e', `Service exited shortly after start: ${this.service.name}`, {
              service: this.service.name
            });
          }

          return {
            success: false,
            service: this.service.name,
            state: 'failed',
            error: 'Process exited during stability check'
          };
        }

        // Second health check — confirm the service is still responding
        const stillHealthy = await this._checkHealth();
        if (!stillHealthy) {
          this.state = 'failed';

          if (this.recorder) {
            this.recorder.emit(11014, 'e', `Service failed stability health check: ${this.service.name}`, {
              service: this.service.name
            });
          }

          await this.stop();
          return {
            success: false,
            service: this.service.name,
            state: 'failed',
            error: 'Service became unhealthy during stability check'
          };
        }

        this.state = 'running';
        const elapsed = Date.now() - startTime;

        if (this.recorder) {
          this.recorder.emit(11013, 'i', `Service started successfully: ${this.service.name}`, {
            service: this.service.name,
            duration: elapsed
          });
        }

        return {
          success: true,
          service: this.service.name,
          state: 'running',
          elapsed,
          pid: this.process.pid
        };
      } else {
        this.state = 'failed';
        await this.stop();

        if (this.recorder) {
          this.recorder.emit(11014, 'e', `Service failed health check: ${this.service.name}`, {
            service: this.service.name
          });
        }

        return {
          success: false,
          service: this.service.name,
          state: 'failed',
          error: 'Health check timeout'
        };
      }
    } catch (error) {
      this.state = 'failed';

      if (this.recorder) {
        this.recorder.emit(11014, 'e', `Service start error: ${this.service.name}`, {
          service: this.service.name,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * Stop the service
   * @returns {Promise<object>} Status result
   */
  async stop() {
    try {
      if (!this.process) {
        if (this.cleanupStale) {
          const cleaned = await this._cleanupStaleProcesses('stop');
          if (cleaned > 0) {
            return {
              success: true,
              service: this.service.name,
              state: 'stopped',
              staleKilled: cleaned
            };
          }
        }

        return {
          success: true,
          service: this.service.name,
          state: 'stopped'
        };
      }

      if (this.recorder) {
        this.recorder.emit(11015, 'i', `Stopping npm service: ${this.service.name}`, {
          service: this.service.name,
          pid: this.process.pid
        });
      }

      let staleKilled = 0;
      if (this.cleanupStale) {
        staleKilled = await this._cleanupStaleProcesses('stop');
      }

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if graceful shutdown fails
          if (this.process) {
            this.process.kill('SIGKILL');
          }
          resolve({
            success: true,
            service: this.service.name,
            state: 'stopped',
            forced: true,
            staleKilled
          });
        }, 5000);

        this.process.once('exit', () => {
          clearTimeout(timeout);
          this.process = null;
          this.state = 'stopped';

          if (this.recorder) {
            this.recorder.emit(11016, 'i', `Service stopped successfully: ${this.service.name}`, {
              service: this.service.name
            });
          }

          resolve({
            success: true,
            service: this.service.name,
            state: 'stopped',
            staleKilled
          });
        });

        // Graceful shutdown
        this.process.kill('SIGTERM');
      });
    } catch (error) {
      if (this.recorder) {
        this.recorder.emit(11017, 'w', `Service stop error: ${this.service.name}`, {
          service: this.service.name,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * Restart the service
   * @returns {Promise<object>} Status result
   */
  async restart() {
    if (this.recorder) {
      this.recorder.emit(11018, 'i', `Restarting service: ${this.service.name}`, {
        service: this.service.name
      });
    }

    await this.stop();
    return await this.start();
  }

  /**
   * Get service status
   * @returns {Promise<object>} Status information
   */
  async status() {
    try {
      const managed = this.process !== null;
      const healthy = await this._checkHealth();

      let state = 'stopped';
      if (managed) {
        state = healthy ? 'running' : 'unhealthy';
      } else if (healthy) {
        state = 'running';
      }

      return {
        service: this.service.name,
        type: 'npm',
        state,
        healthy,
        healthCheck: this.service.healthCheck,
        required: this.service.required,
        dependsOn: this.service.dependsOn,
        pid: this.process?.pid || null
      };
    } catch (error) {
      return {
        service: this.service.name,
        type: 'npm',
        state: 'error',
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Get service logs
   * @param {object} [options={}] - Log options
   * @param {number} [options.tail=100] - Number of lines
   * @returns {Promise<string>} Log output
   */
  async logs(options = {}) {
    const { tail = 100 } = options;

    if (this._logFilePath) {
      try {
        const content = readFileSync(this._logFilePath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        return lines.slice(-tail).join('\n');
      } catch {
        // fall through to in-memory entries
      }
    }

    const recentLogs = this.logEntries.slice(-tail);
    return recentLogs.map(log =>
      `[${log.timestamp}] [${log.stream}] ${log.message}`
    ).join('\n');
  }

  /**
   * Wait for service to be healthy
   * @param {number} [timeout] - Timeout in milliseconds
   * @returns {Promise<boolean>}
   */
  async waitForHealthy(timeout) {
    const maxWait = timeout || this.service.startupTimeout;
    const interval = this.service.healthCheckInterval;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (!this.process) {
        return false;
      }

      const healthy = await this._checkHealth();
      if (healthy) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return false;
  }

  /**
   * Check service health
   * @returns {Promise<boolean>}
   * @private
   */
  async _checkHealth() {
    try {
      const healthCheck = this.service.getHealthCheckConfig();

      if (healthCheck.type === 'http' || healthCheck.type === 'https') {
        const url = `${healthCheck.type}://${healthCheck.host}:${healthCheck.port}${healthCheck.path || ''}`;
        const result = await checkHttpEndpoint({ url, timeout: healthCheck.timeout });
        return result.healthy;
      } else if (healthCheck.type === 'tcp') {
        const result = await checkTcpPort({ host: healthCheck.host, port: healthCheck.port, timeout: healthCheck.timeout });
        return result.healthy;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Add log entry
   * @param {string} stream - 'stdout' or 'stderr'
   * @param {string} message - Log message
   * @private
   */
  _addLog(stream, message) {
    this.logEntries.push({
      timestamp: new Date().toISOString(),
      stream,
      message
    });

    // Keep only recent logs
    if (this.logEntries.length > this.maxLogLines) {
      this.logEntries = this.logEntries.slice(-this.maxLogLines);
    }
  }

  async _cleanupStaleProcesses(reason = 'start') {
    const candidates = new Set();
    const scriptPids = await this._findScriptPids();
    for (const pid of scriptPids) {
      candidates.add(pid);
    }

    const port = this._getHealthCheckPort();
    if (port) {
      const portPids = await this._findPortListenerPids(port);
      for (const pid of portPids) {
        candidates.add(pid);
      }
    }

    candidates.delete(process.pid);
    if (this.process?.pid) {
      candidates.delete(this.process.pid);
    }

    for (const protectedPid of this.protectedPids) {
      candidates.delete(protectedPid);
    }

    if (candidates.size === 0) {
      return 0;
    }

    const candidateList = Array.from(candidates.values());
    let terminated = 0;

    for (const pid of candidateList) {
      try {
        process.kill(pid, 'SIGTERM');
        terminated += 1;
      } catch {
        // ignore
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 600));

    for (const pid of candidateList) {
      try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGKILL');
      } catch {
        // process no longer exists
      }
    }

    if (this.recorder && terminated > 0) {
      this.recorder.emit(11019, 'w', `Killed stale process(es) for ${this.service.name}`, {
        service: this.service.name,
        reason,
        count: terminated,
        pids: candidateList
      });
    }

    return terminated;
  }

  _getHealthCheckPort() {
    try {
      const healthCheck = this.service.getHealthCheckConfig();
      const port = Number(healthCheck?.port);
      return Number.isFinite(port) && port > 0 ? port : null;
    } catch {
      return null;
    }
  }

  async _findPortListenerPids(port) {
    if (!port) {
      return [];
    }

    try {
      const result = await runCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
      if (result.code !== 0 && !result.stdout.trim()) {
        return [];
      }

      return result.stdout
        .split('\n')
        .map((line) => Number(line.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0);
    } catch {
      return [];
    }
  }

  async _findScriptPids() {
    const script = String(this.service.script || '').trim();
    if (!script) {
      return [];
    }

    try {
      const result = await runCommand('ps', ['-ax', '-o', 'pid=,command=']);
      if (result.code !== 0) {
        return [];
      }

      const matches = [];
      const escapedScript = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const commandPattern = new RegExp(`\\bnpm\\s+(?:--\\s+)?run\\s+${escapedScript}(?:\\s|$)`);

      for (const rawLine of result.stdout.split('\n')) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        const firstSpace = line.indexOf(' ');
        if (firstSpace === -1) {
          continue;
        }

        const pid = Number(line.slice(0, firstSpace).trim());
        const command = line.slice(firstSpace + 1);

        if (!Number.isInteger(pid) || pid <= 0) {
          continue;
        }

        if (commandPattern.test(command)) {
          matches.push(pid);
        }
      }

      return matches;
    } catch {
      return [];
    }
  }
}
