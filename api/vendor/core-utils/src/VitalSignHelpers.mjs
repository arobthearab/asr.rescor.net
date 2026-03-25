import { spawn } from 'child_process';
import net from 'net';
import { VitalSign } from './VitalSigns.mjs';

/* -------------------------------------------------------------------------- */
/**
 * Reads an environment variable as a non-empty string.
 *
 * @param {string} name - Environment variable name.
 * @param {string} fallback - Fallback value when env var is missing/empty.
 * @returns {string} Resolved string value.
 */
export function getEnvString(name, fallback) {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/* -------------------------------------------------------------------------- */
/**
 * Reads an environment variable and coerces it to a finite number.
 *
 * @param {string} name - Environment variable name.
 * @param {number} fallback - Fallback number when conversion fails.
 * @returns {number} Resolved numeric value.
 */
export function getEnvNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

/* -------------------------------------------------------------------------- */
/**
 * Checks whether a TCP endpoint is reachable within a timeout window.
 *
 * @param {object} options - Reachability options.
 * @param {string} options.host - Target host name or address.
 * @param {number} options.port - Target TCP port.
 * @param {number} [options.timeoutMs=1500] - Timeout in milliseconds.
 * @returns {Promise<boolean>} True when the endpoint is reachable.
 */
export async function isTcpPortReachable({ host, port, timeoutMs = 1500 }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/* -------------------------------------------------------------------------- */
/**
 * Executes a command and captures exit code/stdout/stderr.
 *
 * @param {string} command - Executable name.
 * @param {string[]} args - Command arguments.
 * @param {import('child_process').SpawnOptions} [options={}] - Spawn options.
 * @returns {Promise<{code:number|null,stdout:string,stderr:string}>}
 */
export async function runCommand(command, args, options = {}) {
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

/* -------------------------------------------------------------------------- */
/**
 * Creates a `VitalSign` for docker-compose managed services.
 *
 * @param {object} options - Service configuration.
 * @param {string} options.name - Logical service name.
 * @param {string} options.host - Service host for reachability checks.
 * @param {number} options.port - Service port for reachability checks.
 * @param {string} options.cwd - Working directory where compose is executed.
 * @param {string[]} [options.startServices=[]] - Compose services to start.
 * @param {string[]} [options.stopServices=startServices] - Compose services to stop.
 * @param {number} [options.checkTimeoutMs=1500] - Reachability timeout.
 * @param {number} [options.retryDelayMs=1500] - Delay before retry transitions.
 * @param {string} [options.dockerCommand='docker'] - Docker executable.
 * @param {string[]} [options.composeArgsPrefix=['compose']] - Compose arg prefix.
 * @returns {VitalSign} Configured VitalSign instance.
 */
export function createDockerComposeServiceSign({
  name,
  host,
  port,
  cwd,
  startServices = [],
  stopServices = startServices,
  checkTimeoutMs = 1500,
  retryDelayMs = 1500,
  dockerCommand = 'docker',
  composeArgsPrefix = ['compose'],
  runner = runCommand,
  checkReachable = isTcpPortReachable
}) {
  return new VitalSign(name, {
    check: async () => {
      const running = await checkReachable({ host, port, timeoutMs: checkTimeoutMs });
      return running
        ? { state: 'success' }
        : { state: 'hard-fail', message: `${name} is not reachable on ${host}:${port}` };
    },
    start: async ({ attempt }) => {
      if (attempt === 1) {
        const result = await runner(
          dockerCommand,
          [...composeArgsPrefix, 'up', '-d', ...startServices],
          { cwd }
        );

        if (result.code !== 0) {
          return {
            state: 'hard-fail',
            message: `Failed to start ${name}: ${result.stderr || result.stdout}`
          };
        }
      }

      const healthy = await checkReachable({ host, port, timeoutMs: checkTimeoutMs });
      if (!healthy) {
        return {
          state: 'retry',
          delayMs: retryDelayMs,
          message: `Waiting for ${name} on ${host}:${port}`
        };
      }

      return { state: 'success' };
    },
    stop: async () => {
      const result = await runner(
        dockerCommand,
        [...composeArgsPrefix, 'stop', ...stopServices],
        { cwd }
      );

      if (result.code !== 0) {
        return {
          state: 'hard-fail',
          message: `Failed to stop ${name}: ${result.stderr || result.stdout}`
        };
      }

      return { state: 'success' };
    },
    force: async () => ({ state: 'success' })
  });
}

/* -------------------------------------------------------------------------- */
/**
 * Creates a VitalSign for Infisical service (docker-compose managed)
 *
 * Infisical is the primary secret management service for @rescor core modules.
 * This helper creates a VitalSign that can monitor and auto-start Infisical
 * as a critical dependency.
 *
 * @param {object} options - Infisical configuration
 * @param {string} [options.host='localhost'] - Infisical host
 * @param {number} [options.port=8080] - Infisical port
 * @param {string} [options.cwd] - Working directory for docker-compose
 * @param {number} [options.checkTimeoutMs=2000] - Health check timeout
 * @param {number} [options.retryDelayMs=2000] - Retry delay
 * @returns {VitalSign} Configured VitalSign for Infisical
 *
 * @example
 * import { createInfisicalVitalSign } from '@rescor-llc/core-utils/VitalSignHelpers';
 *
 * const infisicalSign = createInfisicalVitalSign({
 *   cwd: '/path/to/core.rescor.net'
 * });
 *
 * // Start Infisical if not running
 * await infisicalSign.transitionTo('up');
 *
 * // Check health
 * const status = await infisicalSign.check();
 * console.log('Infisical status:', status);
 */
export function createInfisicalVitalSign({
  host = 'localhost',
  port = 8080,
  cwd,
  checkTimeoutMs = 2000,
  retryDelayMs = 2000
} = {}) {
  return createDockerComposeServiceSign({
    name: 'Infisical',
    host,
    port,
    cwd: cwd || process.cwd(),
    startServices: ['infisical'],
    stopServices: ['infisical'],
    checkTimeoutMs,
    retryDelayMs
  });
}
