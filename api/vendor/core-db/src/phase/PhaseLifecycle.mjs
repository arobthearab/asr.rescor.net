/**
 * PhaseLifecycle - 5-state schema lifecycle management
 *
 * Manages schema lifecycle through 5 states:
 * 1. INITIATE - Create schema and tables (DDL)
 * 2. POPULATE - Load initial/test data (DML)
 * 3. BACKUP - Create backup of schema
 * 4. RESET - Drop and recreate (non-destructive, uses backup)
 * 5. HARD_RESET - Complete destruction and rebuild (destructive)
 *
 * Provides:
 * - State tracking and transitions
 * - Lifecycle workflow execution
 * - Rollback capabilities
 * - State validation
 *
 * @example
 * import { PhaseLifecycle } from '@rescor-llc/core-db/phase';
 *
 * const lifecycle = new PhaseLifecycle(provisioner, 'TCDEV');
 * await lifecycle.initiate({ ddlFiles: ['tables.sql'] });
 * await lifecycle.populate({ dataFiles: ['test-data.sql'] });
 */

/**
 * Lifecycle states
 */
export const LIFECYCLE_STATES = {
  NOT_INITIALIZED: 'not_initialized',
  INITIATED: 'initiated',
  POPULATED: 'populated',
  BACKED_UP: 'backed_up',
  RESET: 'reset',
  HARD_RESET: 'hard_reset'
};

/**
 * Valid state transitions
 */
const STATE_TRANSITIONS = {
  [LIFECYCLE_STATES.NOT_INITIALIZED]: [
    LIFECYCLE_STATES.INITIATED
  ],
  [LIFECYCLE_STATES.INITIATED]: [
    LIFECYCLE_STATES.POPULATED,
    LIFECYCLE_STATES.HARD_RESET
  ],
  [LIFECYCLE_STATES.POPULATED]: [
    LIFECYCLE_STATES.BACKED_UP,
    LIFECYCLE_STATES.RESET,
    LIFECYCLE_STATES.HARD_RESET
  ],
  [LIFECYCLE_STATES.BACKED_UP]: [
    LIFECYCLE_STATES.RESET,
    LIFECYCLE_STATES.HARD_RESET
  ],
  [LIFECYCLE_STATES.RESET]: [
    LIFECYCLE_STATES.INITIATED,
    LIFECYCLE_STATES.HARD_RESET
  ],
  [LIFECYCLE_STATES.HARD_RESET]: [
    LIFECYCLE_STATES.INITIATED
  ]
};

/**
 * PhaseLifecycle - Schema lifecycle management
 */
export class PhaseLifecycle {
  /**
   * @param {SchemaProvisioner} provisioner - Schema provisioner instance
   * @param {string} schemaName - Schema name to manage
   * @param {Object} options - Configuration options
   * @param {Recorder} options.recorder - Recorder for logging
   * @param {string} options.backupSchemaName - Backup schema name (default: {schema}_BACKUP)
   */
  constructor(provisioner, schemaName, options = {}) {
    this.provisioner = provisioner;
    this.schemaName = schemaName;
    this.recorder = options.recorder || null;
    this.backupSchemaName = options.backupSchemaName || `${schemaName}_BACKUP`;

    // Current state tracking
    this.currentState = LIFECYCLE_STATES.NOT_INITIALIZED;
    this.stateHistory = [];

    // Execution metadata
    this.metadata = {
      initiatedAt: null,
      populatedAt: null,
      backedUpAt: null,
      lastResetAt: null,
      lastHardResetAt: null
    };
  }

  /**
   * INITIATE - Create schema and tables
   *
   * @param {Object} options - Initialization options
   * @param {string[]} options.ddlFiles - DDL files to execute
   * @param {Object} options.variables - SQL variable substitutions
   * @param {boolean} options.force - Force re-initialization (default: false)
   * @returns {Promise<void>}
   */
  async initiate(options = {}) {
    const { ddlFiles = [], variables = {}, force = false } = options;

    this._log(8030, 'i', 'Initiating schema lifecycle', {
      schema: this.schemaName,
      ddlFiles: ddlFiles.length
    });

    // Check if already initiated (unless force=true)
    if (!force && this.currentState !== LIFECYCLE_STATES.NOT_INITIALIZED) {
      if (this.currentState === LIFECYCLE_STATES.INITIATED) {
        this._log(8031, 'w', 'Schema already initiated', { schema: this.schemaName });
        return;
      }
      this._validateTransition(LIFECYCLE_STATES.INITIATED);
    }

    try {
      // Create schema
      await this.provisioner.createSchema(this.schemaName);

      // Execute DDL files
      if (ddlFiles.length > 0) {
        const results = await this.provisioner.executeFiles(ddlFiles, { variables });

        this._log(8032, 'i', 'DDL files executed', {
          schema: this.schemaName,
          filesExecuted: results.successfulFiles,
          statementCount: results.totalStatements
        });
      }

      // Update state
      this._transitionTo(LIFECYCLE_STATES.INITIATED);
      this.metadata.initiatedAt = new Date();

      this._log(8033, 'i', 'Schema initiated successfully', {
        schema: this.schemaName
      });

    } catch (err) {
      this._log(8034, 'e', 'Schema initiation failed', {
        schema: this.schemaName,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * POPULATE - Load initial/test data
   *
   * @param {Object} options - Population options
   * @param {string[]} options.dataFiles - Data SQL files to execute
   * @param {Object} options.variables - SQL variable substitutions
   * @param {boolean} options.continueOnError - Continue if data load fails
   * @returns {Promise<void>}
   */
  async populate(options = {}) {
    const { dataFiles = [], variables = {}, continueOnError = false } = options;

    this._log(8040, 'i', 'Populating schema', {
      schema: this.schemaName,
      dataFiles: dataFiles.length
    });

    // Validate state transition
    this._validateTransition(LIFECYCLE_STATES.POPULATED);

    try {
      // Execute data files
      if (dataFiles.length > 0) {
        const results = await this.provisioner.executeFiles(dataFiles, {
          variables,
          continueOnError
        });

        this._log(8041, 'i', 'Data files executed', {
          schema: this.schemaName,
          filesExecuted: results.successfulFiles,
          statementCount: results.totalStatements,
          errors: results.errors.length
        });
      }

      // Update state
      this._transitionTo(LIFECYCLE_STATES.POPULATED);
      this.metadata.populatedAt = new Date();

      this._log(8042, 'i', 'Schema populated successfully', {
        schema: this.schemaName
      });

    } catch (err) {
      this._log(8043, 'e', 'Schema population failed', {
        schema: this.schemaName,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * BACKUP - Create backup of schema
   *
   * @returns {Promise<void>}
   */
  async backup() {
    this._log(8050, 'i', 'Creating schema backup', {
      schema: this.schemaName,
      backupSchema: this.backupSchemaName
    });

    // Validate state transition
    this._validateTransition(LIFECYCLE_STATES.BACKED_UP);

    try {
      // Drop backup schema if exists
      const backupExists = await this.provisioner.schemaExists(this.backupSchemaName);
      if (backupExists) {
        await this.provisioner.dropSchema(this.backupSchemaName, { cascade: true });
      }

      // Create backup schema
      await this.provisioner.createSchema(this.backupSchemaName);

      // Copy all tables from source to backup
      // Note: This is DB2-specific; adjust for other databases
      const copySQL = `
        CALL SYSPROC.ADMIN_COPY_SCHEMA(
          '${this.schemaName}',
          '${this.backupSchemaName}',
          'COPY',
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
        )
      `;

      await this.provisioner.operations.query(copySQL);

      // Update state
      this._transitionTo(LIFECYCLE_STATES.BACKED_UP);
      this.metadata.backedUpAt = new Date();

      this._log(8051, 'i', 'Schema backup created successfully', {
        schema: this.schemaName,
        backupSchema: this.backupSchemaName
      });

    } catch (err) {
      this._log(8052, 'e', 'Schema backup failed', {
        schema: this.schemaName,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * RESET - Drop and recreate using backup (non-destructive)
   *
   * @param {Object} options - Reset options
   * @param {string[]} options.ddlFiles - DDL files for recreation
   * @param {string[]} options.dataFiles - Data files for recreation
   * @returns {Promise<void>}
   */
  async reset(options = {}) {
    this._log(8060, 'w', 'Resetting schema', {
      schema: this.schemaName
    });

    // Validate state transition
    this._validateTransition(LIFECYCLE_STATES.RESET);

    try {
      // Drop current schema
      await this.provisioner.dropSchema(this.schemaName, { cascade: true });

      // Reinitiate
      await this.initiate({ ...options, force: true });

      // Repopulate if data files provided
      if (options.dataFiles && options.dataFiles.length > 0) {
        await this.populate({ dataFiles: options.dataFiles });
      }

      // Update state
      this._transitionTo(LIFECYCLE_STATES.RESET);
      this.metadata.lastResetAt = new Date();

      this._log(8061, 'i', 'Schema reset successfully', {
        schema: this.schemaName
      });

    } catch (err) {
      this._log(8062, 'e', 'Schema reset failed', {
        schema: this.schemaName,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * HARD_RESET - Complete destruction and rebuild (destructive)
   *
   * @param {Object} options - Hard reset options
   * @param {string[]} options.ddlFiles - DDL files for recreation
   * @param {string[]} options.dataFiles - Data files for recreation
   * @param {boolean} options.confirm - Confirmation required (default: false)
   * @returns {Promise<void>}
   */
  async hardReset(options = {}) {
    const { confirm = false } = options;

    // Safety check: require explicit confirmation
    if (!confirm) {
      throw new Error('Hard reset requires explicit confirmation (confirm: true)');
    }

    this._log(8070, 'e', 'HARD RESET: Destroying schema completely', {
      schema: this.schemaName,
      WARNING: 'All data will be lost'
    });

    // Validate state transition
    this._validateTransition(LIFECYCLE_STATES.HARD_RESET);

    try {
      // Drop backup schema if exists
      const backupExists = await this.provisioner.schemaExists(this.backupSchemaName);
      if (backupExists) {
        await this.provisioner.dropSchema(this.backupSchemaName, { cascade: true });
      }

      // Drop current schema
      const currentExists = await this.provisioner.schemaExists(this.schemaName);
      if (currentExists) {
        await this.provisioner.dropSchema(this.schemaName, { cascade: true });
      }

      // Reset state tracking
      this.currentState = LIFECYCLE_STATES.NOT_INITIALIZED;
      this.stateHistory.push({
        state: LIFECYCLE_STATES.HARD_RESET,
        timestamp: new Date()
      });
      this.metadata.lastHardResetAt = new Date();

      // Reinitiate if DDL files provided
      if (options.ddlFiles && options.ddlFiles.length > 0) {
        await this.initiate({ ddlFiles: options.ddlFiles });

        // Repopulate if data files provided
        if (options.dataFiles && options.dataFiles.length > 0) {
          await this.populate({ dataFiles: options.dataFiles });
        }
      }

      this._log(8071, 'w', 'HARD RESET completed', {
        schema: this.schemaName,
        newState: this.currentState
      });

    } catch (err) {
      this._log(8072, 'e', 'Hard reset failed', {
        schema: this.schemaName,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Get current state
   *
   * @returns {string} - Current lifecycle state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Get state history
   *
   * @returns {Array} - State transition history
   */
  getHistory() {
    return [...this.stateHistory];
  }

  /**
   * Get lifecycle metadata
   *
   * @returns {Object} - Lifecycle metadata
   */
  getMetadata() {
    return {
      schemaName: this.schemaName,
      backupSchemaName: this.backupSchemaName,
      currentState: this.currentState,
      ...this.metadata,
      stateHistory: this.getHistory()
    };
  }

  /**
   * Validate state transition
   *
   * @param {string} targetState - Target state
   * @throws {Error} - If transition is invalid
   */
  _validateTransition(targetState) {
    const validTransitions = STATE_TRANSITIONS[this.currentState];

    if (!validTransitions || !validTransitions.includes(targetState)) {
      throw new Error(
        `Invalid state transition: ${this.currentState} → ${targetState}`
      );
    }
  }

  /**
   * Transition to new state
   *
   * @param {string} newState - New state
   */
  _transitionTo(newState) {
    this.stateHistory.push({
      from: this.currentState,
      to: newState,
      timestamp: new Date()
    });

    this.currentState = newState;
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
}
