/**
 * Recorder - Structured Logging with File Persistence
 *
 * Consolidated from testingcenter.rescor.net and spm.rescor.net implementations.
 *
 * Features:
 * - Event-code based structured logging
 * - File persistence with stream-based writes
 * - Tee mode (console + file)
 * - In-memory message buffering
 * - Metadata storage
 * - Error state tracking
 * - Path validation and sandboxing
 * - Graceful degradation (stream → sync → console)
 *
 * @example
 * import { Recorder } from '@rescor-llc/core-utils';
 *
 * const recorder = new Recorder('/var/log/app.log', 'myapp');
 * recorder.emit(6001, 'i', 'Application started');
 * recorder.emit(6002, 'e', 'Error occurred');
 * recorder.close();
 *
 * Operations note: see RECORDER-OPS-CENTRAL-LOGGING in packages/core-utils/README.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/* -------------------------------------------------------------------------- */
/**
 * Recorder - Structured logging with file persistence
 */
export class Recorder {
  /* -------------------------------------------------------------------------- */
  /**
   * Default log file location
   * Can be overridden with constructor parameter
   */
  static DEFAULT_LOG = '/tmp/rescor/logs/app.log';

  /* -------------------------------------------------------------------------- */
  /**
   * Severity code to console method mapping
   */
  static LOG_TYPE = {
    'i': console.log,     // Info
    'd': console.debug,   // Debug
    'w': console.warn,    // Warning
    'e': console.error,   // Error
    's': console.error,   // Severe
    't': console.error    // Terminal
  };

  /* -------------------------------------------------------------------------- */
  /**
   * Get current filename
   */
  static get __filename() {
    return fileURLToPath(import.meta.url);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get log base directory from environment or use default
   *
   * Environment variables (in order of precedence):
   * - RESCOR_LOG_BASE
   * - TC_LOG_BASE (for backward compatibility)
   * - SPM_LOG_BASE (for backward compatibility)
   *
   * @returns {string} Base directory for logs
   */
  static getLogBase() {
    return process.env.RESCOR_LOG_BASE ||
           process.env.TC_LOG_BASE ||
           process.env.SPM_LOG_BASE ||
           '/tmp/rescor/logs';
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Validate log file path
   *
   * Rules:
   * - Must have .log extension
   * - Must be within log base directory (sandboxing)
   * - Filename-only paths are placed in base directory
   *
   * @param {string} logPath - Path to validate
   * @throws {Error} If path is invalid
   * @returns {string} Resolved absolute path
   */
  static validateLogPath(logPath) {
    // Check file extension
    if (!logPath.endsWith('.log')) {
      throw new Error(`Log file must have .log extension: ${logPath}`);
    }

    // If path is just a filename (no directory), place it in base directory
    const baseDir = path.resolve(Recorder.getLogBase());
    let absolutePath;

    if (path.basename(logPath) === logPath) {
      // Just a filename, no path - put it in base directory
      absolutePath = path.join(baseDir, logPath);
    } else {
      // Has directory components - resolve to absolute
      absolutePath = path.resolve(logPath);
    }

    // Check if path is within base directory (sandboxing)
    if (!absolutePath.startsWith(baseDir + path.sep) && absolutePath !== baseDir) {
      throw new Error(`Log file must be within base directory ${baseDir}: ${absolutePath}`);
    }

    return absolutePath;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Ensure directory exists for log file
   *
   * @param {string} logPath - Path to log file
   */
  static ensureLogDirectory(logPath) {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create a Recorder instance
   *
   * @param {string} [log=Recorder.DEFAULT_LOG] - Path to log file
   * @param {string} [program=Recorder.__filename] - Program identifier (used as prefix)
   * @param {Object} [options={}] - Additional options
   * @param {boolean} [options.tee] - Enable tee mode (console + file)
   * @param {boolean} [options.validatePath=true] - Validate log path
   */
  constructor(log = Recorder.DEFAULT_LOG, program = Recorder.__filename, options = {}) {
    this.error = true;
    this.program = path.basename(program);
    this.messages = [];
    this.details = {};

    // Validate and resolve log path
    const validatePath = options.validatePath !== false;

    if (validatePath) {
      try {
        this.log = Recorder.validateLogPath(log);
        // Ensure directory exists
        Recorder.ensureLogDirectory(this.log);
      } catch (error) {
        // If validation fails, fall back to original path
        const isTestMode = process.env.NODE_ENV === 'test' || log.includes('/test/');
        if (!isTestMode) {
          console.warn(`Recorder path validation failed for ${log}: ${error.message}`);
        }
        // Use original path without validation for backward compatibility
        this.log = log;
      }
    } else {
      this.log = log;
    }

    // Tee mode: log to both file and console
    this.tee = options.tee || false;

    // Auto-enable tee in development or if env var set
    if (process.env.NODE_ENV === 'development' ||
        process.env.RESCOR_LOG_TEE === 'true' ||
        process.env.TC_LOG_TEE === 'true' ||
        process.env.SPM_LOG_TEE === 'true') {
      this.tee = true;
    }

    // Create persistent write stream
    try {
      this._stream = fs.createWriteStream(this.log, { flags: 'a' });
      this._stream.on('error', (error) => {
        // Keep logging failures non-fatal
        const isTestMode = process.env.NODE_ENV === 'test' || this.log.includes('/test/');
        if (!isTestMode) {
          console.error(`Recorder stream error for ${this.log}:`, error);
        }
        // Auto-enable tee if stream fails
        if (!this.tee) {
          this.tee = true;
        }
        this._stream = null;
      });
    } catch (error) {
      // If stream creation fails, fall back to sync writes
      this._stream = null;
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Toggle tee mode (console + file)
   *
   * @param {boolean} [value] - Enable/disable tee mode (toggles if not provided)
   * @returns {Recorder} this (for method chaining)
   */
  setTee(value = null) {
    this.tee = value !== null ? value : !this.tee;
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get recorder state as serializable object
   *
   * @returns {Object} State snapshot
   */
  get render() {
    return this.toObject();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Convert recorder state to plain object
   *
   * @returns {Object} Object with program, tee, error, messages, details
   */
  toObject() {
    return {
      program: this.program,
      log: this.log,
      tee: this.tee,
      error: this.error,
      messages: this.messages,
      details: this.details
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get current ISO 8601 timestamp
   *
   * @returns {string} Current timestamp
   */
  get stamp() {
    return new Date().toISOString();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Write a log entry
   *
   * Format: TIMESTAMP PROGRAM-CODEseverity MESSAGE
   * Example: 2026-02-14T10:30:00.000Z myapp-006001i Application started
   *
   * Best-effort: will not throw on disk errors, degrades gracefully:
   * 1. Try stream write
   * 2. Fall back to sync append
   * 3. Fall back to low-level FD write
   * 4. Fall back to console only
   *
   * @param {number|string} number - Event code (zero-padded to 6 digits)
   * @param {string} severity - Single char severity ('i','e','w','d','s','t')
   * @param {string} message - Log message text
   * @param {Object} [metadata] - Optional metadata object (will be JSON stringified)
   */
  emit(number, severity, message, metadata = null) {
    number = String(number).padStart(6, '0');

    // Build entry
    let entry = `${this.stamp} ${this.program}-${number}${severity} ${message}`;

    // Append metadata if provided
    if (metadata && typeof metadata === 'object') {
      try {
        entry += ' ' + JSON.stringify(metadata);
      } catch (err) {
        // Ignore JSON stringify errors
      }
    }

    // Write to file (best-effort with graceful degradation)
    try {
      if (this._stream && !this._stream.destroyed) {
        try {
          this._stream.write(entry + '\n');
        } catch (writeError) {
          // Stream write failed; fall back to sync
          fs.appendFileSync(this.log, entry + '\n');
        }
      } else {
        fs.appendFileSync(this.log, entry + '\n');
      }
    } catch (error) {
      // Last-resort: low-level FD write
      try {
        const fd = fs.openSync(this.log, 'a');
        fs.writeFileSync(fd, entry + '\n');
        try {
          fs.closeSync(fd);
        } catch (_) {
          // Ignore close errors
        }
      } catch (_) {
        // Complete failure - enable tee to ensure logs are visible
        if (!this.tee) {
          this.tee = true;
        }
      }
    }

    // Tee to console if enabled
    if (this.tee) {
      const logger = Recorder.LOG_TYPE[severity] || console.log;
      logger(entry);
    }

    // Add to in-memory buffer
    this.addMessage(entry);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Append message to in-memory buffer
   *
   * @param {string} message - Message to buffer
   */
  addMessage(message) {
    this.messages.push(message);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Set metadata detail
   *
   * @param {string} key - Metadata key
   * @param {*} value - Metadata value
   */
  setDetail(key, value) {
    this.details[key] = value;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get metadata detail
   *
   * @param {string} key - Metadata key
   * @returns {*} Metadata value
   */
  getDetail(key) {
    return this.details[key];
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Set error state to true
   * Usage: recorder.setErrorState;
   *
   * @returns {boolean} true
   */
  get setErrorState() {
    this.error = true;
    return this.error;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Set error state to false
   * Usage: recorder.clearErrorState;
   *
   * @returns {boolean} false
   */
  get clearErrorState() {
    this.error = false;
    return this.error;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if error state is set
   *
   * @returns {boolean} Error state
   */
  hasError() {
    return this.error === true;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get all messages
   *
   * @returns {string[]} Array of log messages
   */
  getMessages() {
    return [...this.messages];
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Clear message buffer
   */
  clearMessages() {
    this.messages = [];
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get all metadata
   *
   * @returns {Object} Metadata object
   */
  getDetails() {
    return { ...this.details };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Clear metadata
   */
  clearDetails() {
    this.details = {};
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Close the log stream and free file descriptors
   *
   * Call when done logging to ensure cleanup
   */
  close() {
    if (this._stream && !this._stream.destroyed) {
      this._stream.end();
      this._stream.destroy(); // Ensure stream is marked as destroyed
    }
  }
}
