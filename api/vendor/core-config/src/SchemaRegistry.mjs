/**
 * SchemaRegistry - Central registry for configuration schemas
 *
 * Provides a centralized location to register and access schemas by name,
 * enabling schema-driven configuration management across the application.
 */

import { DatabaseSchema } from './schemas/DatabaseSchema.mjs';
import { ApiSchema } from './schemas/ApiSchema.mjs';
import { PhaseSchema } from './schemas/PhaseSchema.mjs';

/**
 * Central registry for all configuration schemas
 *
 * @example
 * import { defaultRegistry } from '@rescor-llc/core-config';
 *
 * // Load by name
 * const db = await defaultRegistry.load('database', config);
 *
 * // List available schemas
 * console.log(defaultRegistry.list());
 */
export class SchemaRegistry {
  /* -------------------------------------------------------------------------- */
  /**
   * Creates a new schema registry.
   */
  constructor() {
    this.schemas = new Map();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Register a schema class
   *
   * @param {string} name - Schema name (used for lookup)
   * @param {Class} SchemaClass - Schema class (extends Schema)
   * @returns {SchemaRegistry} - This registry (for chaining)
   *
   * @example
   * registry.register('database', DatabaseSchema);
   */
  register(name, SchemaClass) {
    this.schemas.set(name, SchemaClass);
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Unregister a schema
   *
   * @param {string} name - Schema name
   * @returns {boolean} - True if schema was removed
   */
  unregister(name) {
    return this.schemas.delete(name);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get schema class by name
   *
   * @param {string} name - Schema name
   * @returns {Class} - Schema class
   * @throws {Error} If schema not found
   *
   * @example
   * const DatabaseSchema = registry.get('database');
   * const schema = new DatabaseSchema();
   */
  get(name) {
    const SchemaClass = this.schemas.get(name);
    if (!SchemaClass) {
      throw new Error(`Schema '${name}' not registered. Available schemas: ${this.list().join(', ')}`);
    }
    return SchemaClass;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if schema is registered
   *
   * @param {string} name - Schema name
   * @returns {boolean} - True if registered
   */
  has(name) {
    return this.schemas.has(name);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create schema instance by name
   *
   * @param {string} name - Schema name
   * @param {Object} options - Schema options
   * @returns {Schema} - Schema instance
   * @throws {Error} If schema not found
   *
   * @example
   * const dbSchema = registry.create('database', { domain: 'primary_db' });
   */
  create(name, options = {}) {
    const SchemaClass = this.get(name);
    return new SchemaClass(options);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create and load schema by name
   *
   * Convenience method that combines create() and load().
   *
   * @param {string} name - Schema name
   * @param {Configuration} config - Configuration instance
   * @param {Object} options - Schema options
   * @returns {Promise<Object>} - Loaded configuration object
   * @throws {Error} If schema not found or validation fails
   *
   * @example
   * const db = await registry.load('database', config);
   * const apis = await registry.load('api', config, { apis: ['nvd', 'github'] });
   */
  async load(name, config, options = {}) {
    const SchemaClass = this.get(name);
    const schema = new SchemaClass(options);
    return schema.load(config);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if schema is complete in config
   *
   * @param {string} name - Schema name
   * @param {Configuration} config - Configuration instance
   * @param {Object} options - Schema options
   * @returns {Promise<boolean>} - True if complete
   *
   * @example
   * if (await registry.isComplete('database', config)) {
   *   const db = await registry.load('database', config);
   * }
   */
  async isComplete(name, config, options = {}) {
    const SchemaClass = this.get(name);
    const schema = new SchemaClass(options);
    return schema.isComplete(config);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * List all registered schema names
   *
   * @returns {string[]} - Array of schema names
   *
   * @example
   * console.log(registry.list());
   * // ['database', 'api', 'phase']
   */
  list() {
    return Array.from(this.schemas.keys());
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get metadata for all registered schemas
   *
   * @returns {Object} - Map of schema name to metadata
   *
   * @example
   * const allSchemas = registry.getAllMetadata();
   * console.log(allSchemas.database.itemCount);
   */
  getAllMetadata() {
    const metadata = {};
    for (const [name, SchemaClass] of this.schemas) {
      const instance = new SchemaClass();
      metadata[name] = instance.getMetadata();
    }
    return metadata;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get schema definition as JSON
   *
   * @param {string} name - Schema name
   * @param {Object} options - Schema options
   * @returns {Object} - Schema definition
   */
  getDefinition(name, options = {}) {
    const SchemaClass = this.get(name);
    const schema = new SchemaClass(options);
    return schema.toJSON();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Clear all registered schemas
   */
  clear() {
    this.schemas.clear();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get count of registered schemas
   *
   * @returns {number} - Number of schemas
   */
  get size() {
    return this.schemas.size;
  }
}

/**
 * Default registry with built-in schemas
 *
 * Pre-registered schemas:
 * - database: DatabaseSchema
 * - api: ApiSchema
 * - phase: PhaseSchema
 *
 * @example
 * import { defaultRegistry } from '@rescor-llc/core-config';
 *
 * const db = await defaultRegistry.load('database', config);
 * const apis = await defaultRegistry.load('api', config, { apis: ['nvd'] });
 * const phase = await defaultRegistry.load('phase', config, { projectPrefix: 'TC' });
 */
export const defaultRegistry = new SchemaRegistry();
defaultRegistry.register('database', DatabaseSchema);
defaultRegistry.register('api', ApiSchema);
defaultRegistry.register('phase', PhaseSchema);
