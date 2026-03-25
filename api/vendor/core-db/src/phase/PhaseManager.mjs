/**
 * PhaseManager - Deployment phase determination
 *
 * Determines which deployment phase (development, UAT, production) the application
 * is running in based on environment variables, configuration, or explicit settings.
 *
 * Supports:
 * - Environment-based detection (NODE_ENV, PHASE, etc.)
 * - Configuration-based detection (@rescor-llc/core-config)
 * - Explicit phase setting
 * - Default fallback (development)
 *
 * @example
 * import { PhaseManager } from '@rescor-llc/core-db/phase';
 *
 * const phaseManager = new PhaseManager();
 * const phase = phaseManager.determinePhase();
 * console.log(phase);  // 'development', 'uat', or 'production'
 */

/**
 * Valid deployment phases
 */
export const PHASES = {
  DEVELOPMENT: 'development',
  UAT: 'uat',
  PRODUCTION: 'production'
};

/**
 * Phase aliases for flexible configuration
 */
const PHASE_ALIASES = {
  // Development aliases
  'dev': PHASES.DEVELOPMENT,
  'develop': PHASES.DEVELOPMENT,
  'development': PHASES.DEVELOPMENT,
  'local': PHASES.DEVELOPMENT,

  // UAT aliases
  'uat': PHASES.UAT,
  'staging': PHASES.UAT,
  'stage': PHASES.UAT,
  'test': PHASES.UAT,
  'testing': PHASES.UAT,

  // Production aliases
  'prod': PHASES.PRODUCTION,
  'production': PHASES.PRODUCTION,
  'live': PHASES.PRODUCTION
};

/**
 * PhaseManager - Determines deployment phase
 *
 * Detection strategy (in order):
 * 1. Explicitly set phase (constructor or setPhase())
 * 2. Configuration object (config.phase)
 * 3. PHASE environment variable
 * 4. NODE_ENV environment variable
 * 5. Default to 'development'
 */
export class PhaseManager {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.phase - Explicitly set phase
   * @param {Configuration} options.config - Configuration instance
   * @param {Object} options.env - Environment variables (default: process.env)
   * @param {string} options.defaultPhase - Default phase (default: 'development')
   */
  constructor(options = {}) {
    this.explicitPhase = options.phase || null;
    this.config = options.config || null;
    this.env = options.env || process.env;
    this.defaultPhase = options.defaultPhase || PHASES.DEVELOPMENT;

    // Cached phase (invalidated when setPhase() called)
    this._cachedPhase = null;
  }

  /**
   * Determine current deployment phase
   *
   * @returns {string} - Phase ('development', 'uat', or 'production')
   */
  determinePhase() {
    // Return cached phase if available
    if (this._cachedPhase) {
      return this._cachedPhase;
    }

    let phase = null;

    // Strategy 1: Explicitly set phase
    if (this.explicitPhase) {
      phase = this._normalizePhase(this.explicitPhase);
    }

    // Strategy 2: Configuration object
    if (!phase && this.config) {
      const configPhase = this.config.get?.('phase') || this.config.phase;
      if (configPhase) {
        phase = this._normalizePhase(configPhase);
      }
    }

    // Strategy 3: PHASE environment variable
    if (!phase && this.env.PHASE) {
      phase = this._normalizePhase(this.env.PHASE);
    }

    // Strategy 4: NODE_ENV environment variable
    if (!phase && this.env.NODE_ENV) {
      phase = this._normalizePhase(this.env.NODE_ENV);
    }

    // Strategy 5: Default
    if (!phase) {
      phase = this.defaultPhase;
    }

    // Cache and return
    this._cachedPhase = phase;
    return phase;
  }

  /**
   * Set phase explicitly
   *
   * @param {string} phase - Phase to set
   */
  setPhase(phase) {
    this.explicitPhase = this._normalizePhase(phase);
    this._cachedPhase = null;  // Invalidate cache
  }

  /**
   * Check if current phase is development
   *
   * @returns {boolean}
   */
  isDevelopment() {
    return this.determinePhase() === PHASES.DEVELOPMENT;
  }

  /**
   * Check if current phase is UAT
   *
   * @returns {boolean}
   */
  isUAT() {
    return this.determinePhase() === PHASES.UAT;
  }

  /**
   * Check if current phase is production
   *
   * @returns {boolean}
   */
  isProduction() {
    return this.determinePhase() === PHASES.PRODUCTION;
  }

  /**
   * Get phase configuration
   *
   * @returns {Object} - Phase configuration
   */
  getPhaseConfig() {
    const phase = this.determinePhase();

    return {
      phase,
      isDevelopment: phase === PHASES.DEVELOPMENT,
      isUAT: phase === PHASES.UAT,
      isProduction: phase === PHASES.PRODUCTION,
      isProductionLike: phase === PHASES.PRODUCTION || phase === PHASES.UAT,
      allowDebug: phase === PHASES.DEVELOPMENT || phase === PHASES.UAT,
      allowReset: phase !== PHASES.PRODUCTION,
      requireApproval: phase === PHASES.PRODUCTION
    };
  }

  /**
   * Normalize phase name
   *
   * @param {string} phase - Raw phase name
   * @returns {string} - Normalized phase (falls back to default if invalid)
   */
  _normalizePhase(phase) {
    if (!phase || typeof phase !== 'string') {
      return this.defaultPhase; // Fall back to default instead of throwing
    }

    const normalized = phase.toLowerCase().trim();

    // Check if it's a valid phase alias
    if (PHASE_ALIASES[normalized]) {
      return PHASE_ALIASES[normalized];
    }

    // Check if it's already a valid phase
    if (Object.values(PHASES).includes(normalized)) {
      return normalized;
    }

    // Invalid phase - fall back to default instead of throwing
    if (this.recorder) {
      this.recorder.emit(8001, 'w', `Invalid phase: "${phase}". Falling back to ${this.defaultPhase}`);
    }

    return this.defaultPhase;
  }

  /**
   * Reset cached phase (force re-detection)
   */
  reset() {
    this._cachedPhase = null;
  }

  /**
   * Get metadata about phase detection
   *
   * @returns {Object} - Metadata
   */
  getMetadata() {
    const currentPhase = this.determinePhase();

    return {
      currentPhase,
      phase: currentPhase, // Alias for backward compatibility
      source: this._getPhaseSource(),
      explicitPhase: this.explicitPhase,
      defaultPhase: this.defaultPhase,
      isDevelopment: this.isDevelopment(),
      isUAT: this.isUAT(),
      isProduction: this.isProduction(),
      envPHASE: this.env.PHASE || null,
      envNODE_ENV: this.env.NODE_ENV || null
    };
  }

  /**
   * Get source of phase determination
   *
   * @returns {string} - Source ('explicit', 'config', 'env:PHASE', 'env:NODE_ENV', 'default')
   */
  _getPhaseSource() {
    if (this.explicitPhase) {
      return 'explicit';
    }

    if (this.config) {
      const configPhase = this.config.get?.('phase') || this.config.phase;
      if (configPhase) {
        return 'config';
      }
    }

    if (this.env.PHASE) {
      return 'env:PHASE';
    }

    if (this.env.NODE_ENV) {
      return 'env:NODE_ENV';
    }

    return 'default';
  }

  /**
   * Create PhaseManager from environment
   *
   * @param {Object} env - Environment variables (default: process.env)
   * @returns {PhaseManager}
   */
  static fromEnv(env = process.env) {
    return new PhaseManager({ env });
  }

  /**
   * Create PhaseManager from configuration
   *
   * @param {Configuration} config - Configuration instance
   * @returns {PhaseManager}
   */
  static fromConfig(config) {
    return new PhaseManager({ config });
  }
}
