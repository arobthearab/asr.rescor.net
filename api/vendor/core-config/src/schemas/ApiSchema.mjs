/**
 * ApiSchema - Standard API configuration schema
 *
 * Defines a reusable pattern for API endpoint and key configuration
 * supporting multiple APIs with base URLs and authentication keys.
 */

import { Schema } from '../Schema.mjs';
import { ClassifiedDatum } from '../ClassifiedDatum.mjs';

/**
 * API configuration schema
 *
 * Provides standardized API configuration for multiple APIs:
 * - Base URLs for each API
 * - API keys/tokens for authentication
 * - Automatic key rotation tracking
 *
 * @example
 * const apiSchema = new ApiSchema({ apis: ['nvd', 'github'] });
 * const apis = await apiSchema.load(config);
 * console.log(apis.nvd.baseUrl);
 * console.log(apis.github.key);
 */
export class ApiSchema extends Schema {
  /**
   * @param {Object} options - Schema options
   * @param {string[]} options.apis - List of API names (default: ['nvd', 'github', 'openai'])
   * @param {string} options.domain - Domain name (default: 'api')
   * @param {number} options.keyRotationDays - Days before key rotation (default: 180)
   */
  constructor(options = {}) {
    const apis = options.apis || ['nvd', 'github', 'openai'];
    const domain = options.domain || 'api';
    const keyRotationDays = options.keyRotationDays || 180;

    const items = [];
    for (const api of apis) {
      items.push(
        ClassifiedDatum.setting(domain, `${api}_base_url`, {
          description: `${api.toUpperCase()} API base URL`,
          default: ApiSchema.getDefaultBaseUrl(api)
        }),
        ClassifiedDatum.credential(domain, `${api}_key`, {
          description: `${api.toUpperCase()} API key or token`,
          rotation: keyRotationDays,
          required: true
        })
      );
    }

    super(items);
    this.apis = apis;
    this.domain = domain;
  }

  /**
   * Get default base URL for common APIs
   *
   * @param {string} api - API name
   * @returns {string} - Default base URL
   */
  static getDefaultBaseUrl(api) {
    const defaults = {
      nvd: 'https://services.nvd.nist.gov/rest/json',
      github: 'https://api.github.com',
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com/v1',
      stripe: 'https://api.stripe.com/v1',
      slack: 'https://slack.com/api',
      sendgrid: 'https://api.sendgrid.com/v3',
      twilio: 'https://api.twilio.com'
    };
    return defaults[api.toLowerCase()] || '';
  }

  /**
   * Convert to typed API configuration object
   *
   * @returns {Object} - API configuration with one key per API
   *
   * @example
   * {
   *   nvd: {
   *     baseUrl: 'https://services.nvd.nist.gov/rest/json',
   *     key: 'abc123...'
   *   },
   *   github: {
   *     baseUrl: 'https://api.github.com',
   *     key: 'ghp_xyz...'
   *   }
   * }
   */
  toTypedObject() {
    const config = {};

    for (const api of this.apis) {
      config[api] = {
        baseUrl: this.getValue(this.domain, `${api}_base_url`) ||
                 ApiSchema.getDefaultBaseUrl(api),
        key: this.getValue(this.domain, `${api}_key`)
      };
    }

    return config;
  }

  /**
   * Get configuration for a specific API
   *
   * @param {string} api - API name
   * @returns {Object|null} - API configuration or null if not found
   *
   * @example
   * const nvdConfig = schema.getApiConfig('nvd');
   * console.log(nvdConfig.baseUrl);
   */
  getApiConfig(api) {
    if (!this.apis.includes(api)) {
      return null;
    }

    return {
      baseUrl: this.getValue(this.domain, `${api}_base_url`) ||
               ApiSchema.getDefaultBaseUrl(api),
      key: this.getValue(this.domain, `${api}_key`)
    };
  }

  /**
   * Check if API is configured
   *
   * @param {string} api - API name
   * @returns {boolean} - True if API has a key configured
   */
  hasApi(api) {
    const key = this.getValue(this.domain, `${api}_key`);
    return !!key;
  }

  /**
   * Get list of configured APIs
   *
   * @returns {string[]} - List of APIs with keys configured
   */
  getConfiguredApis() {
    return this.apis.filter(api => this.hasApi(api));
  }

  /**
   * Get safe configuration for logging (with masked keys)
   *
   * @returns {Object} - Configuration with masked API keys
   */
  getSafeConfig() {
    const config = {};

    for (const api of this.apis) {
      const key = this.getValue(this.domain, `${api}_key`);
      config[api] = {
        baseUrl: this.getValue(this.domain, `${api}_base_url`) ||
                 ApiSchema.getDefaultBaseUrl(api),
        key: key ? `${key.substring(0, 8)}...***MASKED***` : 'NOT_SET',
        configured: !!key
      };
    }

    return config;
  }
}
