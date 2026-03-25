/**
 * SchemaOrchestrator - High-level schema lifecycle workflow coordinator
 *
 * Orchestrates all phase management components into unified workflows:
 * - PhaseManager: Determines deployment phase
 * - SchemaMapper: Maps phase to schema name
 * - SchemaProvisioner: Executes SQL
 * - PhaseLifecycle: Manages lifecycle states
 *
 * Provides high-level operations:
 * - setupPhase() - Complete setup for a deployment phase
 * - teardownPhase() - Complete teardown
 * - refreshPhase() - Reset and repopulate
 * - promoteData() - Copy data between phases (dev → uat → prod)
 *
 * @example
 * import { SchemaOrchestrator } from '@rescor-llc/core-db/phase';
 *
 * const orchestrator = new SchemaOrchestrator(operations, {
 *   project: 'TC',
 *   sqlDirectory: './schemas/tc'
 * });
 *
 * // Complete setup for development phase
 * await orchestrator.setupPhase('development', {
 *   ddlFiles: ['tables.sql', 'indexes.sql'],
 *   dataFiles: ['test-data.sql']
 * });
 */

import { PhaseManager, PHASES } from './PhaseManager.mjs';
import { SchemaMapper } from './SchemaMapper.mjs';
import { SchemaProvisioner } from './SchemaProvisioner.mjs';
import { PhaseLifecycle, LIFECYCLE_STATES } from './PhaseLifecycle.mjs';

/**
 * SchemaOrchestrator - Coordinates schema lifecycle workflows
 */
export class SchemaOrchestrator {
  /**
   * @param {Operations} operations - Database operations instance
   * @param {Object} options - Configuration options
   * @param {string} options.project - Project identifier (e.g., 'TC', 'SPM')
   * @param {string} options.sqlDirectory - Base directory for SQL files
   * @param {Recorder} options.recorder - Recorder for logging
   * @param {Configuration} options.config - Configuration instance
   * @param {Object} options.phaseMapping - Custom phase-to-schema mapping
   */
  constructor(operations, options = {}) {
    this.operations = operations;
    this.project = options.project;
    this.sqlDirectory = options.sqlDirectory;
    this.recorder = options.recorder || null;

    // Initialize components
    this.phaseManager = new PhaseManager({
      config: options.config,
      env: options.env
    });

    this.schemaMapper = options.phaseMapping
      ? SchemaMapper.withMapping(options.phaseMapping)
      : SchemaMapper.forProject(this.project);

    this.provisioner = new SchemaProvisioner(operations, {
      recorder: this.recorder,
      sqlDirectory: this.sqlDirectory
    });

    // Track active lifecycles by schema
    this.lifecycles = new Map();
  }

  /**
   * Setup complete phase environment
   *
   * Executes full workflow:
   * 1. Determine phase
   * 2. Map to schema
   * 3. Create schema
   * 4. Execute DDL
   * 5. Populate data
   * 6. Create backup (optional)
   *
   * @param {string} phase - Deployment phase
   * @param {Object} options - Setup options
   * @param {string[]} options.ddlFiles - DDL files to execute
   * @param {string[]} options.dataFiles - Data files to execute
   * @param {boolean} options.createBackup - Create backup after population (default: true)
   * @param {Object} options.variables - SQL variable substitutions
   * @returns {Promise<Object>} - Setup results
   */
  async setupPhase(phase, options = {}) {
    const {
      ddlFiles = [],
      dataFiles = [],
      createBackup = true,
      variables = {}
    } = options;

    this._log(8080, 'i', 'Setting up phase', { phase, project: this.project });

    try {
      // Get schema for phase
      const schemaName = this.schemaMapper.getSchema(phase);

      this._log(8081, 'i', 'Phase mapped to schema', { phase, schema: schemaName });

      // Get or create lifecycle
      const lifecycle = this._getLifecycle(schemaName);

      // Execute lifecycle workflow
      await lifecycle.initiate({ ddlFiles, variables });

      if (dataFiles.length > 0) {
        await lifecycle.populate({ dataFiles, variables });
      }

      if (createBackup && lifecycle.getState() === LIFECYCLE_STATES.POPULATED) {
        await lifecycle.backup();
      }

      const metadata = lifecycle.getMetadata();

      this._log(8082, 'i', 'Phase setup completed', {
        phase,
        schema: schemaName,
        state: metadata.currentState
      });

      return {
        phase,
        schema: schemaName,
        lifecycle: metadata,
        success: true
      };

    } catch (err) {
      this._log(8083, 'e', 'Phase setup failed', { phase, error: err.message });
      throw err;
    }
  }

  /**
   * Teardown phase environment
   *
   * @param {string} phase - Deployment phase
   * @param {Object} options - Teardown options
   * @param {boolean} options.hardReset - Perform hard reset (default: false)
   * @param {boolean} options.confirm - Confirmation for hard reset
   * @returns {Promise<void>}
   */
  async teardownPhase(phase, options = {}) {
    const { hardReset = false, confirm = false } = options;

    this._log(8084, 'w', 'Tearing down phase', { phase, hardReset });

    try {
      const schemaName = this.schemaMapper.getSchema(phase);
      const lifecycle = this._getLifecycle(schemaName);

      if (hardReset) {
        await lifecycle.hardReset({ confirm });
        this.lifecycles.delete(schemaName);  // Remove from tracking
      } else {
        await lifecycle.reset({});
      }

      this._log(8085, 'i', 'Phase teardown completed', { phase, schema: schemaName });

    } catch (err) {
      this._log(8086, 'e', 'Phase teardown failed', { phase, error: err.message });
      throw err;
    }
  }

  /**
   * Refresh phase (reset and repopulate)
   *
   * @param {string} phase - Deployment phase
   * @param {Object} options - Refresh options
   * @param {string[]} options.ddlFiles - DDL files
   * @param {string[]} options.dataFiles - Data files
   * @returns {Promise<void>}
   */
  async refreshPhase(phase, options = {}) {
    this._log(8087, 'i', 'Refreshing phase', { phase });

    try {
      const schemaName = this.schemaMapper.getSchema(phase);
      const lifecycle = this._getLifecycle(schemaName);

      await lifecycle.reset(options);

      this._log(8088, 'i', 'Phase refreshed', { phase, schema: schemaName });

    } catch (err) {
      this._log(8089, 'e', 'Phase refresh failed', { phase, error: err.message });
      throw err;
    }
  }

  /**
   * Promote data from one phase to another
   *
   * Copies data from source phase to target phase (e.g., dev → uat)
   *
   * @param {string} sourcePhase - Source phase
   * @param {string} targetPhase - Target phase
   * @param {Object} options - Promotion options
   * @param {string[]} options.tables - Tables to copy (default: all)
   * @param {boolean} options.replaceExisting - Replace existing data (default: false)
   * @returns {Promise<void>}
   */
  async promoteData(sourcePhase, targetPhase, options = {}) {
    const { tables = null, replaceExisting = false } = options;

    this._log(8090, 'w', 'Promoting data between phases', {
      from: sourcePhase,
      to: targetPhase
    });

    try {
      const sourceSchema = this.schemaMapper.getSchema(sourcePhase);
      const targetSchema = this.schemaMapper.getSchema(targetPhase);

      // Validate schemas exist
      const sourceExists = await this.provisioner.schemaExists(sourceSchema);
      const targetExists = await this.provisioner.schemaExists(targetSchema);

      if (!sourceExists) {
        throw new Error(`Source schema ${sourceSchema} does not exist`);
      }

      if (!targetExists) {
        throw new Error(`Target schema ${targetSchema} does not exist`);
      }

      // Use DB2 ADMIN_COPY_SCHEMA procedure
      const mode = replaceExisting ? 'REPLACE' : 'COPY';
      const tableList = tables ? tables.join(',') : null;

      const copySQL = `
        CALL SYSPROC.ADMIN_COPY_SCHEMA(
          '${sourceSchema}',
          '${targetSchema}',
          '${mode}',
          ${tableList ? `'${tableList}'` : 'NULL'},
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
        )
      `;

      await this.provisioner.operations.query(copySQL);

      this._log(8091, 'i', 'Data promotion completed', {
        from: sourcePhase,
        to: targetPhase,
        sourceSchema,
        targetSchema,
        tables: tables ? tables.length : 'all'
      });

    } catch (err) {
      this._log(8092, 'e', 'Data promotion failed', {
        from: sourcePhase,
        to: targetPhase,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Get status of all phases
   *
   * @returns {Promise<Object>} - Status of all phases
   */
  async getPhaseStatus() {
    const status = {};

    for (const phase of this.schemaMapper.getAllPhases()) {
      try {
        const schemaName = this.schemaMapper.getSchema(phase);
        const exists = await this.provisioner.schemaExists(schemaName);

        status[phase] = {
          schema: schemaName,
          exists,
          lifecycle: exists && this.lifecycles.has(schemaName)
            ? this.lifecycles.get(schemaName).getMetadata()
            : null
        };
      } catch (err) {
        status[phase] = {
          error: err.message
        };
      }
    }

    return status;
  }

  /**
   * Get current deployment phase
   *
   * @returns {string} - Current phase
   */
  getCurrentPhase() {
    return this.phaseManager.determinePhase();
  }

  /**
   * Get schema for current phase
   *
   * @returns {string} - Schema name
   */
  getCurrentSchema() {
    const phase = this.getCurrentPhase();
    return this.schemaMapper.getSchema(phase);
  }

  /**
   * Get lifecycle for schema
   *
   * @param {string} schemaName - Schema name
   * @returns {PhaseLifecycle} - Lifecycle instance
   */
  _getLifecycle(schemaName) {
    if (!this.lifecycles.has(schemaName)) {
      const lifecycle = new PhaseLifecycle(this.provisioner, schemaName, {
        recorder: this.recorder
      });
      this.lifecycles.set(schemaName, lifecycle);
    }

    return this.lifecycles.get(schemaName);
  }

  /**
   * Get orchestrator metadata
   *
   * @returns {Object} - Metadata
   */
  getMetadata() {
    return {
      project: this.project,
      currentPhase: this.getCurrentPhase(),
      currentSchema: this.getCurrentSchema(),
      sqlDirectory: this.sqlDirectory,
      phaseMapping: this.schemaMapper.getMapping(),
      activeLifecycles: Array.from(this.lifecycles.keys())
    };
  }

  /**
   * Log event
   *
   * @param {number} code - Event code
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  _log(code, level, message, data = {}) {
    if (this.recorder) {
      this.recorder.emit(code, level, message, data);
    }
  }

  /**
   * Create orchestrator for current phase
   *
   * @param {Operations} operations - Database operations
   * @param {Object} options - Configuration options
   * @returns {Promise<SchemaOrchestrator>} - Orchestrator instance
   */
  static async forCurrentPhase(operations, options = {}) {
    const orchestrator = new SchemaOrchestrator(operations, options);
    return orchestrator;
  }
}
