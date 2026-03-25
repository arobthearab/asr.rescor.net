/**
 * @rescor/core-config TypeScript Definitions
 *
 * Type definitions for the configuration and secret management package.
 */

declare module '@rescor/core-config' {
  import { Recorder } from '@rescor/core-utils';

  // ============================================================================
  // CLASSIFICATION SYSTEM
  // ============================================================================

  /**
   * Classification levels for data sensitivity
   */
  export enum Classified {
    /** Openly shareable data */
    PUBLIC = 0,
    /** Non-sensitive configuration */
    SETTING = 1,
    /** PII, GDPR-sensitive data */
    PERSONAL = 2,
    /** Passwords, API keys, tokens */
    CREDENTIAL = 3,
    /** Requires approval to access */
    RESTRICTED = 4
  }

  /**
   * A single classified datum with category, key, and classification level
   */
  export class ClassifiedDatum {
    category: string;
    key: string;
    classification: Classified;

    constructor(category: string, key: string, classification: Classified);

    /**
     * Create a public datum (Classified.PUBLIC)
     */
    static public(category: string, key: string): ClassifiedDatum;

    /**
     * Create a setting datum (Classified.SETTING)
     */
    static setting(category: string, key: string): ClassifiedDatum;

    /**
     * Create a personal datum (Classified.PERSONAL)
     */
    static personal(category: string, key: string): ClassifiedDatum;

    /**
     * Create a credential datum (Classified.CREDENTIAL)
     */
    static credential(category: string, key: string): ClassifiedDatum;

    /**
     * Create a restricted datum (Classified.RESTRICTED)
     */
    static restricted(category: string, key: string): ClassifiedDatum;

    /**
     * Get unique identifier for this datum
     */
    id(): string;

    /**
     * Convert to plain object
     */
    toObject(): {
      category: string;
      key: string;
      classification: Classified;
    };
  }

  /**
   * Collection of classified data for batch operations
   */
  export class ClassifiedData {
    data: ClassifiedDatum[];

    constructor(data?: ClassifiedDatum[]);

    /**
     * Add a datum to the collection
     */
    add(datum: ClassifiedDatum): ClassifiedData;

    /**
     * Add multiple data to the collection
     */
    addAll(data: ClassifiedDatum[]): ClassifiedData;

    /**
     * Get all data in the collection
     */
    getAll(): ClassifiedDatum[];

    /**
     * Get data matching a filter
     */
    filter(predicate: (datum: ClassifiedDatum) => boolean): ClassifiedDatum[];

    /**
     * Get data by classification level
     */
    byClassification(classification: Classified): ClassifiedDatum[];

    /**
     * Get data by category
     */
    byCategory(category: string): ClassifiedDatum[];

    /**
     * Convert to plain object array
     */
    toArray(): Array<{
      category: string;
      key: string;
      classification: Classified;
    }>;
  }

  // ============================================================================
  // SECURE STORE
  // ============================================================================

  /**
   * Options for SecureStore initialization
   */
  export interface SecureStoreOptions {
    recorder?: Recorder;
    [key: string]: any;
  }

  /**
   * Result of a store operation
   */
  export interface StoreResult {
    success: boolean;
    error?: string;
    value?: any;
    [key: string]: any;
  }

  /**
   * Abstract base class for secure storage implementations
   */
  export abstract class SecureStore {
    recorder?: Recorder;
    initialized: boolean;

    constructor(options?: SecureStoreOptions);

    /**
     * Initialize the store
     */
    abstract initialize(): Promise<void>;

    /**
     * Get a single classified datum
     */
    get(datum: ClassifiedDatum): Promise<string | null>;

    /**
     * Get multiple classified data (batch operation)
     */
    get(data: ClassifiedData): Promise<Map<string, string | null>>;

    /**
     * Store a single classified datum
     */
    store(datum: ClassifiedDatum, value: string): Promise<StoreResult>;

    /**
     * Store multiple classified data (batch operation)
     */
    store(data: ClassifiedData, values: Map<string, string>): Promise<Map<string, StoreResult>>;

    /**
     * Clear a single classified datum
     */
    clear(datum: ClassifiedDatum): Promise<StoreResult>;

    /**
     * Clear multiple classified data (batch operation)
     */
    clear(data: ClassifiedData): Promise<Map<string, StoreResult>>;

    /**
     * Get a credential (legacy API)
     */
    getCredential(category: string, key: string): Promise<string | null>;

    /**
     * Store a credential (legacy API)
     */
    storeCredential(category: string, key: string, value: string): Promise<StoreResult>;

    /**
     * Get a configuration value (legacy API)
     */
    getConfiguration(category: string, key: string): Promise<string | null>;

    /**
     * Store a configuration value (legacy API)
     */
    storeConfiguration(category: string, key: string, value: string): Promise<StoreResult>;

    /**
     * Clear a credential (legacy API)
     */
    clearCredential(category: string, key: string): Promise<StoreResult>;

    /**
     * Clear a configuration value (legacy API)
     */
    clearConfiguration(category: string, key: string): Promise<StoreResult>;

    /**
     * Internal method to get a single datum
     */
    protected abstract _getSingle(datum: ClassifiedDatum): Promise<string | null>;

    /**
     * Internal method to store a single datum
     */
    protected abstract _storeSingle(datum: ClassifiedDatum, value: string): Promise<StoreResult>;

    /**
     * Internal method to clear a single datum
     */
    protected abstract _clearSingle(datum: ClassifiedDatum): Promise<StoreResult>;
  }

  // ============================================================================
  // MEMORY STORE
  // ============================================================================

  /**
   * Options for MemoryStore
   */
  export interface MemoryStoreOptions extends SecureStoreOptions {
    /** Default TTL in milliseconds */
    defaultTTL?: number;
    /** TTL per classification level */
    ttlByClassification?: {
      [key in Classified]?: number;
    };
  }

  /**
   * In-memory secure store with TTL support
   */
  export class MemoryStore extends SecureStore {
    private cache: Map<string, { value: string; expiresAt: number }>;
    private defaultTTL: number;
    private ttlByClassification: Map<Classified, number>;

    constructor(options?: MemoryStoreOptions);

    initialize(): Promise<void>;

    /**
     * Clear expired entries
     */
    clearExpired(): void;

    /**
     * Get all cached keys
     */
    keys(): string[];

    /**
     * Clear all cached data
     */
    clearAll(): void;

    /**
     * Get cache statistics
     */
    stats(): {
      size: number;
      expired: number;
      active: number;
    };

    protected _getSingle(datum: ClassifiedDatum): Promise<string | null>;
    protected _storeSingle(datum: ClassifiedDatum, value: string): Promise<StoreResult>;
    protected _clearSingle(datum: ClassifiedDatum): Promise<StoreResult>;
  }

  // ============================================================================
  // INFISICAL STORE
  // ============================================================================

  /**
   * Options for InfisicalStore
   */
  export interface InfisicalStoreOptions extends SecureStoreOptions {
    /** Infisical API token */
    token?: string;
    /** Infisical project ID */
    projectId?: string;
    /** Infisical API URL */
    apiUrl?: string;
    /** Environment (dev, staging, prod) */
    environment?: string;
    /** Secret path */
    secretPath?: string;
  }

  /**
   * Infisical-based secure store
   */
  export class InfisicalStore extends SecureStore {
    private token: string;
    private projectId: string;
    private apiUrl: string;
    private environment: string;
    private secretPath: string;

    constructor(options?: InfisicalStoreOptions);

    initialize(): Promise<void>;

    protected _getSingle(datum: ClassifiedDatum): Promise<string | null>;
    protected _storeSingle(datum: ClassifiedDatum, value: string): Promise<StoreResult>;
    protected _clearSingle(datum: ClassifiedDatum): Promise<StoreResult>;
  }

  // ============================================================================
  // ENVIRONMENT STORE
  // ============================================================================

  /**
   * Environment variable-based secure store (read-only)
   */
  export class EnvironmentStore extends SecureStore {
    constructor(options?: SecureStoreOptions);

    initialize(): Promise<void>;

    protected _getSingle(datum: ClassifiedDatum): Promise<string | null>;
    protected _storeSingle(datum: ClassifiedDatum, value: string): Promise<StoreResult>;
    protected _clearSingle(datum: ClassifiedDatum): Promise<StoreResult>;
  }

  // ============================================================================
  // CASCADING STORE
  // ============================================================================

  /**
   * Options for CascadingStore
   */
  export interface CascadingStoreOptions extends SecureStoreOptions {
    /** Ordered list of stores (highest priority first) */
    stores: SecureStore[];
    /** Write to primary store */
    writePrimary?: boolean;
  }

  /**
   * Cascading store with fallback chain
   */
  export class CascadingStore extends SecureStore {
    private stores: SecureStore[];
    private writePrimary: boolean;

    constructor(options: CascadingStoreOptions);

    initialize(): Promise<void>;

    protected _getSingle(datum: ClassifiedDatum): Promise<string | null>;
    protected _storeSingle(datum: ClassifiedDatum, value: string): Promise<StoreResult>;
    protected _clearSingle(datum: ClassifiedDatum): Promise<StoreResult>;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Options for Configuration
   */
  export interface ConfigurationOptions {
    /** Enable in-memory caching */
    enableCache?: boolean;
    /** Enable Infisical integration */
    enableInfisical?: boolean;
    /** Infisical configuration */
    infisical?: InfisicalStoreOptions;
    /** Custom stores */
    stores?: SecureStore[];
    /** Recorder for logging */
    recorder?: Recorder;
  }

  /**
   * Unified configuration and credential manager
   */
  export class Configuration {
    private store: SecureStore;
    private recorder?: Recorder;

    constructor(options?: ConfigurationOptions);

    /**
     * Initialize the configuration system
     */
    initialize(): Promise<void>;

    /**
     * Get a configuration value
     */
    getConfig(category: string, key: string): Promise<string | null>;

    /**
     * Store a configuration value
     */
    setConfig(category: string, key: string, value: string): Promise<StoreResult>;

    /**
     * Get a credential
     */
    getCredential(category: string, key: string): Promise<string | null>;

    /**
     * Store a credential
     */
    setCredential(category: string, key: string, value: string): Promise<StoreResult>;

    /**
     * Get a classified datum
     */
    get(datum: ClassifiedDatum): Promise<string | null>;

    /**
     * Get multiple classified data
     */
    get(data: ClassifiedData): Promise<Map<string, string | null>>;

    /**
     * Store a classified datum
     */
    store(datum: ClassifiedDatum, value: string): Promise<StoreResult>;

    /**
     * Store multiple classified data
     */
    store(data: ClassifiedData, values: Map<string, string>): Promise<Map<string, StoreResult>>;

    /**
     * Clear a classified datum
     */
    clear(datum: ClassifiedDatum): Promise<StoreResult>;

    /**
     * Clear multiple classified data
     */
    clear(data: ClassifiedData): Promise<Map<string, StoreResult>>;
  }
}
