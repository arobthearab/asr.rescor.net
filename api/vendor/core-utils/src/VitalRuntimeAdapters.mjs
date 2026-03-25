import { VitalSign } from './VitalSigns.mjs';
import {
	runCommand,
	isTcpPortReachable,
	createDockerComposeServiceSign
} from './VitalSignHelpers.mjs';

/* -------------------------------------------------------------------------- */
/**
 * Normalizes command specs to executable + args.
 *
 * @param {string|{command:string,args?:string[]}|null|undefined} spec - Command spec.
 * @returns {{command:string,args:string[]}|null} Normalized command spec.
 */
function normalizeCommandSpec(spec) {
	if (!spec) {
		return null;
	}

	if (typeof spec === 'string') {
		return { command: spec, args: [] };
	}

	if (typeof spec === 'object' && typeof spec.command === 'string') {
		return {
			command: spec.command,
			args: Array.isArray(spec.args) ? spec.args : []
		};
	}

	return null;
}

/* -------------------------------------------------------------------------- */
/**
 * Executes a command spec and returns command output.
 *
 * @param {string|{command:string,args?:string[]}} spec - Command spec.
 * @param {Function} runner - Command runner.
 * @param {object} [options={}] - Runner options.
 * @returns {Promise<{code:number|null,stdout:string,stderr:string}>}
 */
async function executeCommandSpec(spec, runner, options = {}) {
	const normalized = normalizeCommandSpec(spec);

	if (!normalized) {
		return { code: null, stdout: '', stderr: 'Invalid command spec' };
	}

	return runner(normalized.command, normalized.args, options);
}

/* -------------------------------------------------------------------------- */
/**
 * Creates a VitalSign for services managed by systemd.
 *
 * @param {object} options - Adapter options.
 * @param {string} options.name - Logical service name.
 * @param {string} [options.unit=name] - Systemd unit name.
 * @param {string} [options.systemctlCommand='systemctl'] - Systemctl executable.
 * @param {number} [options.retryDelayMs=1000] - Delay before start retries.
 * @param {string} [options.cwd] - Optional working directory.
 * @param {Function} [options.runner=runCommand] - Command runner.
 * @returns {VitalSign} Configured VitalSign instance.
 */
export function createSystemdServiceSign({
	name,
	unit = name,
	systemctlCommand = 'systemctl',
	retryDelayMs = 1000,
	cwd,
	runner = runCommand
}) {
	return new VitalSign(name, {
		check: async () => {
			const result = await runner(systemctlCommand, ['is-active', '--quiet', unit], { cwd });
			return result.code === 0
				? { state: 'success' }
				: { state: 'hard-fail', message: `${unit} is not active` };
		},
		start: async ({ attempt }) => {
			if (attempt === 1) {
				const startResult = await runner(systemctlCommand, ['start', unit], { cwd });
				if (startResult.code !== 0) {
					return {
						state: 'hard-fail',
						message: `Failed to start ${unit}: ${startResult.stderr || startResult.stdout}`
					};
				}
			}

			const activeResult = await runner(systemctlCommand, ['is-active', '--quiet', unit], { cwd });
			if (activeResult.code !== 0) {
				return {
					state: 'retry',
					delayMs: retryDelayMs,
					message: `Waiting for ${unit} to become active`
				};
			}

			return { state: 'success' };
		},
		stop: async () => {
			const result = await runner(systemctlCommand, ['stop', unit], { cwd });
			return result.code === 0
				? { state: 'success' }
				: { state: 'hard-fail', message: `Failed to stop ${unit}: ${result.stderr || result.stdout}` };
		},
		force: async () => {
			const result = await runner(systemctlCommand, ['kill', '--signal=KILL', unit], { cwd });
			return result.code === 0
				? { state: 'success' }
				: { state: 'hard-fail', message: `Failed to force-stop ${unit}: ${result.stderr || result.stdout}` };
		}
	});
}

/* -------------------------------------------------------------------------- */
/**
 * Creates a VitalSign for services managed by direct process commands.
 *
 * @param {object} options - Adapter options.
 * @param {string} options.name - Logical service name.
 * @param {string|{command:string,args?:string[]}} [options.startCommand] - Start command.
 * @param {string|{command:string,args?:string[]}} [options.stopCommand] - Stop command.
 * @param {string|{command:string,args?:string[]}} [options.forceCommand] - Force-stop command.
 * @param {string|{command:string,args?:string[]}} [options.checkCommand] - Check command.
 * @param {string} [options.host] - Optional TCP check host.
 * @param {number} [options.port] - Optional TCP check port.
 * @param {number} [options.checkTimeoutMs=1500] - TCP check timeout.
 * @param {number} [options.retryDelayMs=1000] - Delay before start retries.
 * @param {string} [options.cwd] - Optional working directory.
 * @param {Function} [options.runner=runCommand] - Command runner.
 * @param {Function} [options.checkReachable=isTcpPortReachable] - Reachability checker.
 * @returns {VitalSign} Configured VitalSign instance.
 */
export function createProcessServiceSign({
	name,
	startCommand,
	stopCommand,
	forceCommand,
	checkCommand,
	host,
	port,
	checkTimeoutMs = 1500,
	retryDelayMs = 1000,
	cwd,
	runner = runCommand,
	checkReachable = isTcpPortReachable
}) {
	async function checkAvailability() {
		const commandSpec = normalizeCommandSpec(checkCommand);
		if (commandSpec) {
			const result = await executeCommandSpec(commandSpec, runner, { cwd });
			return result.code === 0;
		}

		if (host && Number.isFinite(port)) {
			return checkReachable({ host, port, timeoutMs: checkTimeoutMs });
		}

		return true;
	}

	return new VitalSign(name, {
		check: async () => {
			const available = await checkAvailability();
			return available
				? { state: 'success' }
				: { state: 'hard-fail', message: `${name} is not healthy` };
		},
		start: async ({ attempt }) => {
			const startSpec = normalizeCommandSpec(startCommand);

			if (attempt === 1 && startSpec) {
				const startResult = await executeCommandSpec(startSpec, runner, { cwd });
				if (startResult.code !== 0) {
					return {
						state: 'hard-fail',
						message: `Failed to start ${name}: ${startResult.stderr || startResult.stdout}`
					};
				}
			}

			const available = await checkAvailability();
			if (!available) {
				return {
					state: 'retry',
					delayMs: retryDelayMs,
					message: `Waiting for ${name} to become available`
				};
			}

			return { state: 'success' };
		},
		stop: async () => {
			const stopSpec = normalizeCommandSpec(stopCommand);
			if (!stopSpec) {
				return { state: 'success' };
			}

			const result = await executeCommandSpec(stopSpec, runner, { cwd });
			return result.code === 0
				? { state: 'success' }
				: { state: 'hard-fail', message: `Failed to stop ${name}: ${result.stderr || result.stdout}` };
		},
		force: async () => {
			const forceSpec = normalizeCommandSpec(forceCommand);
			if (!forceSpec) {
				return { state: 'success' };
			}

			const result = await executeCommandSpec(forceSpec, runner, { cwd });
			return result.code === 0
				? { state: 'success' }
				: { state: 'hard-fail', message: `Failed to force-stop ${name}: ${result.stderr || result.stdout}` };
		}
	});
}

/* -------------------------------------------------------------------------- */
/**
 * Creates a VitalSign using one of the runtime adapters.
 *
 * @param {object} options - Adapter options.
 * @param {'systemd'|'docker-compose'|'process'} options.runtime - Runtime type.
 * @returns {VitalSign} Configured VitalSign instance.
 */
export function createRuntimeServiceSign(options) {
	if (options?.runtime === 'systemd') {
		return createSystemdServiceSign(options);
	}

	if (options?.runtime === 'docker-compose') {
		return createDockerComposeServiceSign(options);
	}

	if (options?.runtime === 'process') {
		return createProcessServiceSign(options);
	}

	throw new Error(`Unsupported runtime adapter: ${options?.runtime}`);
}

