/**
 * Schema - Base class for structured configuration schemas
 *
 * Extends ClassifiedData to provide reusable, typed configuration patterns
 * that can be loaded, validated, and transformed into typed objects.
 */

import { ClassifiedData } from './ClassifiedDatum.mjs';

/**
 * Base schema class for structured configuration
 *
 * Schemas define standard configuration structures that can be:
 * 1. Loaded from stores with validation
 * 2. Transformed into typed objects
 * 3. Saved back to stores
 * 4. Checked for completeness
 *
 * @example
 * class MySchema extends Schema {
 *   constructor() {
 *     super([
 *       ClassifiedDatum.setting('app', 'port'),
 *       ClassifiedDatum.credential('app', 'api_key')
 *     ]);
 *   }
 *
 *   toTypedObject() {
 *     return {
 *       port: parseInt(this.getValue('app', 'port')),
 *       apiKey: this.getValue('app', 'api_key')
 *     };
 *   }
 * }
 */
export class Schema extends ClassifiedData {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {ClassifiedDatum[]} schemaDefinition - Array of ClassifiedDatum items
   */
  constructor(schemaDefinition) {
    super(schemaDefinition);
    this.schemaName = this.constructor.name;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Load configuration from store and return typed object
   *
   * This is the primary method for using schemas:
   * 1. Fetches all values from the configuration store
   * 2. Validates all required fields are present
   * 3. Transforms to a typed object via toTypedObject()
   *
   * @param {Configuration} config - Configuration instance
   * @returns {Promise<Object>} - Typed configuration object
   * @throws {Error} If validation fails
   *
   * @example
   * const schema = new DatabaseSchema();
   * const db = await schema.load(config);
   * // { hostname: 'localhost', port: 50000, ... }
   */
  async load(config) {
    // Get all values from store
    await config.get(this);

    // Validate all required fields present
    this.validate();

    // Transform to typed object (override in subclass)
    return this.toTypedObject();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Convert to typed object
   *
   * Override this in subclasses to provide typed, validated return values.
   * Default implementation returns the plain object representation.
   *
   * @returns {Object} - Typed configuration object
   *
   * @example
   * toTypedObject() {
   *   return {
   *     port: parseInt(this.getValue('app', 'port')),
   *     enabled: this.getValue('app', 'enabled') === 'true',
   *     timeout: parseFloat(this.getValue('app', 'timeout'))
   *   };
   * }
   */
  toTypedObject() {
    return this.toObject();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Save configuration values back to store
   *
   * Accepts an object with domain/key structure and saves to config store.
   *
   * @param {Configuration} config - Configuration instance
   * @param {Object} values - Values to save, structured by domain
   * @returns {Promise<void>}
   *
   * @example
   * await schema.save(config, {
   *   database: {
   *     hostname: 'localhost',
   *     port: '50000'
   *   }
   * });
   */
  async save(config, values) {
    // Set values from object
    for (const [domain, fields] of Object.entries(values)) {
      for (const [key, value] of Object.entries(fields)) {
        this.setValue(domain, key, value);
      }
    }

    // Store in config
    await config.set(this);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if schema is complete in store
   *
   * Attempts to load and validate the schema without throwing.
   * Useful for conditional logic or setup checks.
   *
   * @param {Configuration} config - Configuration instance
   * @returns {Promise<boolean>} - True if all required fields present
   *
   * @example
   * if (await schema.isComplete(config)) {
   *   const db = await schema.load(config);
   * } else {
   *   console.log('Schema incomplete, needs setup');
   * }
   */
  async isComplete(config) {
    try {
      await config.get(this);
      this.validate();
      return true;
    } catch (err) {
      return false;
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get schema metadata
   *
   * Returns information about the schema structure, useful for
   * documentation, UI generation, or debugging.
   *
   * @returns {Object} - Schema metadata
   *
   * @example
   * const meta = schema.getMetadata();
   * // {
   * //   name: 'DatabaseSchema',
   * //   itemCount: 6,
   * //   domains: ['database'],
   * //   credentials: 2,
   * //   settings: 4
   * // }
   */
  getMetadata() {
    return {
      name: this.schemaName,
      itemCount: this.size,
      domains: this.domains,
      credentials: this.credentials.length,
      settings: this.settings.length,
      personal: this.personal.length,
      sensitive: this.sensitive.length
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get list of required fields
   *
   * @returns {Array<{domain: string, key: string, fullKey: string, classification: string, description: string}>}
   */
  getRequiredFields() {
    return this.items.map(item => ({
      domain: item.domain,
      key: item.key,
      fullKey: item.fullKey,
      classification: item.classificationName,
      description: item.metadata.description || ''
    }));
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Export schema definition as JSON
   *
   * Useful for documentation or sharing schema definitions
   *
   * @returns {Object} - Schema definition as JSON
   */
  toJSON() {
    return {
      name: this.schemaName,
      metadata: this.getMetadata(),
      fields: this.getRequiredFields()
    };
  }
}
