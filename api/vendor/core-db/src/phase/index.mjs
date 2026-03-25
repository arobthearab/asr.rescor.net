/**
 * @rescor-llc/core-db/phase - Schema Phase Management Module
 *
 * Complete phase lifecycle management for dev/uat/prod schema isolation.
 *
 * Components:
 * - PhaseManager: Determines deployment phase
 * - SchemaMapper: Maps phases to schema names
 * - SchemaProvisioner: Executes SQL for schema setup
 * - PhaseLifecycle: Manages 5-state lifecycle
 * - SchemaOrchestrator: High-level workflow coordinator
 * - SchemaPopulator: Generic schema population workflow (dev/uat/prod)
 *
 * @example
 * import { SchemaOrchestrator } from '@rescor-llc/core-db/phase';
 *
 * const orchestrator = new SchemaOrchestrator(operations, {
 *   project: 'TC',
 *   sqlDirectory: './schemas/tc'
 * });
 *
 * await orchestrator.setupPhase('development', {
 *   ddlFiles: ['tables.sql'],
 *   dataFiles: ['test-data.sql']
 * });
 */

// Phase Management
export { PhaseManager, PHASES } from './PhaseManager.mjs';
export { SchemaMapper } from './SchemaMapper.mjs';
export { SchemaProvisioner } from './SchemaProvisioner.mjs';
export { PhaseLifecycle, LIFECYCLE_STATES } from './PhaseLifecycle.mjs';
export { SchemaOrchestrator } from './SchemaOrchestrator.mjs';
export { SchemaPopulator } from './SchemaPopulator.mjs';
export { SchemaStatus, TableAttributes } from './SchemaStatus.mjs';
export { PhasePolicy } from './PhasePolicy.mjs';
export { PromotionPlanner } from './PromotionPlanner.mjs';
export { PromotionExecutor } from './PromotionExecutor.mjs';
export { DdlRegistry } from './DdlRegistry.mjs';
export { DdlPlanner } from './DdlPlanner.mjs';
export { DdlExecutor } from './DdlExecutor.mjs';
