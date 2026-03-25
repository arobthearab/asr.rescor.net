/**
 * @rescor/core-utils TypeScript Definitions
 *
 * Type definitions for utility classes and helpers.
 */

declare module '@rescor/core-utils' {
  import { Readable } from 'stream';

  // ============================================================================
  // RECORDER
  // ============================================================================

  /**
   * Log levels
   */
  export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

  /**
   * Event severity codes
   */
  export type SeverityCode = 'd' | 'i' | 'w' | 'e';

  /**
   * Event code format
   */
  export type EventCodeFormat = '4-digit' | '6-digit';

  /**
   * Log entry structure
   */
  export interface LogEntry {
    timestamp: string;
    eventCode: number;
    severity: SeverityCode;
    message: string;
    data?: any;
    formatted: string;
  }

  /**
   * Options for Recorder initialization
   */
  export interface RecorderOptions {
    /** Minimum log level to record */
    logLevel?: LogLevel;
    /** Event code format (4-digit or 6-digit) */
    eventCodeFormat?: EventCodeFormat;
    /** Output file path */
    outputFile?: string;
    /** Write to console */
    console?: boolean;
    /** Include timestamp in output */
    includeTimestamp?: boolean;
    /** Custom timestamp format */
    timestampFormat?: string;
  }

  /**
   * Event logging and recording system
   */
  export class Recorder {
    private logLevel: LogLevel;
    private eventCodeFormat: EventCodeFormat;
    private outputFile?: string;
    private writeToConsole: boolean;
    private includeTimestamp: boolean;
    private timestampFormat: string;
    private stream?: any;
    private buffer: LogEntry[];

    constructor(options?: RecorderOptions);

    /**
     * Emit a log event
     *
     * @param eventCode - Numeric event code
     * @param severity - Severity level ('d', 'i', 'w', 'e')
     * @param message - Log message
     * @param data - Additional context data
     */
    emit(eventCode: number, severity: SeverityCode, message: string, data?: any): void;

    /**
     * Log a debug message
     */
    debug(eventCode: number, message: string, data?: any): void;

    /**
     * Log an info message
     */
    info(eventCode: number, message: string, data?: any): void;

    /**
     * Log a warning message
     */
    warning(eventCode: number, message: string, data?: any): void;

    /**
     * Log an error message
     */
    error(eventCode: number, message: string, data?: any): void;

    /**
     * Set the log level
     */
    setLogLevel(level: LogLevel): void;

    /**
     * Get current log level
     */
    getLogLevel(): LogLevel;

    /**
     * Get buffered log entries
     */
    getBuffer(): LogEntry[];

    /**
     * Clear the log buffer
     */
    clearBuffer(): void;

    /**
     * Flush buffered logs to file
     */
    flush(): Promise<void>;

    /**
     * Close the recorder and release resources
     */
    close(): void;

    /**
     * Format a log entry
     */
    private formatEntry(entry: LogEntry): string;

    /**
     * Check if severity level should be logged
     */
    private shouldLog(severity: SeverityCode): boolean;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Collection of utility functions
   */
  export class Utilities {
    /**
     * Generate a unique ID
     */
    static generateId(prefix?: string): string;

    /**
     * Deep clone an object
     */
    static deepClone<T>(obj: T): T;

    /**
     * Deep merge two objects
     */
    static deepMerge<T extends object>(target: T, source: Partial<T>): T;

    /**
     * Sleep for a specified duration
     *
     * @param ms - Milliseconds to sleep
     */
    static sleep(ms: number): Promise<void>;

    /**
     * Retry an operation with exponential backoff
     *
     * @param operation - Function to retry
     * @param options - Retry options
     */
    static retry<T>(
      operation: () => Promise<T>,
      options?: {
        maxAttempts?: number;
        backoffMs?: number;
        maxBackoffMs?: number;
        onRetry?: (attempt: number, error: Error) => void;
      }
    ): Promise<T>;

    /**
     * Format bytes to human-readable string
     */
    static formatBytes(bytes: number, decimals?: number): string;

    /**
     * Format duration in milliseconds to human-readable string
     */
    static formatDuration(ms: number): string;

    /**
     * Parse boolean from various inputs
     */
    static parseBoolean(value: any): boolean;

    /**
     * Check if a value is empty (null, undefined, empty string, empty array, empty object)
     */
    static isEmpty(value: any): boolean;

    /**
     * Sanitize a string for SQL (basic protection against SQL injection)
     */
    static sanitizeSQL(input: string): string;

    /**
     * Truncate a string to a maximum length
     */
    static truncate(str: string, maxLength: number, suffix?: string): string;

    /**
     * Convert camelCase to snake_case
     */
    static camelToSnake(str: string): string;

    /**
     * Convert snake_case to camelCase
     */
    static snakeToCamel(str: string): string;

    /**
     * Hash a string using SHA-256
     */
    static hash(input: string, algorithm?: string): string;

    /**
     * Generate a random string
     */
    static randomString(length: number, charset?: string): string;

    /**
     * Validate email format
     */
    static isValidEmail(email: string): boolean;

    /**
     * Validate URL format
     */
    static isValidURL(url: string): boolean;

    /**
     * Get environment variable with optional default
     */
    static getEnv(key: string, defaultValue?: string): string | undefined;

    /**
     * Get required environment variable (throws if not set)
     */
    static requireEnv(key: string): string;

    /**
     * Chunk an array into smaller arrays
     */
    static chunk<T>(array: T[], size: number): T[][];

    /**
     * Debounce a function
     */
    static debounce<T extends (...args: any[]) => any>(
      func: T,
      wait: number
    ): (...args: Parameters<T>) => void;

    /**
     * Throttle a function
     */
    static throttle<T extends (...args: any[]) => any>(
      func: T,
      limit: number
    ): (...args: Parameters<T>) => void;
  }

  // ============================================================================
  // UPLOAD OBJECT
  // ============================================================================

  /**
   * File information
   */
  export interface FileInfo {
    /** Original file name */
    originalName: string;
    /** MIME type */
    mimeType: string;
    /** File size in bytes */
    size: number;
    /** File extension */
    extension: string;
    /** Encoding */
    encoding?: string;
  }

  /**
   * Options for UploadObject
   */
  export interface UploadObjectOptions {
    /** Maximum file size in bytes */
    maxSize?: number;
    /** Allowed MIME types */
    allowedTypes?: string[];
    /** Allowed file extensions */
    allowedExtensions?: string[];
    /** Storage location */
    storageLocation?: string;
    /** Recorder for logging */
    recorder?: Recorder;
  }

  /**
   * Upload result
   */
  export interface UploadResult {
    success: boolean;
    filePath?: string;
    error?: string;
    fileInfo?: FileInfo;
  }

  /**
   * File upload handling utility (migrated from callback to Promise API)
   */
  export class UploadObject {
    private maxSize: number;
    private allowedTypes: Set<string>;
    private allowedExtensions: Set<string>;
    private storageLocation: string;
    private recorder?: Recorder;

    constructor(options?: UploadObjectOptions);

    /**
     * Validate file metadata
     */
    validate(fileInfo: FileInfo): { valid: boolean; error?: string };

    /**
     * Upload a file from buffer
     */
    uploadFromBuffer(buffer: Buffer, fileInfo: FileInfo): Promise<UploadResult>;

    /**
     * Upload a file from stream
     */
    uploadFromStream(stream: Readable, fileInfo: FileInfo): Promise<UploadResult>;

    /**
     * Upload a file from path
     */
    uploadFromPath(sourcePath: string, fileInfo?: Partial<FileInfo>): Promise<UploadResult>;

    /**
     * Delete an uploaded file
     */
    delete(filePath: string): Promise<{ success: boolean; error?: string }>;

    /**
     * Get file information
     */
    getFileInfo(filePath: string): Promise<FileInfo | null>;

    /**
     * Check if file exists
     */
    exists(filePath: string): Promise<boolean>;

    /**
     * Generate a safe filename
     */
    generateSafeFilename(originalName: string, addTimestamp?: boolean): string;

    /**
     * Get MIME type from file extension
     */
    static getMimeType(extension: string): string;

    /**
     * Get file extension from filename
     */
    static getExtension(filename: string): string;

    /**
     * Sanitize filename (remove dangerous characters)
     */
    static sanitizeFilename(filename: string): string;
  }

  // ============================================================================
  // VITAL SIGNS
  // ============================================================================

  export type VitalState =
    | 'success'
    | 'skip'
    | 'soft-fail'
    | 'hard-fail'
    | 'retry'
    | 'force';

  export interface VitalStep {
    service: string;
    action: string;
    requiredServices?: string[];
    optionalServices?: string[];
    required?: string[];
    optional?: string[];
    manifestApp?: string;
    [key: string]: any;
  }

  export interface VitalResult {
    service: string;
    action: string;
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    state: VitalState;
    message?: string;
    data?: any;
    metadata?: Record<string, any>;
  }

  export interface VitalActionResponse {
    state?: VitalState;
    delayMs?: number;
    message?: string;
    data?: any;
    metadata?: Record<string, any>;
  }

  export interface VitalActionContext {
    sign: VitalSign;
    step: VitalStep;
    actionName: string;
    attempt: number;
    startedAt: number;
    deadline: number;
    remainingTotalMs: number;
    signal?: AbortSignal;
    options: VitalRunOptions;
    results: VitalResult[];
  }

  export type VitalAction = (context: VitalActionContext) => Promise<VitalActionResponse | VitalState | boolean | void>;

  export interface VitalSignOptions {
    check?: VitalAction;
    start?: VitalAction;
    stop?: VitalAction;
    force?: VitalAction;
    actions?: Record<string, VitalAction>;
    metadata?: Record<string, any>;
  }

  export class VitalSign {
    name: string;
    metadata: Record<string, any>;
    actions: Record<string, VitalAction | null>;

    constructor(name: string, options?: VitalSignOptions);

    getAction(actionName: string): VitalAction | null;
  }

  export interface VitalRunOptions {
    totalTimeoutMs?: number;
    actionTimeoutMs?: number;
    maxTransitions?: number;
    failFast?: boolean;
    appAction?: string;
    includeApplication?: boolean;
    signal?: AbortSignal;
    [key: string]: any;
  }

  export interface VitalManifest {
    required?: string[];
    optional?: string[];
  }

  export interface VitalCommandSpec {
    command: string;
    args?: string[];
  }

  export interface SystemdServiceSignOptions {
    name: string;
    unit?: string;
    systemctlCommand?: string;
    retryDelayMs?: number;
    cwd?: string;
    runner?: (command: string, args: string[], options?: any) => Promise<{ code: number | null; stdout: string; stderr: string }>;
  }

  export interface ProcessServiceSignOptions {
    name: string;
    startCommand?: string | VitalCommandSpec;
    stopCommand?: string | VitalCommandSpec;
    forceCommand?: string | VitalCommandSpec;
    checkCommand?: string | VitalCommandSpec;
    host?: string;
    port?: number;
    checkTimeoutMs?: number;
    retryDelayMs?: number;
    cwd?: string;
    runner?: (command: string, args: string[], options?: any) => Promise<{ code: number | null; stdout: string; stderr: string }>;
    checkReachable?: (options: { host: string; port: number; timeoutMs?: number }) => Promise<boolean>;
  }

  export interface RuntimeServiceSignOptions extends ProcessServiceSignOptions, SystemdServiceSignOptions {
    runtime: 'systemd' | 'docker-compose' | 'process';
  }

  export type VitalServiceRegistryState =
    | 'UNKNOWN'
    | 'HUNG'
    | 'STARTING'
    | 'STARTED'
    | 'STOPPING'
    | 'STOPPED'
    | 'FORCED';

  export interface VitalServiceStateEntry {
    state: VitalServiceRegistryState;
    updatedAt: number | null;
    lastAction: string | null;
    message: string | null;
    details: Record<string, any>;
  }

  export type VitalRegistryEventType =
    | 'service-state-changed'
    | 'step-started'
    | 'step-completed';

  export interface VitalRegistryEvent {
    type: VitalRegistryEventType;
    service?: string;
    step?: any;
    previous?: VitalServiceStateEntry;
    current?: VitalServiceStateEntry;
  }

  export interface VitalRunSummary {
    success: boolean;
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    transitions: number;
    results: VitalResult[];
  }

  export class VitalSigns {
    constructor(options?: {
      signs?: VitalSign[];
      plans?: Record<string, VitalStep[]>;
      manifests?: Record<string, VitalManifest>;
      defaults?: VitalRunOptions;
    });

    register(sign: VitalSign): this;
    registerManifest(appName: string, manifest?: VitalManifest): this;
    getManifest(appName: string): VitalManifest | null;
    listManifests(): Record<string, VitalManifest>;
    getServiceState(serviceName: string): VitalServiceStateEntry | null;
    listServiceStates(): Record<string, VitalServiceStateEntry>;
    subscribe(handler: (event: VitalRegistryEvent) => void): () => void;
    run(planOrName: string | VitalStep[], options?: VitalRunOptions): Promise<VitalRunSummary>;
    runManifest(appName: string, options?: VitalRunOptions): Promise<VitalRunSummary>;
    check(options?: VitalRunOptions): Promise<VitalRunSummary>;
    start(options?: VitalRunOptions): Promise<VitalRunSummary>;
    stop(options?: VitalRunOptions): Promise<VitalRunSummary>;
    force(options?: VitalRunOptions): Promise<VitalRunSummary>;
  }

  export function createSystemdServiceSign(options: SystemdServiceSignOptions): VitalSign;
  export function createProcessServiceSign(options: ProcessServiceSignOptions): VitalSign;
  export function createRuntimeServiceSign(options: RuntimeServiceSignOptions): VitalSign;

  export class VitalSignsError extends Error {
    constructor(message: string, code?: string | number | null, metadata?: Record<string, any>, originalError?: Error | null);
  }

  export class VitalSignsLoopGuardError extends VitalSignsError {}
  export class VitalSignsActionError extends VitalSignsError {}
  export class VitalSignsAbortedError extends VitalSignsError {}
  export class VitalSignsActionTimeoutError extends Error {}
  export class VitalSignsTimeoutError extends Error {}

  // ============================================================================
  // EXPORTS
  // ============================================================================

  export { Recorder, Utilities, UploadObject, VitalSign, VitalSigns };
  export type {
    LogLevel,
    SeverityCode,
    EventCodeFormat,
    LogEntry,
    RecorderOptions,
    FileInfo,
    UploadObjectOptions,
    UploadResult,
    VitalState,
    VitalStep,
    VitalResult,
    VitalActionResponse,
    VitalActionContext,
    VitalAction,
    VitalSignOptions,
    VitalRunOptions,
    VitalRunSummary
  };
}
