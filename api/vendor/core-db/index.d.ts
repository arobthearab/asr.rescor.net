/**
 * @rescor/core-db TypeScript Definitions
 *
 * Type definitions for the database operations and phase management package.
 */

declare module '@rescor/core-db' {
  import { Recorder } from '@rescor/core-utils';
  import { Configuration } from '@rescor/core-config';

  // ============================================================================
  // TYPES AND ENUMS
  // ============================================================================

  /**
   * Supported data types for transforms
   */
  export type TransformType =
    | 'int'
    | 'float'
    | 'bool'
    | 'date'
    | 'json'
    | 'string'
    | 'timestamp';

  /**
   * Transform definition for a single field
   */
  export interface TransformDefinition {
    /** Target data type */
    type?: TransformType;
    /** New column name (for renaming) */
    newName?: string;
    /** Custom transform function */
    transform?: (value: any) => any;
  }

  /**
   * Database connection options
   */
  export interface ConnectionOptions {
    hostname?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    schema?: string;
    sslEnabled?: boolean;
    connectionTimeout?: number;
  }

  /**
   * Transaction isolation levels
   */
  export enum IsolationLevel {
    READ_UNCOMMITTED = 'READ UNCOMMITTED',
    READ_COMMITTED = 'READ COMMITTED',
    REPEATABLE_READ = 'REPEATABLE READ',
    SERIALIZABLE = 'SERIALIZABLE'
  }

  /**
   * Phase enumeration
   */
  export enum Phase {
    DEVELOPMENT = 'DEV',
    UAT = 'UAT',
    PRODUCTION = 'PROD'
  }

  // ============================================================================
  // TRANSFORMS
  // ============================================================================

  /**
   * Transforms system for row data normalization
   */
  export class Transforms {
    private transforms: Map<string, TransformDefinition>;

    constructor();

    /**
     * Add a transform for a field
     */
    add(fieldName: string, definition: TransformDefinition): Transforms;

    /**
     * Add multiple transforms
     */
    addAll(transforms: Record<string, TransformDefinition>): Transforms;

    /**
     * Get transform for a field
     */
    get(fieldName: string): TransformDefinition | undefined;

    /**
     * Check if a field has a transform
     */
    has(fieldName: string): boolean;

    /**
     * Get all transforms
     */
    getAll(): Map<string, TransformDefinition>;

    /**
     * Apply transforms to a single row
     */
    apply(row: Record<string, any>): Record<string, any>;

    /**
     * Apply transforms to multiple rows
     */
    applyMany(rows: Array<Record<string, any>>): Array<Record<string, any>>;

    /**
     * Remove a transform
     */
    remove(fieldName: string): boolean;

    /**
     * Clear all transforms
     */
    clear(): void;
  }

  // ============================================================================
  // DATABASE OPERATIONS
  // ============================================================================

  /**
   * Options for DB2Operations
   */
  export interface DB2OperationsOptions {
    /** Database schema */
    schema: string;
    /** Configuration instance */
    config?: Configuration;
    /** Recorder for logging */
    recorder?: Recorder;
    /** Connection options (if not using Configuration) */
    connection?: ConnectionOptions;
  }

  /**
   * Core database operations class for DB2
   */
  export class DB2Operations {
    schema: string;
    isConnected: boolean;
    protected config?: Configuration;
    protected recorder?: Recorder;
    protected connection: any;

    constructor(options: DB2OperationsOptions);

    /**
     * Connect to the database
     */
    connect(): Promise<void>;

    /**
     * Disconnect from the database
     */
    disconnect(): Promise<void>;

    /**
     * Execute a SQL query
     */
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;

    /**
     * Execute a transaction
     */
    transaction<T = any>(
      callback: (ops: DB2Operations) => Promise<T>,
      options?: { isolationLevel?: IsolationLevel }
    ): Promise<T>;

    /**
     * Begin a transaction manually
     */
    beginTransaction(options?: { isolationLevel?: IsolationLevel }): Promise<void>;

    /**
     * Commit a transaction
     */
    commit(): Promise<void>;

    /**
     * Rollback a transaction
     */
    rollback(): Promise<void>;

    /**
     * Execute SQL from a file
     */
    executeSQLFile(filePath: string, params?: any[]): Promise<void>;

    /**
     * Check if a table exists
     */
    tableExists(tableName: string): Promise<boolean>;

    /**
     * Get table row count
     */
    getRowCount(tableName: string, whereClause?: string): Promise<number>;

    /**
     * Truncate a table
     */
    truncateTable(tableName: string): Promise<void>;

    /**
     * Drop a table
     */
    dropTable(tableName: string, ifExists?: boolean): Promise<void>;

    /**
     * Create a table from DDL
     */
    createTable(tableName: string, ddl: string): Promise<void>;

    /**
     * Massage query results with transforms
     */
    static MassageResults<T = any>(
      results: Array<Record<string, any>>,
      transforms: Transforms
    ): T[];
  }

  // ============================================================================
  // OPERATIONS (Generic Base Class)
  // ============================================================================

  /**
   * Generic base class for database operations
   * Extend this class for project-specific operations
   */
  export class Operations extends DB2Operations {
    constructor(options: DB2OperationsOptions);
  }

  // ============================================================================
  // PHASE MANAGEMENT
  // ============================================================================

  /**
   * Options for PhaseManager
   */
  export interface PhaseManagerOptions {
    /** Recorder for logging */
    recorder?: Recorder;
    /** Override phase detection */
    forcePhase?: Phase;
  }

  /**
   * Phase determination and management
   */
  export class PhaseManager {
    private recorder?: Recorder;
    private forcePhase?: Phase;
    private detectedPhase?: Phase;

    constructor(options?: PhaseManagerOptions);

    /**
     * Determine the current phase (DEV, UAT, PROD)
     */
    determinePhase(): Promise<Phase>;

    /**
     * Get the detected phase
     */
    getPhase(): Phase | undefined;

    /**
     * Check if current phase is development
     */
    isDevelopment(): boolean;

    /**
     * Check if current phase is UAT
     */
    isUAT(): boolean;

    /**
     * Check if current phase is production
     */
    isProduction(): boolean;

    /**
     * Get schema name for current phase
     */
    getSchemaForPhase(baseSchema: string): string;
  }

  // ============================================================================
  // SCHEMA MANAGEMENT
  // ============================================================================

  /**
   * Schema mapping between phases and schemas
   */
  export class SchemaMapper {
    private mappings: Map<Phase, string>;

    constructor();

    /**
     * Map a phase to a schema
     */
    map(phase: Phase, schema: string): SchemaMapper;

    /**
     * Get schema for a phase
     */
    getSchema(phase: Phase): string | undefined;

    /**
     * Get phase for a schema
     */
    getPhase(schema: string): Phase | undefined;

    /**
     * Get all mappings
     */
    getMappings(): Map<Phase, string>;
  }

  /**
   * Options for SchemaProvisioner
   */
  export interface SchemaProvisionerOptions {
    database: DB2Operations;
    recorder?: Recorder;
  }

  /**
   * SQL execution for schema provisioning
   */
  export class SchemaProvisioner {
    private database: DB2Operations;
    private recorder?: Recorder;

    constructor(options: SchemaProvisionerOptions);

    /**
     * Create a schema
     */
    createSchema(schemaName: string): Promise<void>;

    /**
     * Drop a schema
     */
    dropSchema(schemaName: string, cascade?: boolean): Promise<void>;

    /**
     * Execute DDL file
     */
    executeDDL(filePath: string): Promise<void>;

    /**
     * Execute multiple DDL files
     */
    executeDDLBatch(filePaths: string[]): Promise<void>;

    /**
     * Check if schema exists
     */
    schemaExists(schemaName: string): Promise<boolean>;
  }

  // ============================================================================
  // PHASE LIFECYCLE
  // ============================================================================

  /**
   * Lifecycle states
   */
  export enum LifecycleState {
    INITIATE = 'INITIATE',
    POPULATE = 'POPULATE',
    BACKUP = 'BACKUP',
    RESET = 'RESET',
    HARD_RESET = 'HARD_RESET'
  }

  /**
   * Options for lifecycle operations
   */
  export interface LifecycleOptions {
    /** DDL files to execute */
    ddlFiles?: string[];
    /** Data files to load */
    dataFiles?: string[];
    /** Backup location */
    backupLocation?: string;
    /** Force operation even if risky */
    force?: boolean;
  }

  /**
   * Options for PhaseLifecycle
   */
  export interface PhaseLifecycleOptions {
    database: DB2Operations;
    schemaMapper: SchemaMapper;
    recorder?: Recorder;
  }

  /**
   * 5-state lifecycle management: Initiate → Populate → Backup → Reset → Hard Reset
   */
  export class PhaseLifecycle {
    private database: DB2Operations;
    private schemaMapper: SchemaMapper;
    private recorder?: Recorder;
    private currentState?: LifecycleState;

    constructor(options: PhaseLifecycleOptions);

    /**
     * Initiate: Create schema and execute DDL
     */
    initiate(options: LifecycleOptions): Promise<void>;

    /**
     * Populate: Load initial data
     */
    populate(options: LifecycleOptions): Promise<void>;

    /**
     * Backup: Create backup of current data
     */
    backup(options: LifecycleOptions): Promise<void>;

    /**
     * Reset: Restore from backup
     */
    reset(options: LifecycleOptions): Promise<void>;

    /**
     * Hard Reset: Drop and recreate schema
     */
    hardReset(options: LifecycleOptions): Promise<void>;

    /**
     * Get current lifecycle state
     */
    getState(): LifecycleState | undefined;
  }

  /**
   * Options for SchemaOrchestrator
   */
  export interface SchemaOrchestratorOptions {
    database: DB2Operations;
    phaseManager: PhaseManager;
    schemaMapper: SchemaMapper;
    recorder?: Recorder;
  }

  /**
   * High-level workflow orchestration (renamed from SchemaBuildout)
   */
  export class SchemaOrchestrator {
    private database: DB2Operations;
    private phaseManager: PhaseManager;
    private schemaMapper: SchemaMapper;
    private lifecycle: PhaseLifecycle;
    private recorder?: Recorder;

    constructor(options: SchemaOrchestratorOptions);

    /**
     * Execute complete schema buildout workflow
     */
    buildout(options: LifecycleOptions): Promise<void>;

    /**
     * Refresh schema (backup → reset)
     */
    refresh(options: LifecycleOptions): Promise<void>;

    /**
     * Tear down schema completely
     */
    teardown(options?: LifecycleOptions): Promise<void>;
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  export {
    Transforms,
    DB2Operations,
    Operations,
    PhaseManager,
    SchemaMapper,
    SchemaProvisioner,
    PhaseLifecycle,
    SchemaOrchestrator,
    Phase,
    IsolationLevel,
    LifecycleState
  };
}
