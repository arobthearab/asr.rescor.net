/**
 * ServiceRegistry - Load and manage service definitions
 *
 * @module @rescor-llc/core-utils/ServiceRegistry
 *
 * Loads service configurations from .rescor/services.yaml files
 * with inheritance from core.rescor.net defaults.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import yaml from 'yaml';
import { ServiceDefinition } from './ServiceDefinition.mjs';

export class ServiceRegistry {
  /**
   * Create a service registry
   * @param {string} projectRoot - Project root directory
   * @param {{coreRoot?: string, coreProjectDirName?: string, workspaceRoot?: string}} [options] - Optional overrides
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = options;
    this.services = new Map();
    this.coreProjectDirName =
      options.coreProjectDirName ||
      process.env.RESCOR_CORE_PROJECT_DIRNAME ||
      'core.rescor.net';
    this.workspaceRoot = options.workspaceRoot || process.env.RESCOR_WORKSPACE_ROOT || null;
    this.explicitCoreRoot = options.coreRoot || process.env.RESCOR_CORE_ROOT || null;
    this.projectName = this._detectProjectName();
  }

  /**
   * Detect project name from path
   * @returns {string}
   * @private
   */
  _detectProjectName() {
    const rootName = basename(this.projectRoot);

    if (rootName === this.coreProjectDirName) {
      return 'core';
    }

    if (rootName.endsWith('.rescor.net')) {
      return rootName.replace(/\.rescor\.net$/, '');
    }

    return rootName || 'unknown';
  }

  /**
   * Determine whether current registry is for the core project
   * @returns {boolean}
   * @private
   */
  _isCoreProject() {
    return basename(this.projectRoot) === this.coreProjectDirName;
  }

  /**
   * Load services from YAML file
   * @param {boolean} [inheritCore=true] - Load core defaults first
   * @returns {Promise<ServiceRegistry>}
   */
  async load(inheritCore = true) {
    // Load core defaults first (if not already core project)
    if (inheritCore && !this._isCoreProject()) {
      await this._loadCoreDefaults();
    }

    // Load project-specific services
    const servicesPath = resolve(this.projectRoot, '.rescor', 'services.yaml');

    if (existsSync(servicesPath)) {
      const content = readFileSync(servicesPath, 'utf-8');
      const config = yaml.parse(content);

      if (config && config.services) {
        for (const [name, serviceConfig] of Object.entries(config.services)) {
          // Merge with core defaults if exists
          const coreService = this.services.get(name);
          const merged = coreService
            ? { ...coreService.toJSON(), ...serviceConfig }
            : serviceConfig;

          // Always mark project-defined services as origin 'project'
          merged.origin = 'project';

          // Resolve relative paths
          if (merged.composePath && !merged.composePath.startsWith('/')) {
            merged.composePath = resolve(this.projectRoot, merged.composePath);
          }

          if (merged.cwd && !merged.cwd.startsWith('/')) {
            merged.cwd = resolve(this.projectRoot, merged.cwd);
          }

          this.services.set(name, ServiceDefinition.fromYAML(name, merged));
        }
      }
    }

    return this;
  }

  /**
   * Load core service defaults
   * @private
   */
  async _loadCoreDefaults() {
    // Find core.rescor.net directory
    const coreRoot = this._findCoreRoot();
    if (!coreRoot) {
      return; // No core defaults available
    }

    const coreServicesPath = resolve(coreRoot, '.rescor', 'services.yaml');
    if (!existsSync(coreServicesPath)) {
      return;
    }

    const content = readFileSync(coreServicesPath, 'utf-8');
    const config = yaml.parse(content);

    if (config && config.services) {
      for (const [name, serviceConfig] of Object.entries(config.services)) {
        // Only add if not already defined (project overrides core)
        if (!this.services.has(name)) {
          // Resolve paths relative to core
          if (serviceConfig.composePath && !serviceConfig.composePath.startsWith('/')) {
            serviceConfig.composePath = resolve(coreRoot, serviceConfig.composePath);
          }

          serviceConfig.origin = 'core';
          this.services.set(name, ServiceDefinition.fromYAML(name, serviceConfig));
        }
      }
    }
  }

  /**
   * Find core.rescor.net root directory
   * @returns {string|null}
   * @private
   */
  _findCoreRoot() {
    if (this.explicitCoreRoot && existsSync(this.explicitCoreRoot)) {
      return this.explicitCoreRoot;
    }

    if (this.workspaceRoot) {
      const workspaceCorePath = resolve(this.workspaceRoot, this.coreProjectDirName);
      if (existsSync(workspaceCorePath)) {
        return workspaceCorePath;
      }
    }

    // Walk up from project root and look for sibling/core directories
    let current = this.projectRoot;
    while (true) {
      const candidate = resolve(current, this.coreProjectDirName);
      if (existsSync(candidate)) {
        return candidate;
      }

      const parent = dirname(current);
      if (parent === current) {
        break;
      }

      current = parent;
    }

    // Try sibling to project root as final conventional fallback
    const parent = dirname(this.projectRoot);
    const siblingCorePath = resolve(parent, this.coreProjectDirName);
    if (existsSync(siblingCorePath)) {
      return siblingCorePath;
    }

    return null;
  }

  /**
   * Get a service by name
   * @param {string} name - Service name
   * @returns {ServiceDefinition|null}
   */
  get(name) {
    return this.services.get(name) || null;
  }

  /**
   * Get all services
   * @returns {ServiceDefinition[]}
   */
  getAll() {
    return Array.from(this.services.values());
  }

  /**
   * Get services by type
   * @param {string} type - Service type
   * @returns {ServiceDefinition[]}
   */
  getByType(type) {
    return this.getAll().filter(s => s.type === type);
  }

  /**
   * Get required services
   * @returns {ServiceDefinition[]}
   */
  getRequired() {
    return this.getAll().filter(s => s.required);
  }

  /**
   * Get services in dependency order
   * @returns {ServiceDefinition[]}
   */
  getInDependencyOrder() {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (service) => {
      if (visited.has(service.name)) {
        return;
      }

      if (visiting.has(service.name)) {
        throw new Error(`Circular dependency detected: ${service.name}`);
      }

      visiting.add(service.name);

      // Visit dependencies first
      for (const depName of service.dependsOn) {
        const dep = this.get(depName);
        if (dep) {
          visit(dep);
        }
      }

      visiting.delete(service.name);
      visited.add(service.name);
      sorted.push(service);
    };

    for (const service of this.getAll()) {
      visit(service);
    }

    return sorted;
  }

  /**
   * Check if service exists
   * @param {string} name - Service name
   * @returns {boolean}
   */
  has(name) {
    return this.services.has(name);
  }

  /**
   * Get service count
   * @returns {number}
   */
  get size() {
    return this.services.size;
  }

  /**
   * Get all service names
   * @returns {string[]}
   */
  getNames() {
    return Array.from(this.services.keys());
  }

  /**
   * Get service names defined directly in the project’s services.yaml
   * (excludes unreferenced inherited core services)
   * @returns {string[]}
   */
  getProjectServiceNames() {
    return this.getAll()
      .filter(service => service.origin === 'project')
      .map(service => service.name);
  }

  /**
   * Load registry for a project
   * @param {string} projectRoot - Project root directory
   * @param {{coreRoot?: string, coreProjectDirName?: string, workspaceRoot?: string}} [options] - Optional overrides
   * @returns {Promise<ServiceRegistry>}
   */
  static async load(projectRoot, options = {}) {
    const registry = new ServiceRegistry(projectRoot, options);
    await registry.load();
    return registry;
  }
}
