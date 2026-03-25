/**
 * @rescor-llc/core-utils - Common utilities
 *
 * Provides shared utilities across RESCOR packages
 */

// Error classes
export * from './errors/index.mjs';

// Recorder - Structured logging
export { Recorder } from './Recorder.mjs';

// Utilities - Common helper functions
export { Utilities } from './Utilities.mjs';

// UploadObject - File upload handling
export { UploadHandler, MockRequest, performUpload } from './UploadObject.mjs';

// VitalSigns - Service orchestration with guardrails
export {
	VitalSign,
	VitalSigns,
	VitalSignsError,
	VitalSignsLoopGuardError,
	VitalSignsActionError,
	VitalSignsAbortedError,
	VitalSignsActionTimeoutError,
	VitalSignsTimeoutError
} from './VitalSigns.mjs';

// VitalSign helpers - shared service/check utilities
export {
	getEnvString,
	getEnvNumber,
	isTcpPortReachable,
	runCommand,
	createDockerComposeServiceSign,
	createInfisicalVitalSign
} from './VitalSignHelpers.mjs';

// Runtime adapters - systemd/docker-compose/process abstractions
export {
	createSystemdServiceSign,
	createProcessServiceSign,
	createRuntimeServiceSign
} from './VitalRuntimeAdapters.mjs';

// Circuit Breaker - Prevent cascade failures
export {
	CircuitBreaker,
	CircuitBreakerManager,
	CircuitBreakerOpenError
} from './CircuitBreaker.mjs';

// Health Check - Standardized health checking
export {
	checkTcpPort,
	checkHttpEndpoint,
	checkDatabase,
	checkMemory,
	checkDisk,
	HealthAggregator
} from './HealthCheck.mjs';

// Service Management - Process orchestration
export { ServiceDefinition } from './ServiceDefinition.mjs';
export { ServiceRegistry } from './ServiceRegistry.mjs';
export { DockerComposeRunner } from './DockerComposeRunner.mjs';
export { NpmRunner } from './NpmRunner.mjs';
export { ExternalServiceRunner } from './ExternalServiceRunner.mjs';
export { ServiceOrchestrator } from './ServiceOrchestrator.mjs';
export { AgentServer } from './AgentServer.mjs';
export { RemoteOrchestrator } from './RemoteOrchestrator.mjs';
