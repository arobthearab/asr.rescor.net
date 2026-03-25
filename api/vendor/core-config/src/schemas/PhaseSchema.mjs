/**
 * PhaseSchema - Application phase/environment configuration schema
 *
 * Defines deployment phase configuration (DEV, UAT, PROD) with
 * automatic schema naming and environment detection.
 */

import { Schema } from '../Schema.mjs';
import { ClassifiedDatum } from '../ClassifiedDatum.mjs';

/**
 * Phase configuration schema
 *
 * Provides standardized phase/environment configuration:
 * - Current deployment phase (DEV, UAT, PROD)
 * - Project prefix for schema naming
 * - Log level based on environment
 * - Automatic schema name generation
 *
 * @example
 * const phaseSchema = new PhaseSchema('TC');
 * const phase = await phaseSchema.load(config);
 * console.log(phase.schema);        // 'TCDEV', 'TCUAT', or 'TC'
 * console.log(phase.isDevelopment); // true/false
 */
export class PhaseSchema extends Schema {
  /**
   * @param {Object} options - Schema options
   * @param {string} options.projectPrefix - Project prefix (default: 'RESCOR')
   * @param {string} options.domain - Domain name (default: 'app')
   * @param {string[]} options.allowedPhases - Allowed phase values (default: ['DEV', 'UAT', 'PROD'])
   */
  constructor(options = {}) {
    // Support both string and object argument for backward compatibility
    const projectPrefix = typeof options === 'string' ? options : (options.projectPrefix || 'RESCOR');
    const domain = typeof options === 'object' ? (options.domain || 'app') : 'app';
    const allowedPhases = typeof options === 'object' ? (options.allowedPhases || ['DEV', 'UAT', 'PROD']) : ['DEV', 'UAT', 'PROD'];

    super([
      ClassifiedDatum.setting(domain, 'phase', {
        description: 'Current deployment phase',
        allowed: allowedPhases,
        default: 'DEV',
        required: true
      }),
      ClassifiedDatum.setting(domain, 'project_prefix', {
        description: 'Project prefix for schema naming',
        default: projectPrefix,
        required: true
      }),
      ClassifiedDatum.setting(domain, 'log_level', {
        description: 'Logging level',
        allowed: ['debug', 'info', 'warn', 'error'],
        default: 'info'
      })
    ]);

    this.projectPrefix = projectPrefix;
    this.domain = domain;
    this.allowedPhases = allowedPhases;
  }

  /**
   * Convert to typed phase configuration object
   *
   * @returns {Object} - Phase configuration with typed fields and computed properties
   * @returns {string} return.phase - Current phase (DEV, UAT, PROD)
   * @returns {string} return.projectPrefix - Project prefix
   * @returns {string} return.logLevel - Logging level
   * @returns {string} return.schema - Schema name (e.g., 'TCDEV', 'TC')
   * @returns {boolean} return.isDevelopment - True if DEV phase
   * @returns {boolean} return.isUAT - True if UAT phase
   * @returns {boolean} return.isProduction - True if PROD phase
   */
  toTypedObject() {
    const phase = this.getValue(this.domain, 'phase') || 'DEV';
    const prefix = this.getValue(this.domain, 'project_prefix') || this.projectPrefix;
    const logLevel = this.getValue(this.domain, 'log_level') || 'info';

    return {
      phase,
      projectPrefix: prefix,
      logLevel,

      // Computed properties
      schema: this.getSchemaName(phase, prefix),
      isDevelopment: phase === 'DEV',
      isUAT: phase === 'UAT',
      isProduction: phase === 'PROD',
      isNonProduction: phase !== 'PROD'
    };
  }

  /**
   * Get schema name based on phase
   *
   * @param {string} phase - Phase (DEV, UAT, PROD)
   * @param {string} prefix - Project prefix
   * @returns {string} - Schema name
   *
   * @example
   * schema.getSchemaName('DEV', 'TC')  // 'TCDEV'
   * schema.getSchemaName('UAT', 'TC')  // 'TCUAT'
   * schema.getSchemaName('PROD', 'TC') // 'TC'
   */
  getSchemaName(phase, prefix) {
    if (!phase || !prefix) {
      const currentPhase = phase || this.getValue(this.domain, 'phase') || 'DEV';
      const currentPrefix = prefix || this.getValue(this.domain, 'project_prefix') || this.projectPrefix;
      return this.getSchemaName(currentPhase, currentPrefix);
    }

    if (phase === 'PROD') {
      return prefix;
    }
    return `${prefix}${phase}`;
  }

  /**
   * Get current schema name
   *
   * @returns {string} - Current schema name
   */
  getCurrentSchemaName() {
    const phase = this.getValue(this.domain, 'phase') || 'DEV';
    const prefix = this.getValue(this.domain, 'project_prefix') || this.projectPrefix;
    return this.getSchemaName(phase, prefix);
  }

  /**
   * Check if current phase matches
   *
   * @param {string} phase - Phase to check
   * @returns {boolean} - True if current phase matches
   */
  isPhase(phase) {
    const currentPhase = this.getValue(this.domain, 'phase') || 'DEV';
    return currentPhase === phase;
  }

  /**
   * Get recommended log level for phase
   *
   * @param {string} phase - Phase
   * @returns {string} - Recommended log level
   */
  static getRecommendedLogLevel(phase) {
    const levels = {
      DEV: 'debug',
      UAT: 'info',
      PROD: 'warn'
    };
    return levels[phase] || 'info';
  }

  /**
   * Detect phase from environment variable
   *
   * @returns {string} - Detected phase or 'DEV' as default
   */
  static detectPhaseFromEnv() {
    const envPhase = process.env.PHASE ||
                     process.env.NODE_ENV ||
                     process.env.ENVIRONMENT;

    if (!envPhase) {
      return 'DEV';
    }

    const upper = envPhase.toUpperCase();
    if (upper.includes('PROD')) return 'PROD';
    if (upper.includes('UAT') || upper.includes('STAGING')) return 'UAT';
    return 'DEV';
  }

  /**
   * Get environment-specific settings
   *
   * @returns {Object} - Environment settings
   */
  getEnvironmentSettings() {
    const phase = this.getValue(this.domain, 'phase') || 'DEV';
    const isProd = phase === 'PROD';

    return {
      debugMode: !isProd,
      strictMode: isProd,
      enableSourceMaps: !isProd,
      enableProfiling: !isProd,
      cacheTimeout: isProd ? 3600000 : 300000, // 1hr prod, 5min dev
      requestTimeout: isProd ? 30000 : 60000,   // 30s prod, 60s dev
      maxRetries: isProd ? 3 : 1
    };
  }
}
