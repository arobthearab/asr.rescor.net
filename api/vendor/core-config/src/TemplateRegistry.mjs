/**
 * TemplateRegistry - Central registry for configuration templates
 *
 * Provides a centralized location to register and access templates by name,
 * making it easy to apply common configurations quickly.
 */

// Database templates
import {
  LocalDatabaseTemplate,
  TestDatabaseTemplate,
  UATDatabaseTemplate,
  ProductionDatabaseTemplate,
  DockerDatabaseTemplate
} from './templates/DatabaseTemplate.mjs';

// API templates
import {
  SecurityApiTemplate,
  DevelopmentApiTemplate,
  AIApiTemplate,
  CommunicationApiTemplate,
  PaymentApiTemplate,
  CompleteApiTemplate
} from './templates/ApiTemplate.mjs';

// Phase templates
import {
  DevelopmentPhaseTemplate,
  UATPhaseTemplate,
  ProductionPhaseTemplate,
  TCDevelopmentTemplate,
  TCUATTemplate,
  TCProductionTemplate,
  SPMDevelopmentTemplate,
  SPMUATTemplate,
  SPMProductionTemplate
} from './templates/PhaseTemplate.mjs';

/**
 * Central registry for all configuration templates
 *
 * @example
 * import { defaultTemplateRegistry } from '@rescor-llc/core-config';
 *
 * // Apply template by name
 * await defaultTemplateRegistry.apply('database:local', config);
 *
 * // List available templates
 * console.log(defaultTemplateRegistry.list());
 */
export class TemplateRegistry {
  /* -------------------------------------------------------------------------- */
  /**
   * Creates a new template registry.
   */
  constructor() {
    this.templates = new Map();
    this.categories = new Map();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Register a template class
   *
   * @param {string} name - Template name (e.g., 'database:local')
   * @param {Class} TemplateClass - Template class
   * @param {string} category - Category (e.g., 'database')
   * @returns {TemplateRegistry} - This registry (for chaining)
   */
  register(name, TemplateClass, category = 'general') {
    this.templates.set(name, TemplateClass);

    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category).push(name);

    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Unregister a template
   *
   * @param {string} name - Template name
   * @returns {boolean} - True if template was removed
   */
  unregister(name) {
    // Remove from category
    for (const [category, templates] of this.categories) {
      const index = templates.indexOf(name);
      if (index > -1) {
        templates.splice(index, 1);
        if (templates.length === 0) {
          this.categories.delete(category);
        }
        break;
      }
    }

    return this.templates.delete(name);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get template class by name
   *
   * @param {string} name - Template name
   * @returns {Class} - Template class
   * @throws {Error} If template not found
   */
  get(name) {
    const TemplateClass = this.templates.get(name);
    if (!TemplateClass) {
      throw new Error(
        `Template '${name}' not registered. Available templates: ${this.list().join(', ')}`
      );
    }
    return TemplateClass;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Check if template is registered
   *
   * @param {string} name - Template name
   * @returns {boolean} - True if registered
   */
  has(name) {
    return this.templates.has(name);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create template instance by name
   *
   * @param {string} name - Template name
   * @param {Object} options - Template options
   * @returns {Template} - Template instance
   * @throws {Error} If template not found
   */
  create(name, options = {}) {
    const TemplateClass = this.get(name);
    return new TemplateClass(options);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Apply template by name
   *
   * @param {string} name - Template name
   * @param {Configuration} config - Configuration instance
   * @param {Object} options - Application options
   * @returns {Promise<void>}
   * @throws {Error} If template not found
   */
  async apply(name, config, options = {}) {
    const TemplateClass = this.get(name);
    const template = new TemplateClass(options.templateOptions);
    await template.apply(config, options);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Preview template values by name
   *
   * @param {string} name - Template name
   * @param {Configuration} config - Configuration instance
   * @param {Object} options - Application options
   * @returns {Promise<Object>} - Preview of values
   */
  async preview(name, config, options = {}) {
    const TemplateClass = this.get(name);
    const template = new TemplateClass(options.templateOptions);
    return template.preview(config, options);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * List all registered template names
   *
   * @param {string} category - Optional category filter
   * @returns {string[]} - Array of template names
   */
  list(category = null) {
    if (category) {
      return this.categories.get(category) || [];
    }
    return Array.from(this.templates.keys());
  }

  /* -------------------------------------------------------------------------- */
  /**
   * List all categories
   *
   * @returns {string[]} - Array of category names
   */
  listCategories() {
    return Array.from(this.categories.keys());
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get templates by category
   *
   * @param {string} category - Category name
   * @returns {string[]} - Template names in category
   */
  getCategory(category) {
    return this.categories.get(category) || [];
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get metadata for all registered templates
   *
   * @returns {Object} - Map of template name to metadata
   */
  getAllMetadata() {
    const metadata = {};
    for (const [name, TemplateClass] of this.templates) {
      const instance = new TemplateClass();
      metadata[name] = instance.getMetadata();
    }
    return metadata;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Search templates by tag
   *
   * @param {string} tag - Tag to search for
   * @returns {string[]} - Template names with matching tag
   */
  searchByTag(tag) {
    const results = [];
    for (const [name, TemplateClass] of this.templates) {
      const instance = new TemplateClass();
      if (instance.metadata.tags.includes(tag.toLowerCase())) {
        results.push(name);
      }
    }
    return results;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Clear all registered templates
   */
  clear() {
    this.templates.clear();
    this.categories.clear();
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get count of registered templates
   *
   * @returns {number} - Number of templates
   */
  get size() {
    return this.templates.size;
  }
}

/**
 * Default registry with built-in templates
 *
 * Pre-registered templates:
 * - Database: local, test, uat, prod, docker
 * - API: security, development, ai, communication, payment, complete
 * - Phase: TC (dev, uat, prod), SPM (dev, uat, prod), generic (dev, uat, prod)
 */
export const defaultTemplateRegistry = new TemplateRegistry();

/* -------------------------------------------------------------------------- */
// Register database templates
defaultTemplateRegistry.register('database:local', LocalDatabaseTemplate, 'database');
defaultTemplateRegistry.register('database:test', TestDatabaseTemplate, 'database');
defaultTemplateRegistry.register('database:uat', UATDatabaseTemplate, 'database');
defaultTemplateRegistry.register('database:prod', ProductionDatabaseTemplate, 'database');
defaultTemplateRegistry.register('database:docker', DockerDatabaseTemplate, 'database');

/* -------------------------------------------------------------------------- */
// Register API templates
defaultTemplateRegistry.register('api:security', SecurityApiTemplate, 'api');
defaultTemplateRegistry.register('api:development', DevelopmentApiTemplate, 'api');
defaultTemplateRegistry.register('api:ai', AIApiTemplate, 'api');
defaultTemplateRegistry.register('api:communication', CommunicationApiTemplate, 'api');
defaultTemplateRegistry.register('api:payment', PaymentApiTemplate, 'api');
defaultTemplateRegistry.register('api:complete', CompleteApiTemplate, 'api');

/* -------------------------------------------------------------------------- */
// Register generic phase templates
defaultTemplateRegistry.register('phase:dev', DevelopmentPhaseTemplate, 'phase');
defaultTemplateRegistry.register('phase:uat', UATPhaseTemplate, 'phase');
defaultTemplateRegistry.register('phase:prod', ProductionPhaseTemplate, 'phase');

/* -------------------------------------------------------------------------- */
// Register TC phase templates
defaultTemplateRegistry.register('phase:tc:dev', TCDevelopmentTemplate, 'phase');
defaultTemplateRegistry.register('phase:tc:uat', TCUATTemplate, 'phase');
defaultTemplateRegistry.register('phase:tc:prod', TCProductionTemplate, 'phase');

/* -------------------------------------------------------------------------- */
// Register SPM phase templates
defaultTemplateRegistry.register('phase:spm:dev', SPMDevelopmentTemplate, 'phase');
defaultTemplateRegistry.register('phase:spm:uat', SPMUATTemplate, 'phase');
defaultTemplateRegistry.register('phase:spm:prod', SPMProductionTemplate, 'phase');
