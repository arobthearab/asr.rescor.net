/**
 * @rescor-llc/core-config - Main exports
 *
 * Phase 1: Unified API with ClassifiedDatum
 * Phase 3: Structured Configuration Schemas & Templates
 */

/* -------------------------------------------------------------------------- */
// Core classes
export { Configuration, config } from './Configuration.mjs';
export { SecureStore, SecureStoreError, SecureItem, SecureItems } from './SecureStore.mjs';
export { ClassifiedDatum, ClassifiedData, Classified } from './ClassifiedDatum.mjs';
export {
  isTruthy,
  getAppConfig,
  pickMode,
  getModeVars,
  getHostForMode,
  detectInfisicalOnboarding,
  promptForMissingInfisicalValues,
  checkDns,
  checkReachability,
  ensureInfisicalOnboarding
} from './InfisicalOnboarding.mjs';

/* -------------------------------------------------------------------------- */
// Store implementations
export { InfisicalStore } from './stores/InfisicalStore.mjs';
export { EnvironmentStore } from './stores/EnvironmentStore.mjs';
export { MemoryStore } from './stores/MemoryStore.mjs';
export { CascadingStore } from './stores/CascadingStore.mjs';

/* -------------------------------------------------------------------------- */
// Schema system (Phase 3 #1)
export { Schema } from './Schema.mjs';
export { SchemaRegistry, defaultRegistry } from './SchemaRegistry.mjs';

/* -------------------------------------------------------------------------- */
// Built-in schemas
export { DatabaseSchema } from './schemas/DatabaseSchema.mjs';
export { ApiSchema } from './schemas/ApiSchema.mjs';
export { PhaseSchema } from './schemas/PhaseSchema.mjs';

/* -------------------------------------------------------------------------- */
// Template system (Phase 3 #2)
export { Template } from './Template.mjs';
export { TemplateRegistry, defaultTemplateRegistry } from './TemplateRegistry.mjs';

/* -------------------------------------------------------------------------- */
// Database templates
export {
  LocalDatabaseTemplate,
  TestDatabaseTemplate,
  UATDatabaseTemplate,
  ProductionDatabaseTemplate,
  DockerDatabaseTemplate,
  RemoteDatabaseTemplate,
  createDatabaseTemplate
} from './templates/DatabaseTemplate.mjs';

/* -------------------------------------------------------------------------- */
// API templates
export {
  SecurityApiTemplate,
  DevelopmentApiTemplate,
  AIApiTemplate,
  CommunicationApiTemplate,
  PaymentApiTemplate,
  CompleteApiTemplate,
  createApiTemplate
} from './templates/ApiTemplate.mjs';

/* -------------------------------------------------------------------------- */
// Phase templates
export {
  DevelopmentPhaseTemplate,
  UATPhaseTemplate,
  ProductionPhaseTemplate,
  TCDevelopmentTemplate,
  TCUATTemplate,
  TCProductionTemplate,
  SPMDevelopmentTemplate,
  SPMUATTemplate,
  SPMProductionTemplate,
  createPhaseTemplate
} from './templates/PhaseTemplate.mjs';

/* -------------------------------------------------------------------------- */
// Store setup and providers
export { StoreSetup } from './StoreSetup.mjs';
export {
  SecretStoreProvider,
  InfisicalProvider,
  EnvironmentProvider,
  getProvider,
  createProvider,
  listProviders,
  hasProvider,
  getProviderMetadata,
  PROVIDERS
} from './providers/index.mjs';
