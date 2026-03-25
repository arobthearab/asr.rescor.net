/**
 * SchemaMapper - Maps deployment phases to database schema names
 *
 * Provides bidirectional mapping between phases (development, uat, production)
 * and schema names (TCDEV, TCUAT, TC) for schema isolation.
 *
 * Supports:
 * - Project-based mapping (TC, SPM, custom projects)
 * - Custom schema naming conventions
 * - Bidirectional lookup (phase → schema, schema → phase)
 * - Validation of phase-schema pairs
 *
 * @example
 * import { SchemaMapper } from '@rescor-llc/core-db/phase';
 *
 * const mapper = SchemaMapper.forProject('TC');
 * const schema = mapper.getSchema('development');  // 'TCDEV'
 * const phase = mapper.getPhase('TCUAT');  // 'uat'
 */

import { PHASES } from './PhaseManager.mjs';

/**
 * Default schema naming conventions for standard projects
 */
const PROJECT_CONVENTIONS = {
  // TestingCenter
  TC: {
    [PHASES.DEVELOPMENT]: 'TCDEV',
    [PHASES.UAT]: 'TCUAT',
    [PHASES.PRODUCTION]: 'TC'
  },

  // Software Package Manager
  SPM: {
    [PHASES.DEVELOPMENT]: 'SPMDEV',
    [PHASES.UAT]: 'SPMUAT',
    [PHASES.PRODUCTION]: 'SPM'
  }
};

/**
 * SchemaMapper - Bidirectional phase ↔ schema mapping
 */
export class SchemaMapper {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.project - Project identifier (e.g., 'TC', 'SPM')
   * @param {Object} options.mapping - Custom phase-to-schema mapping
   * @param {string} options.namingConvention - Naming convention ('suffix' or 'prefix')
   */
  constructor(options = {}) {
    this.project = options.project || null;
    this.namingConvention = options.namingConvention || 'suffix';

    // Use provided mapping or generate from project
    if (options.mapping) {
      this.mapping = this._validateMapping(options.mapping);
    } else if (this.project) {
      this.mapping = this._getProjectMapping(this.project);
    } else {
      throw new Error('Either project or mapping must be provided');
    }

    // Build reverse mapping (schema → phase)
    this.reverseMapping = this._buildReverseMapping();
  }

  /**
   * Get schema name for a phase
   *
   * @param {string} phase - Deployment phase
   * @returns {string} - Schema name
   * @throws {Error} - If phase is invalid
   */
  getSchema(phase) {
    const normalizedPhase = this._normalizePhase(phase);

    if (!this.mapping[normalizedPhase]) {
      throw new Error(`No schema mapping for phase: ${phase}`);
    }

    return this.mapping[normalizedPhase];
  }

  /**
   * Get phase for a schema name
   *
   * @param {string} schema - Schema name
   * @returns {string} - Deployment phase
   * @throws {Error} - If schema is not mapped
   */
  getPhase(schema) {
    const normalizedSchema = schema.toUpperCase().trim();

    if (!this.reverseMapping[normalizedSchema]) {
      throw new Error(`No phase mapping for schema: ${schema}`);
    }

    return this.reverseMapping[normalizedSchema];
  }

  /**
   * Check if schema belongs to a specific phase
   *
   * @param {string} schema - Schema name
   * @param {string} phase - Deployment phase
   * @returns {boolean}
   */
  isPhase(schema, phase) {
    try {
      const actualPhase = this.getPhase(schema);
      const normalizedPhase = this._normalizePhase(phase);
      return actualPhase === normalizedPhase;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get all schemas
   *
   * @returns {string[]} - Array of schema names
   */
  getAllSchemas() {
    return Object.values(this.mapping);
  }

  /**
   * Get all phases
   *
   * @returns {string[]} - Array of phases
   */
  getAllPhases() {
    return Object.keys(this.mapping);
  }

  /**
   * Get complete mapping
   *
   * @returns {Object} - Phase to schema mapping
   */
  getMapping() {
    return { ...this.mapping };
  }

  /**
   * Get reverse mapping
   *
   * @returns {Object} - Schema to phase mapping
   */
  getReverseMapping() {
    return { ...this.reverseMapping };
  }

  /**
   * Validate phase-schema pair
   *
   * @param {string} phase - Deployment phase
   * @param {string} schema - Schema name
   * @returns {boolean} - True if pair is valid
   */
  validate(phase, schema) {
    try {
      const expectedSchema = this.getSchema(phase);
      return expectedSchema.toUpperCase() === schema.toUpperCase();
    } catch (err) {
      return false;
    }
  }

  /**
   * Get metadata about mapping
   *
   * @returns {Object} - Metadata
   */
  getMetadata() {
    return {
      project: this.project,
      namingConvention: this.namingConvention,
      mapping: this.getMapping(),
      reverseMapping: this.getReverseMapping(),
      schemaCount: this.getAllSchemas().length
    };
  }

  /**
   * Get project mapping or generate using naming convention
   *
   * @param {string} project - Project identifier
   * @returns {Object} - Phase to schema mapping
   */
  _getProjectMapping(project) {
    // Use pre-defined mapping if available
    if (PROJECT_CONVENTIONS[project]) {
      return { ...PROJECT_CONVENTIONS[project] };
    }

    // Generate mapping using naming convention
    return this._generateMapping(project);
  }

  /**
   * Generate mapping using naming convention
   *
   * @param {string} project - Project identifier
   * @returns {Object} - Phase to schema mapping
   */
  _generateMapping(project) {
    const projectUpper = project.toUpperCase();

    if (this.namingConvention === 'suffix') {
      // Suffix convention: TC + DEV → TCDEV
      return {
        [PHASES.DEVELOPMENT]: `${projectUpper}DEV`,
        [PHASES.UAT]: `${projectUpper}UAT`,
        [PHASES.PRODUCTION]: projectUpper
      };
    } else if (this.namingConvention === 'prefix') {
      // Prefix convention: DEV + TC → DEVTC
      return {
        [PHASES.DEVELOPMENT]: `DEV${projectUpper}`,
        [PHASES.UAT]: `UAT${projectUpper}`,
        [PHASES.PRODUCTION]: projectUpper
      };
    } else {
      throw new Error(`Invalid naming convention: ${this.namingConvention}`);
    }
  }

  /**
   * Build reverse mapping (schema → phase)
   *
   * @returns {Object} - Schema to phase mapping
   */
  _buildReverseMapping() {
    const reverse = {};

    for (const [phase, schema] of Object.entries(this.mapping)) {
      const normalizedSchema = schema.toUpperCase().trim();
      reverse[normalizedSchema] = phase;
    }

    return reverse;
  }

  /**
   * Validate custom mapping
   *
   * @param {Object} mapping - Phase to schema mapping
   * @returns {Object} - Validated mapping
   * @throws {Error} - If mapping is invalid
   */
  _validateMapping(mapping) {
    if (!mapping || typeof mapping !== 'object') {
      throw new Error('Mapping must be an object');
    }

    // Ensure all required phases are present
    const requiredPhases = Object.values(PHASES);
    for (const phase of requiredPhases) {
      if (!mapping[phase]) {
        throw new Error(`Mapping missing required phase: ${phase}`);
      }

      if (typeof mapping[phase] !== 'string') {
        throw new Error(`Schema for phase ${phase} must be a string`);
      }
    }

    // Check for duplicate schemas
    const schemas = Object.values(mapping);
    const uniqueSchemas = new Set(schemas.map(s => s.toUpperCase()));
    if (uniqueSchemas.size !== schemas.length) {
      throw new Error('Mapping contains duplicate schemas');
    }

    return { ...mapping };
  }

  /**
   * Normalize phase name
   *
   * @param {string} phase - Raw phase name
   * @returns {string} - Normalized phase
   */
  _normalizePhase(phase) {
    const phaseAliases = {
      'dev': PHASES.DEVELOPMENT,
      'develop': PHASES.DEVELOPMENT,
      'development': PHASES.DEVELOPMENT,
      'uat': PHASES.UAT,
      'staging': PHASES.UAT,
      'prod': PHASES.PRODUCTION,
      'production': PHASES.PRODUCTION
    };

    const normalized = phase.toLowerCase().trim();
    return phaseAliases[normalized] || normalized;
  }

  /**
   * Create SchemaMapper for a specific project
   *
   * @param {string} project - Project identifier (e.g., 'TC', 'SPM')
   * @param {Object} options - Additional options
   * @returns {SchemaMapper}
   */
  static forProject(project, options = {}) {
    return new SchemaMapper({
      ...options,
      project
    });
  }

  /**
   * Create SchemaMapper with custom mapping
   *
   * @param {Object} mapping - Phase to schema mapping
   * @param {Object} options - Additional options
   * @returns {SchemaMapper}
   */
  static withMapping(mapping, options = {}) {
    return new SchemaMapper({
      ...options,
      mapping
    });
  }

  /**
   * Register a new project convention
   *
   * @param {string} project - Project identifier
   * @param {Object} mapping - Phase to schema mapping
   */
  static registerProject(project, mapping) {
    const mapper = new SchemaMapper({ mapping });  // Validates mapping
    PROJECT_CONVENTIONS[project] = mapper.getMapping();
  }

  /**
   * Get registered projects
   *
   * @returns {string[]} - Array of registered project identifiers
   */
  static getRegisteredProjects() {
    return Object.keys(PROJECT_CONVENTIONS);
  }
}
