/**
 * @rescor-llc/core-db - Core Database Module
 *
 * Unified database operations for IBM DB2 and Neo4j with support for:
 * - Generic Operations base class (DB-agnostic)
 * - DB2-specific implementation with transactions
 * - Neo4j-specific implementation with Cypher queries
 * - Connection string builder with multi-tier credential strategies
 * - Transform system for row normalization
 * - Error handling with DB2 and Neo4j error code mapping
 * - Schema-aware operations (dev/uat/prod isolation)
 *
 * @example DB2 Usage
 * import { DB2Operations, Transforms } from '@rescor-llc/core-db';
 *
 * const ops = new DB2Operations({
 *   schema: 'TCDEV',
 *   hostname: 'localhost',
 *   port: 50000,
 *   database: 'TESTDB'
 * });
 *
 * await ops.connect();
 * const results = await ops.query('SELECT * FROM TCDEV.TEST');
 * await ops.disconnect();
 *
 * @example Neo4j Usage
 * import { Neo4jOperations, Neo4jTransforms } from '@rescor-llc/core-db';
 *
 * const ops = new Neo4jOperations({
 *   schema: 'tcdev',
 *   uri: 'bolt://localhost:7687',
 *   username: 'neo4j',
 *   password: 'password'
 * });
 *
 * await ops.connect();
 * const results = await ops.query('MATCH (h:Host) RETURN h LIMIT 10');
 * await ops.disconnect();
 */

// Core Operations (DB-agnostic base class)
export { Operations } from './Operations.mjs';

// DB2-specific Operations
export { DB2Operations } from './DB2Operations.mjs';

// Neo4j-specific Operations
export { Neo4jOperations } from './Neo4jOperations.mjs';

// Connection String Builder
export { ConnectString } from './ConnectString.mjs';

// Transform System
export { Transforms, TransformColumn, TransformTypes, TransformDetails, TransformError } from './Transforms.mjs';

// Neo4j Transform System
export { Neo4jTransforms, Neo4jTransformColumn, CommonNeo4jTransforms } from './Neo4jTransforms.mjs';

// Error Handler
export { ErrorHandler, ERROR_TYPES } from './ErrorHandler.mjs';

// Neo4j Error Handler
export { Neo4jErrorHandler } from './Neo4jErrorHandler.mjs';

// Audit Proxy
export { AuditProxy, withAudit } from './AuditProxy.mjs';

// Batch Insert
export { BatchInserter } from './BatchInserter.mjs';

// Phase Management
export {
  PhaseManager,
  PHASES,
  SchemaMapper,
  SchemaProvisioner,
  PhaseLifecycle,
  LIFECYCLE_STATES,
  SchemaOrchestrator,
  SchemaPopulator,
  SchemaStatus,
  TableAttributes,
  PhasePolicy,
  PromotionPlanner,
  PromotionExecutor,
  DdlRegistry,
  DdlPlanner,
  DdlExecutor
} from './phase/index.mjs';

// Database Utilities
export {
  queryScalar,
  tableExists,
  tableHasRows,
  getPrimaryKeyColumns,
  getTablesWithColumn,
  buildInClause,
  copyTableRows,
  copyStaticTables,
  clearTables,
  computeSampleSize
} from './utilities/index.mjs';

// Database Error Classes
export {
  DatabaseError,
  NoResults,
  DuplicateRecord,
  ConnectionError,
  QueryError
} from './Operations.mjs';

/**
 * Package Information
 */
export const VERSION = '1.0.0';
export const PACKAGE_NAME = '@rescor-llc/core-db';
