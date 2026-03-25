import { lookup } from 'node:dns/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export function isTruthy(value) {
  if (!value) {
    return false;
  }
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

export function getAppConfig(appName, env = process.env) {
  const app = (appName || '').toLowerCase();

  if (app === 'spm') {
    return {
      app,
      enabled: isTruthy(env.SPM_INFISICAL_ENABLED),
      enabledReason: 'SPM_INFISICAL_ENABLED=true',
      envPrefix: 'SPM'
    };
  }

  if (app === 'testingcenter' || app === 'tc') {
    const migrationEnabled = isTruthy(env.TC_CORE_MIGRATION_ENABLED);
    const useCoreConfig = isTruthy(env.TC_USE_CORE_CONFIGURATION);
    const infisicalEnabled = isTruthy(env.TC_INFISICAL_ENABLED);

    return {
      app: 'testingcenter',
      enabled: migrationEnabled && useCoreConfig && infisicalEnabled,
      enabledReason: 'TC_CORE_MIGRATION_ENABLED=true, TC_USE_CORE_CONFIGURATION=true, TC_INFISICAL_ENABLED=true',
      envPrefix: 'TC'
    };
  }

  return {
    app: app || 'generic',
    enabled: isTruthy(env.INFISICAL_REQUIRED),
    enabledReason: 'INFISICAL_REQUIRED=true',
    envPrefix: 'GENERIC'
  };
}

export function pickMode(env = process.env) {
  return (env.INFISICAL_MODE || 'local').toLowerCase();
}

export function getModeVars(mode) {
  if (mode === 'external') {
    return [
      'INFISICAL_EXTERNAL_HOST',
      'INFISICAL_EXTERNAL_CLIENT_ID',
      'INFISICAL_EXTERNAL_CLIENT_SECRET',
      'INFISICAL_PROJECT_ID',
      'INFISICAL_ENVIRONMENT'
    ];
  }

  return [
    'INFISICAL_HOST',
    'INFISICAL_CLIENT_ID',
    'INFISICAL_CLIENT_SECRET',
    'INFISICAL_PROJECT_ID',
    'INFISICAL_ENVIRONMENT'
  ];
}

export function getHostForMode(mode, env = process.env) {
  if (mode === 'external') {
    return env.INFISICAL_EXTERNAL_HOST || 'https://app.infisical.com';
  }
  return env.INFISICAL_HOST || 'http://localhost:8080';
}

export function toHostname(hostValue) {
  try {
    const parsed = new URL(hostValue);
    return parsed.hostname;
  } catch {
    return hostValue.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  }
}

export function toProbeUrl(hostValue) {
  try {
    const parsed = new URL(hostValue);
    return parsed.origin;
  } catch {
    return hostValue.startsWith('http') ? hostValue : `http://${hostValue}`;
  }
}

export function detectInfisicalOnboarding(options = {}) {
  const {
    app = 'generic',
    requireInfisical = false,
    env = process.env
  } = options;

  const cfg = getAppConfig(app, env);
  const mustValidate = Boolean(requireInfisical || cfg.enabled);
  const mode = pickMode(env);

  if (!['local', 'external'].includes(mode)) {
    return {
      ok: false,
      mustValidate,
      app: cfg.app,
      mode,
      cfg,
      code: 2,
      error: `INFISICAL_MODE must be "local" or "external" (received: ${mode})`
    };
  }

  const requiredVars = getModeVars(mode);
  const missingVars = requiredVars.filter((name) => !env[name]);
  const hostValue = getHostForMode(mode, env);
  const hostname = toHostname(hostValue);

  return {
    ok: !mustValidate || missingVars.length === 0,
    mustValidate,
    app: cfg.app,
    mode,
    cfg,
    requiredVars,
    missingVars,
    hostValue,
    hostname,
    code: missingVars.length > 0 ? 2 : 0
  };
}

function isSecretVar(name) {
  return /(SECRET|TOKEN|PASSWORD|KEY)$/i.test(name);
}

export async function promptForMissingInfisicalValues(report, options = {}) {
  const { env = process.env } = options;

  if (!report?.missingVars || report.missingVars.length === 0) {
    return report;
  }

  const rl = readline.createInterface({ input, output });

  try {
    output.write('[infisical-preflight] Missing onboarding values detected.\n');
    for (const variableName of report.missingVars) {
      const hint = isSecretVar(variableName) ? ' (input hidden in shell history only if you paste carefully)' : '';
      const answer = await rl.question(`[infisical-preflight] Enter ${variableName}${hint}: `);
      if (answer && answer.trim().length > 0) {
        env[variableName] = answer.trim();
      }
    }
  } finally {
    rl.close();
  }

  return detectInfisicalOnboarding({
    app: report.app,
    requireInfisical: report.mustValidate,
    env
  });
}

export async function checkDns(hostname) {
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return { ok: true, skipped: true };
  }

  await lookup(hostname);
  return { ok: true, skipped: false };
}

export async function checkReachability(hostValue) {
  const probeUrl = toProbeUrl(hostValue);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(probeUrl, {
      method: 'GET',
      signal: controller.signal
    });
    return { ok: true, probeUrl, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensureInfisicalOnboarding(options = {}) {
  const {
    app = 'generic',
    requireInfisical = false,
    promptForMissing = false,
    env = process.env
  } = options;

  let report = detectInfisicalOnboarding({ app, requireInfisical, env });

  if (!report.mustValidate) {
    return {
      ok: true,
      skipped: true,
      report
    };
  }

  if (!report.ok && promptForMissing) {
    report = await promptForMissingInfisicalValues(report, { env });
  }

  if (!report.ok) {
    const err = new Error(`Missing required env vars: ${report.missingVars.join(', ')}`);
    err.code = 2;
    err.report = report;
    throw err;
  }

  try {
    await checkDns(report.hostname);
  } catch (error) {
    const err = new Error(`DNS resolution failed for ${report.hostname}: ${error.message}`);
    err.code = 3;
    err.report = report;
    throw err;
  }

  try {
    await checkReachability(report.hostValue);
  } catch (error) {
    const err = new Error(`Unable to reach ${report.hostValue}: ${error.message}`);
    err.code = 4;
    err.report = report;
    throw err;
  }

  return { ok: true, skipped: false, report };
}
