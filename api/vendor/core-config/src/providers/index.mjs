/**
 * providers/index.mjs
 *
 * Secret store provider registry and exports.
 *
 * Provides centralized access to all available secret store providers:
 * - Infisical
 * - Environment variables (.env)
 * - AWS Secrets Manager (future)
 * - AWS Systems Manager Parameter Store (future)
 * - Azure Key Vault (future)
 *
 * @module @rescor-llc/core-config/providers
 */

import { SecretStoreProvider } from './SecretStoreProvider.mjs';
import { InfisicalProvider } from './InfisicalProvider.mjs';
import { EnvironmentProvider } from './EnvironmentProvider.mjs';

/**
 * Provider registry.
 *
 * Maps provider names to their implementation classes.
 *
 * @type {Object<string, typeof SecretStoreProvider>}
 *
 * @example
 * import { PROVIDERS } from '@rescor-llc/core-config/providers';
 *
 * const ProviderClass = PROVIDERS['infisical'];
 * const provider = new ProviderClass({ mode: 'local' });
 */
export const PROVIDERS = {
  'infisical': InfisicalProvider,
  'environment': EnvironmentProvider
  // Future providers:
  // 'aws-sm': AWSSecretsManagerProvider,
  // 'aws-ps': AWSParameterStoreProvider,
  // 'azure-kv': AzureKeyVaultProvider
};

/**
 * Get a provider class by name.
 *
 * @param {string} name - Provider name (e.g., 'infisical', 'environment')
 * @returns {typeof SecretStoreProvider} Provider class
 * @throws {Error} If provider not found
 *
 * @example
 * const ProviderClass = getProvider('infisical');
 * const provider = new ProviderClass({ mode: 'local' });
 */
export function getProvider(name) {
  const ProviderClass = PROVIDERS[name];

  if (!ProviderClass) {
    const available = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Unknown provider '${name}' - available: ${available}`);
  }

  return ProviderClass;
}

/**
 * Create a provider instance by name.
 *
 * @param {string} name - Provider name
 * @param {Object} [config] - Provider configuration
 * @returns {SecretStoreProvider} Provider instance
 * @throws {Error} If provider not found
 *
 * @example
 * const provider = createProvider('infisical', { mode: 'local' });
 * await provider.connect({ ... });
 */
export function createProvider(name, config = {}) {
  const ProviderClass = getProvider(name);
  return new ProviderClass({ ...config, name });
}

/**
 * List all available provider names.
 *
 * @returns {string[]} Array of provider names
 *
 * @example
 * const providers = listProviders();
 * // ['infisical', 'environment']
 */
export function listProviders() {
  return Object.keys(PROVIDERS).sort();
}

/**
 * Check if a provider is available.
 *
 * @param {string} name - Provider name
 * @returns {boolean} True if provider is available
 *
 * @example
 * if (hasProvider('infisical')) {
 *   // Use Infisical
 * }
 */
export function hasProvider(name) {
  return name in PROVIDERS;
}

/**
 * Get provider metadata.
 *
 * Returns information about all registered providers.
 *
 * @returns {Object[]} Array of provider metadata
 *
 * @example
 * const metadata = getProviderMetadata();
 * // [
 * //   { name: 'infisical', class: 'InfisicalProvider', capabilities: [...] },
 * //   { name: 'environment', class: 'EnvironmentProvider', capabilities: [...] }
 * // ]
 */
export function getProviderMetadata() {
  return Object.entries(PROVIDERS).map(([name, ProviderClass]) => {
    // Create temporary instance to get capabilities
    const instance = new ProviderClass({ name });
    const capabilities = instance._getCapabilities();

    return {
      name,
      class: ProviderClass.name,
      capabilities
    };
  });
}

// Export all provider classes
export {
  SecretStoreProvider,
  InfisicalProvider,
  EnvironmentProvider
};
