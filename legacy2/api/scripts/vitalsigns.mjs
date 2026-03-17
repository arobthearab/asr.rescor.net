#!/usr/bin/env node

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  Recorder,
  VitalSign,
  VitalSigns,
  getEnvNumber,
  getEnvString,
  isTcpPortReachable
} from '@rescor-llc/core-utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');

const API_HOST = getEnvString('ASR_API_HOST', '127.0.0.1');
const API_PORT = getEnvNumber('ASR_API_PORT', 5180);
const PRUNE_UNMANAGED_PORTS = getEnvString('ASR_PRUNE_UNMANAGED_PORTS', 'true') !== 'false';
const PRUNE_TIMEOUT_MS = getEnvNumber('ASR_PRUNE_TIMEOUT_MS', 1500);
const PID_DIR = path.join(apiRoot, '.pids');
const LOG_DIR = path.join(apiRoot, 'logs');
const PID_FILE = path.join(PID_DIR, 'asr-api.pid');
const PROCESS_LOG_FILE = path.join(LOG_DIR, 'asr-api.out.log');

const execAsync = promisify(exec);

const recorder = new Recorder(getEnvString('ASR_API_LOG_FILE', 'asr-api.log'), 'asr-vitalsigns');

function getAdapter() {
  return (process.env.ASR_DB_ADAPTER || 'sqlite').toLowerCase();
}

function maskValue(value) {
  if (!value) {
    return '(unset)';
  }

  const text = String(value);
  if (text.length <= 4) {
    return '****';
  }

  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function getVerboseDbTarget() {
  const adapter = getAdapter();

  if (adapter === 'db2') {
    return {
      adapter,
      schema: process.env.ASR_DB2_SCHEMA || 'ASRDEV',
      host: process.env.ASR_DB2_HOST || process.env.DB2_HOST || 'localhost',
      port: Number(process.env.ASR_DB2_PORT || process.env.DB2_PORT || 50000),
      database: process.env.ASR_DB2_DATABASE || process.env.DB2_DATABASE || '(unset)',
      user: maskValue(process.env.ASR_DB2_USER || process.env.DB2_USER),
      connectionString: process.env.ASR_DB2_CONNECTION_STRING ? 'configured' : 'derived-from-env'
    };
  }

  return {
    adapter,
    sqlitePath: process.env.ASR_SQLITE_PATH || './asr.db'
  };
}

async function ensureDirs() {
  await fs.mkdir(PID_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });
}

async function readPid() {
  try {
    const raw = await fs.readFile(PID_FILE, 'utf8');
    const pid = Number(raw.trim());
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function clearPid() {
  if (existsSync(PID_FILE)) {
    await fs.unlink(PID_FILE);
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listPortOwnerPids(port) {
  try {
    const { stdout } = await execAsync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null || true`);
    return [...new Set(
      stdout
        .split('\n')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isInteger(value) && value > 0)
    )];
  } catch {
    return [];
  }
}

async function prunePortOwners({ port, managedPid = null, serviceName }) {
  const owners = await listPortOwnerPids(port);
  const targets = owners.filter((pid) => pid !== managedPid && pid !== process.pid);

  if (targets.length === 0) {
    return { pruned: false, message: `No unmanaged owners found for ${serviceName} on :${port}` };
  }

  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore race conditions
    }
  }

  await sleep(PRUNE_TIMEOUT_MS);

  const survivors = (await listPortOwnerPids(port)).filter((pid) => targets.includes(pid));
  for (const pid of survivors) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore race conditions
    }
  }

  await sleep(250);
  const remaining = (await listPortOwnerPids(port)).filter((pid) => targets.includes(pid));
  if (remaining.length > 0) {
    return {
      pruned: false,
      message: `Unable to reclaim ${serviceName} on :${port}; remaining pids: ${remaining.join(', ')}`
    };
  }

  return {
    pruned: true,
    message: `Pruned unmanaged owner(s) for ${serviceName} on :${port}: ${targets.join(', ')}`
  };
}

async function startDetachedApi() {
  await new Promise((resolve, reject) => {
    const migrate = spawn(process.execPath, ['scripts/apply-migrations.mjs'], {
      cwd: apiRoot,
      stdio: 'inherit',
      env: process.env
    });

    migrate.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Migration failed with exit code ${code}`));
    });

    migrate.on('error', reject);
  });

  const logHandle = await fs.open(PROCESS_LOG_FILE, 'a');
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: apiRoot,
    detached: true,
    stdio: ['ignore', logHandle.fd, logHandle.fd],
    env: process.env
  });

  child.unref();
  await logHandle.close();
  await fs.writeFile(PID_FILE, `${child.pid}\n`, 'utf8');

  recorder.emit(7421, 'i', 'Started detached ASR API process', { pid: child.pid, port: API_PORT });
}

async function stopBySignal(signalName) {
  const pid = await readPid();
  if (!pid || !isAlive(pid)) {
    await clearPid();
    return { hadPid: false };
  }

  process.kill(pid, signalName);
  recorder.emit(7422, 'i', 'Sent signal to ASR API process', { pid, signalName });
  return { hadPid: true, pid };
}

function createVitals() {
  return new VitalSigns({
    plans: {
      start: [{ service: 'api', action: 'start' }],
      status: [{ service: 'api', action: 'check' }],
      stop: [{ service: 'api', action: 'stop' }],
      force: [{ service: 'api', action: 'force' }],
      restart: [
        { service: 'api', action: 'force' },
        { service: 'api', action: 'start' }
      ]
    },
    signs: [
      new VitalSign('api', {
        check: async () => {
          const pid = await readPid();
          const alive = isAlive(pid);
          const reachable = await isTcpPortReachable({ host: API_HOST, port: API_PORT });
          const owners = await listPortOwnerPids(API_PORT);

          if (reachable) {
            return { state: 'success', data: { pid, alive, reachable, owners, managed: Boolean(pid && alive) } };
          }

          return {
            state: 'hard-fail',
            message: `ASR API is not reachable on ${API_HOST}:${API_PORT}`,
            data: { pid, alive, reachable, owners, managed: Boolean(pid && alive) }
          };
        },
        start: async ({ attempt }) => {
          const reachable = await isTcpPortReachable({ host: API_HOST, port: API_PORT });
          const pid = await readPid();
          const alive = isAlive(pid);

          if (reachable && pid && alive) {
            return { state: 'success', message: 'ASR API already reachable' };
          }

          if (reachable && !(pid && alive)) {
            if (!PRUNE_UNMANAGED_PORTS) {
              return {
                state: 'hard-fail',
                message: `ASR API port ${API_PORT} is occupied by unmanaged process; set ASR_PRUNE_UNMANAGED_PORTS=true to reclaim`
              };
            }

            const pruneResult = await prunePortOwners({ port: API_PORT, managedPid: pid, serviceName: 'api' });
            if (!pruneResult.pruned) {
              return {
                state: 'hard-fail',
                message: `ASR API port ${API_PORT} is occupied and could not be reclaimed: ${pruneResult.message}`
              };
            }

            return { state: 'retry', delayMs: 600, message: pruneResult.message };
          }

          if (attempt === 1) {
            if (pid && !alive) {
              await clearPid();
            }
            await startDetachedApi();
          }

          const ready = await isTcpPortReachable({ host: API_HOST, port: API_PORT });
          return ready
            ? { state: 'success' }
            : { state: 'retry', delayMs: 800, message: 'Waiting for ASR API to become reachable' };
        },
        stop: async ({ attempt }) => {
          if (attempt === 1) {
            await stopBySignal('SIGTERM');
          }

          const pid = await readPid();
          const alive = isAlive(pid);
          const reachable = await isTcpPortReachable({ host: API_HOST, port: API_PORT });

          if (pid && !alive) {
            await clearPid();
          }

          if (!reachable) {
            await clearPid();
            return { state: 'success' };
          }

          if (!PRUNE_UNMANAGED_PORTS) {
            return { state: 'retry', delayMs: 500, message: 'Waiting for ASR API to stop' };
          }

          if (attempt > 2) {
            const pruneResult = await prunePortOwners({ port: API_PORT, managedPid: pid, serviceName: 'api' });
            if (pruneResult.pruned) {
              return { state: 'retry', delayMs: 500, message: pruneResult.message };
            }
            return {
              state: 'hard-fail',
              message: `ASR API still reachable on ${API_HOST}:${API_PORT}: ${pruneResult.message}`
            };
          }

          return { state: 'retry', delayMs: 500, message: 'Waiting for ASR API to stop' };
        },
        force: async () => {
          await stopBySignal('SIGKILL');
          await clearPid();

          const reachable = await isTcpPortReachable({ host: API_HOST, port: API_PORT });
          if (reachable && PRUNE_UNMANAGED_PORTS) {
            const pruneResult = await prunePortOwners({ port: API_PORT, managedPid: null, serviceName: 'api' });
            if (!pruneResult.pruned) {
              return { state: 'hard-fail', message: pruneResult.message };
            }
          }

          return { state: 'success' };
        }
      })
    ]
  });
}

function printSummary(summary) {
  for (const result of summary.results) {
    const icon = result.state === 'success' ? '✅' : result.state === 'soft-fail' ? '⚠️' : '❌';
    const message = result.message ? ` - ${result.message}` : '';
    process.stdout.write(`${icon} ${result.service}.${result.action}: ${result.state}${message}\n`);
  }
}

function printVerboseStatus(summary) {
  const apiCheck = summary.results.find((item) => item.service === 'api' && item.action === 'check');
  const runtime = apiCheck?.data || {};
  const target = getVerboseDbTarget();

  process.stdout.write('\nVerbose status\n');
  process.stdout.write(`- adapter: ${target.adapter}\n`);

  if (target.adapter === 'db2') {
    process.stdout.write(`- db2 host: ${target.host}:${target.port}\n`);
    process.stdout.write(`- db2 database: ${target.database}\n`);
    process.stdout.write(`- db2 schema: ${target.schema}\n`);
    process.stdout.write(`- db2 user: ${target.user}\n`);
    process.stdout.write(`- db2 connect mode: ${target.connectionString}\n`);
  } else {
    process.stdout.write(`- sqlite path: ${target.sqlitePath}\n`);
  }

  process.stdout.write(`- api host: ${API_HOST}:${API_PORT}\n`);
  process.stdout.write(`- pid: ${runtime.pid ?? '(none)'}\n`);
  process.stdout.write(`- alive: ${runtime.alive === true ? 'yes' : 'no'}\n`);
  process.stdout.write(`- reachable: ${runtime.reachable === true ? 'yes' : 'no'}\n`);
}

async function main() {
  await ensureDirs();

  const command = process.argv[2] || 'status';
  const verbose = process.argv.includes('--verbose');
  if (!['start', 'stop', 'status', 'force', 'restart'].includes(command)) {
    process.stdout.write('Usage: node scripts/vitalsigns.mjs <start|stop|status|force|restart> [--verbose]\n');
    process.exit(2);
  }

  const vitals = createVitals();
  try {
    const summary = await vitals.run(command, {
      failFast: command !== 'status'
    });

    printSummary(summary);
    if (verbose && command === 'status') {
      printVerboseStatus(summary);
    }
    process.exit(summary.success ? 0 : 1);
  } catch (error) {
    recorder.emit(7429, 'e', 'VitalSigns command failed', { command, error: error.message });
    process.stdout.write(`❌ ${error.name}: ${error.message}\n`);
    process.exit(1);
  }
}

main();
