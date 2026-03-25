/**
 * Template - Pre-configured schema instances with default values
 *
 * Templates provide quick-start configurations with sensible defaults
 * that can be customized and deployed to different environments.
 */

/**
 * Base class for configuration templates
 *
 * Templates combine a schema with pre-filled default values,
 * making it easy to bootstrap configurations quickly.
 *
 * @example
 * class LocalDatabaseTemplate extends Template {
 *   constructor() {
 *     super(new DatabaseSchema(), {
 *       database: {
 *         hostname: 'localhost',
 *         port: '50000',
 *         database: 'DEVDB',
 *         protocol: 'TCPIP',
 *         user: 'devuser',
 *         password: 'devpass123'
 *       }
 *     });
 *   }
 * }
 */
export class Template {
  /**
   * @param {Schema} schema - Schema instance to use
   * @param {Object} defaults - Default values for the schema
   * @param {Object} metadata - Template metadata (name, description, etc.)
   */
    /* -------------------------------------------------------------------------- */
    /**
     * Creates a new template definition.
     */
  constructor(schema, defaults = {}, metadata = {}) {
    this.schema = schema;
    this.defaults = defaults;
    this.metadata = {
      name: this.constructor.name,
      description: metadata.description || '',
      version: metadata.version || '1.0.0',
      author: metadata.author || 'RESCOR',
      tags: metadata.tags || [],
      ...metadata
    };
  }

    /* -------------------------------------------------------------------------- */
  /**
   * Apply template to configuration store
   *
   * Saves the default values to the configuration store.
   * Optionally merge with overrides or existing values.
   *
   * @param {Configuration} config - Configuration instance
   * @param {Object} options - Application options
   * @param {Object} options.overrides - Values to override defaults
   * @param {boolean} options.merge - Merge with existing config (default: false)
   * @param {boolean} options.force - Force overwrite existing values (default: false)
   * @returns {Promise<void>}
   *
   * @example
   * const template = new LocalDatabaseTemplate();
   * await template.apply(config, {
   *   overrides: { database: { hostname: 'db.local' } }
   * });
   */
  async apply(config, options = {}) {
    const { overrides = {}, merge = false, force = false } = options;

    // If merging, load existing values first
    let values = { ...this.defaults };

    if (merge && !force) {
      try {
        // Try to load existing values
        const existing = await this.schema.load(config);
        // Merge: existing values take precedence unless force=true
        values = this.mergeDeep(values, existing);
      } catch (err) {
        // No existing values or incomplete, use defaults
      }
    }

    // Apply overrides (highest precedence)
    if (overrides && Object.keys(overrides).length > 0) {
      values = this.mergeDeep(values, overrides);
    }

    // Save to configuration
    await this.schema.save(config, values);
  }

    /* -------------------------------------------------------------------------- */
  /**
   * Get template values without applying
   *
   * @param {Object} overrides - Values to override defaults
   * @returns {Object} - Merged template values
   */
  getValues(overrides = {}) {
    if (Object.keys(overrides).length === 0) {
      return { ...this.defaults };
    }
    return this.mergeDeep({ ...this.defaults }, overrides);
  }

    /* -------------------------------------------------------------------------- */
  /**
   * Preview what would be applied
   *
   * @param {Configuration} config - Configuration instance
   * @param {Object} options - Application options
   * @returns {Promise<Object>} - Preview of values that would be applied
   */
  async preview(config, options = {}) {
    const { overrides = {}, merge = false } = options;

    let values = { ...this.defaults };

    if (merge) {
      try {
        const existing = await this.schema.load(config);
        values = this.mergeDeep(values, existing);
      } catch (err) {
        // No existing values
      }
    }

    if (overrides && Object.keys(overrides).length > 0) {
      values = this.mergeDeep(values, overrides);
    }

    return values;
  }

    /* -------------------------------------------------------------------------- */
  /**
   * Validate template can be applied
   *
   * @param {Configuration} config - Configuration instance
   * @returns {Promise<{valid: boolean, errors: string[]}>}
   */
  async validate(config) {
    const errors = [];

    try {
      // Create temporary schema instance with defaults
      const tempSchema = Object.create(this.schema);
      for (const [domain, fields] of Object.entries(this.defaults)) {
        for (const [key, value] of Object.entries(fields)) {
          tempSchema.setValue(domain, key, value);
        }
      }

      // Validate all required fields present
      tempSchema.validate();
    } catch (err) {
      errors.push(err.message);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

    /* -------------------------------------------------------------------------- */
  /**
   * Deep merge two objects
   *
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} - Merged object
   */
  mergeDeep(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

    /* -------------------------------------------------------------------------- */
  /**
   * Export template as JSON
   *
   * @returns {Object} - Template definition
   */
  toJSON() {
    return {
      metadata: this.metadata,
      schema: this.schema.schemaName,
      defaults: this.defaults,
      fields: this.schema.getRequiredFields()
    };
  }

    /* -------------------------------------------------------------------------- */
  /**
   * Get template metadata
   *
   * @returns {Object} - Template metadata
   */
  getMetadata() {
    return {
      ...this.metadata,
      schemaName: this.schema.schemaName,
      fieldCount: this.schema.size
    };
  }

    /* -------------------------------------------------------------------------- */
  /**
   * Clone template with modifications
   *
   * @param {Object} modifications - Values to modify
   * @returns {Template} - New template instance
   */
  clone(modifications = {}) {
    const newDefaults = this.mergeDeep({ ...this.defaults }, modifications);
    return new Template(this.schema, newDefaults, this.metadata);
  }
}
