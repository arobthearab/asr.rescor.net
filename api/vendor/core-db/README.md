# @rescor/core-db

> Unified database operations for IBM DB2 and Neo4j with sophisticated schema lifecycle management and graph database transformations

**Version**: 1.0.0
**License**: UNLICENSED (Private)
**Node**: ≥ 18.0.0

## Features

### DB2 Features
- 🗄️ **DB2 Operations**: Complete IBM DB2 integration with connection management, queries, transactions
- 🔄 **Transforms System**: Sophisticated row transformation with type conversions, renaming, custom functions
- 🚀 **Batch Inserts**: High-throughput bulk loading via `insertMany()` (25K+ rows/sec) and streaming `BatchInserter`
- 📊 **Phase Management**: Development/UAT/Production environment detection and lifecycle workflows
- 🔧 **Schema Lifecycle**: 5-state lifecycle (Initiate → Populate → Backup → Reset → Hard Reset)
- 🛠️ **Database Utilities**: 10 common utilities (queryScalar, tableExists, copyTableRows, etc.)
- 📦 **SchemaPopulator**: Generic DEV/UAT/PROD schema population with statistical sampling

### Neo4j Features
- 🕸️ **Neo4j Operations**: Complete Neo4j graph database integration with Bolt protocol support
- 🔀 **Graph Transforms**: Neo4j-specific transforms (Node, Relationship, Path → JavaScript objects)
- 🗺️ **Path Queries**: Variable length paths, shortest path algorithms, graph traversals
- 🔗 **Relationships**: First-class relationship support with properties and bidirectional patterns
- 📊 **Cypher Queries**: Full Cypher query language support with parameterization
- 🔄 **Transactions**: Automatic commit/rollback with transaction callbacks

### Shared Features
- 🔐 **Secure Connections**: Multi-tier credential loading (config → file → environment)
- 🎯 **Type-Safe**: Full JSDoc annotations with intelligent type conversions
- ⚡ **Performance**: Connection pooling, prepared statements, optimized transforms
- 📝 **Audit Logging**: Comprehensive event logging via Recorder integration
- 🛡️ **Error Handling**: DB-specific error mapping with sensitive data masking

## Installation

```bash
# From workspace root
npm install

# The package is part of the @rescor monorepo workspace
# It is automatically linked to other @rescor packages
```

## Quick Start

### Basic Database Operations

```javascript
import { DB2Operations } from '@rescor/core-db';
import { Configuration } from '@rescor/core-config';
import { Recorder } from '@rescor/core-utils';

// Create recorder for logging
const recorder = new Recorder({ logLevel: 'info' });

// Create operations instance
const operations = new DB2Operations({
  schema: 'TCDEV',
  recorder
});

// Connect to database
await operations.connect();

// Execute query
const results = await operations.query(`
  SELECT * FROM TCDEV.USERS WHERE STATUS = ?
`, ['active']);

console.log(results);

// Disconnect
await operations.disconnect();
```

### Row Transformations

```javascript
import { DB2Operations } from '@rescor/core-db';
import { Transforms, CommonTransforms } from '@rescor/core-db';

// Create transforms
const transforms = new Transforms()
  .add('id', { type: 'int' })
  .add('created_at', { type: 'date' })
  .add('metadata', { type: 'json' })
  .add('is_active', { type: 'bool', newName: 'active' })
  .add('user_name', { from: 'USERNAME' });

// Create operations with transforms
const operations = new DB2Operations({
  schema: 'TCDEV',
  transforms
});

await operations.connect();

// Query returns DB2 uppercase columns
const results = await operations.query(`
  SELECT ID, USERNAME, CREATED_AT, IS_ACTIVE, METADATA
  FROM TCDEV.USERS
`);

// Apply transforms
const normalized = Operations.MassageResults(results, transforms);

console.log(normalized[0]);
// {
//   id: 123,                              // Integer (was string)
//   user_name: 'alice',                   // Mapped from USERNAME
//   created_at: Date('2024-01-01'),       // Date object
//   active: true,                         // Boolean (was '1')
//   metadata: { role: 'admin' }           // Parsed JSON
// }
```

### Schema Lifecycle Management

```javascript
import { DB2Operations } from '@rescor/core-db';
import { SchemaProvisioner, PhaseLifecycle } from '@rescor/core-db/phase';

const operations = new DB2Operations({ schema: 'TCDEV' });
await operations.connect();

const provisioner = new SchemaProvisioner(operations);
const lifecycle = new PhaseLifecycle(provisioner, 'TCDEV');

// 1. Initiate: Create schema and tables
await lifecycle.initiate({
  ddlFiles: ['sql/tables.sql', 'sql/indexes.sql']
});

// 2. Populate: Load test data
await lifecycle.populate({
  dataFiles: ['sql/seed-data.sql']
});

// 3. Backup: Create backup schema
await lifecycle.backup();

// 4. Reset: Drop and recreate from backup
await lifecycle.reset({
  ddlFiles: ['sql/tables.sql'],
  dataFiles: ['sql/seed-data.sql']
});

// 5. Hard Reset: Complete destruction (requires confirmation)
await lifecycle.hardReset({
  ddlFiles: ['sql/tables.sql'],
  dataFiles: ['sql/seed-data.sql'],
  confirm: true  // Required for safety
});
```

### Transactions

```javascript
// Manual transaction management
await operations.beginTransaction();

try {
  await operations.query('INSERT INTO USERS ...');
  await operations.query('UPDATE ACCOUNTS ...');
  await operations.commit();
} catch (err) {
  await operations.rollback();
  throw err;
}

// Or use transaction helper (automatic rollback on error)
const result = await operations.transaction(async () => {
  await operations.query('INSERT INTO USERS ...');
  await operations.query('UPDATE ACCOUNTS ...');
  return { success: true };
});
```

### Bulk Data Loading

Two APIs for high-throughput inserts — both use chunked multi-row `INSERT` statements
(500 rows/chunk by default) and hit **25K+ rows/sec** on DB2.

#### `insertMany` — materialized rows

Use when the full row set fits comfortably in memory:

```javascript
import { DB2Operations } from '@rescor/core-db';

const operations = new DB2Operations({ schema: 'TCDEV' });
await operations.connect();

const columns = ['TEST_ID', 'HOST_ID', 'SEVERITY', 'LABEL'];
const rows = findings.map(f => [f.testId, f.hostId, f.severity, f.label]);

// Auto-qualifies to TCDEV.FINDING
const inserted = await operations.insertMany('FINDING', columns, rows);
console.log(`${inserted} rows inserted`);

// Pre-qualified name works too (e.g. session temp tables)
await operations.insertMany('SESSION.BENCH_FINDING', columns, rows);

// Wrap in a transaction for atomicity
await operations.transaction(() =>
  operations.insertMany('FINDING', columns, rows)
);
```

#### `BatchInserter` — streaming / generator loop

Use when rows come from a generator or async iterator and materializing the
full array would exhaust memory (e.g. 88K+ findings ingest worker):

```javascript
import { DB2Operations, BatchInserter } from '@rescor/core-db';

const operations = new DB2Operations({ schema: 'TCDEV' });
await operations.connect();

const columns = ['TEST_ID', 'HOST_ID', 'SEVERITY', 'LABEL'];
const batcher = new BatchInserter(operations, 'FINDING', columns, { chunkSize: 500 });

for await (const finding of findingsGenerator) {
  await batcher.add([finding.testId, finding.hostId, finding.severity, finding.label]);
  // auto-flushes to DB2 every 500 rows — memory stays constant
}

const { rowsInserted, chunksExecuted } = await batcher.close();
console.log(`${rowsInserted} rows in ${chunksExecuted} chunks`);
```

`BatchInserter` is a standalone object; it delegates each chunk to `insertMany()`
internally and is safe to use alongside other queries on the same `operations`
instance.

---

### Phase Management

```javascript
import { PhaseManager, PHASES } from '@rescor/core-db/phase';

// Create phase manager
const phaseManager = new PhaseManager({
  explicitPhase: 'development',  // Or detect from environment
  recorder
});

// Get phase configuration
const config = phaseManager.getPhaseConfig();

console.log(config);
// {
//   phase: 'development',
//   isDevelopment: true,
//   isUAT: false,
//   isProduction: false,
//   allowDebug: true,
//   allowReset: true,
//   requireApproval: false
// }

// Conditional logic based on phase
if (phaseManager.isProduction()) {
  console.log('Running in production mode');
  // Disable debug features
} else {
  console.log('Running in development mode');
  // Enable debug features
}
```

### Promotion Planning (DEV → TEST/UAT → PROD)

For programmatic control-plane transitions, use `PhasePolicy`, `PromotionPlanner`, and `PromotionExecutor`.

```javascript
import {
  PhasePolicy,
  PromotionPlanner,
  PromotionExecutor
} from '@rescor/core-db';

const policy = new PhasePolicy({
  sequence: ['development', 'uat', 'production'],
  gates: {
    'uat->production': {
      requireApproval: true,
      requireTicket: false,
      requireCleanStatus: true,
      notes: 'Manual approval required before PROD cutover'
    }
  }
});

const planner = new PromotionPlanner({ policy });

// DEV -> TEST/UAT
const devToTestPlan = planner.planPromotion('development', { dryRun: true });

const executor = new PromotionExecutor({
  stateAdapter: {
    async setCurrentPhase(nextPhase) {
      // persist to your control-plane store/config provider
      console.log('Persist current phase:', nextPhase);
    }
  }
});

// Execute promotion (non-dry)
await executor.execute(devToTestPlan, { dryRun: false });

// TEST/UAT -> PROD requires approval token by policy
const testToProdPlan = planner.planPromotion('uat', { dryRun: false });
await executor.execute(testToProdPlan, {
  dryRun: false,
  approvalToken: 'approved-change-token'
});
```

For operational CLI usage of this same model, use `rescor phase ...` commands from `@rescor/core-cli`.

### Database Utilities

Common database utility functions for DB2 operations.

```javascript
import {
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
} from '@rescor/core-db';

// Query single value
const count = await queryScalar(dbHandle, 'SELECT COUNT(*) FROM TCDEV.USERS');
console.log(count); // 42

// Check if table exists
const exists = await tableExists(dbHandle, 'TCDEV', 'USERS');
console.log(exists); // true

// Check if table has data
const hasData = await tableHasRows(dbHandle, 'TCDEV', 'USERS');
console.log(hasData); // true

// Get primary key columns
const pkColumns = await getPrimaryKeyColumns(dbHandle, 'TCDEV', 'USERS');
console.log(pkColumns); // ['ID']

// Find tables with specific column
const tables = await getTablesWithColumn(dbHandle, 'TCDEV', 'USER_ID');
console.log(tables); // ['ORDERS', 'SESSIONS', 'AUDIT_LOG']

// Build IN clause with chunking (handles large arrays)
const userIds = [1, 2, 3, 4, 5, /* ... 1000 more ... */];
const { clause, params } = buildInClause('USER_ID', userIds, 500);
// clause: "USER_ID IN (?, ?, ..., ?) OR USER_ID IN (?, ?, ..., ?)"
// params: [1, 2, ..., 500, 501, ..., 1000]

// Copy rows between schemas
await copyTableRows({
  dbHandle,
  sourceSchema: 'TC',
  targetSchema: 'TCDEV',
  table: 'USERS',
  whereClause: 'STATUS = ?',
  whereParams: ['active']
});

// Copy static/reference tables
const results = await copyStaticTables(
  dbHandle,
  'TC',              // Source schema
  'TCDEV',           // Target schema
  ['CONTROL_TYPE', 'HORIZON', 'CONFIG'],  // Tables to copy
  { requireSource: false }  // Skip if source missing
);
// Returns: [
//   { table: 'CONTROL_TYPE', copied: 15, skipped: false },
//   { table: 'HORIZON', copied: 3, skipped: false },
//   { table: 'CONFIG', copied: 0, skipped: true, reason: 'target-not-empty' }
// ]

// Clear tables (DELETE all rows)
await clearTables(dbHandle, 'TCDEV', ['SESSIONS', 'TEMP_DATA']);

// Calculate statistical sample size (Cochran's formula)
const totalRecords = 10000;
const sampleSize = computeSampleSize(totalRecords, {
  z: 1.96,        // 95% confidence interval
  p: 0.5,         // 50% proportion (maximum variability)
  e: 0.05,        // 5% margin of error
  minSample: 30   // Minimum sample size
});
console.log(sampleSize); // ~370 (statistically significant sample)
```

### SchemaPopulator

Generic schema population workflow for DEV/UAT/PROD environments.

```javascript
import { SchemaPopulator } from '@rescor/core-db';

// Define project configuration
const config = {
  project: 'TC',
  productionSchema: 'TC',
  tables: {
    core: ['TEST', 'HOST', 'FINDING', 'ANNOTATION'],
    static: ['CONTROL_TYPE', 'HORIZON']
  },
  relationships: {
    'FINDING': { column: 'TEST_ID', idColumn: 'ID' },
    'HOST': { column: 'TEST_ID', idColumn: 'ID' },
    'ANNOTATION': { column: 'FINDING_ID', idColumn: 'ID' }
  },
  dataGenerator: {
    generateAll: async (dbHandle, schema, options) => {
      // Project-specific data generation logic
      const generator = new MaskedDataGenerator(dbHandle, schema);
      return generator.generateAllTables({
        testCount: options.testCount ?? 5,
        hostsPerTest: options.hostsPerTest ?? 10,
        findingsPerHost: options.findingsPerHost ?? 5
      });
    }
  }
};

const populator = new SchemaPopulator(config);

// DEV: Generate masked test data
const devResults = await populator.populateDev(dbHandle, 'TCDEV', {
  generateData: true,
  copyStaticFromProd: true,  // Copy reference data from production
  testCount: 10
});
console.log(devResults);
// {
//   mode: 'DEV',
//   schema: 'TCDEV',
//   populated: true,
//   generated: { tests: 10, hosts: 100, findings: 500 },
//   staticTables: [...]
// }

// UAT: Copy sampled production data
const uatResults = await populator.populateUat(dbHandle, 'TCUAT', {
  sampleConfig: {
    z: 1.96,    // 95% confidence
    p: 0.5,     // Maximum variability
    e: 0.05     // 5% margin of error
  },
  replaceExisting: false
});
console.log(uatResults);
// {
//   mode: 'UAT',
//   schema: 'TCUAT',
//   populated: true,
//   sampleSize: 370,
//   tables: [
//     { table: 'TEST', copied: 370, skipped: false },
//     { table: 'FINDING', copied: 1850, skipped: false },
//     { table: 'HOST', copied: 3700, skipped: false },
//     { table: 'ANNOTATION', copied: 925, skipped: false }
//   ],
//   staticTables: [...]
// }

// PROD: Validate schema
const prodResults = await populator.validateProduction(
  dbHandle,
  'TC',
  ['TEST', 'HOST', 'FINDING', 'ANNOTATION']
);
console.log(prodResults);
// { schema: 'TC', tables: 4, missing: [] }
```

**SchemaPopulator Workflow**:

1. **DEV Population**:
   - Check if main table has rows
   - Generate masked data if empty (using project-specific generator)
   - Optionally copy static/reference tables from production

2. **UAT Population**:
   - Calculate statistical sample size from production data
   - Select random sample of parent entities (e.g., tests)
   - Copy parent entities to UAT
   - Copy child entities via foreign key relationships
   - Auto-discover and copy ancillary tables
   - Copy static/reference tables

3. **Production Validation**:
   - Verify schema exists
   - Verify all required tables exist
   - Return validation report

---

## Neo4j Quick Start

### Basic Neo4j Operations

```javascript
import { Neo4jOperations } from '@rescor/core-db';
import { Recorder } from '@rescor/core-utils';

// Create recorder for logging
const recorder = new Recorder({ logLevel: 'info' });

// Create operations instance
const operations = new Neo4jOperations({
  schema: 'neo4j',  // Database name (CE: always 'neo4j')
  uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  password: process.env.NEO4J_PASSWORD,
  recorder
});

// Connect to database
await operations.connect();

// Execute Cypher query with parameters
const results = await operations.query(
  'MATCH (h:Host {status: $status}) RETURN h',
  { status: 'active' }
);

console.log(results);

// Disconnect
await operations.disconnect();
```

### Neo4j Graph Transforms

```javascript
import { Neo4jOperations } from '@rescor/core-db';
import { Neo4jTransforms, CommonNeo4jTransforms } from '@rescor/core-db';

// Create transforms for Neo4j types
const transforms = new Neo4jTransforms()
  .add('host', { type: 'node' })        // Node → JavaScript object
  .add('finding', { type: 'node' })
  .add('affects', { type: 'relationship' })  // Relationship → object
  .add('attack_path', { type: 'path' });     // Path → array of segments

// Or use common patterns
const nodeTransforms = CommonNeo4jTransforms.forNodes(['host', 'finding']);

const operations = new Neo4jOperations({ schema: 'neo4j' });
await operations.connect();

// Query returns Neo4j types (Node, Relationship)
const results = await operations.query(`
  MATCH (h:Host)-[r:HAS_FINDING]->(f:Finding)
  RETURN h AS host, r AS affects, f AS finding
`, {}, transforms);

// Results are transformed to plain JavaScript objects
console.log(results[0]);
// {
//   host: {
//     hostname: 'server1',
//     ip: '192.168.1.1',
//     _labels: ['Host'],
//     _id: 123
//   },
//   affects: {
//     severity: 'CRITICAL',
//     discovered: '2024-01-01',
//     _type: 'HAS_FINDING',
//     _id: 456,
//     _startId: 123,
//     _endId: 789
//   },
//   finding: {
//     cve: 'CVE-2024-001',
//     score: 95,
//     _labels: ['Finding'],
//     _id: 789
//   }
// }
```

### Neo4j Transactions

```javascript
// Transaction callback (automatic commit/rollback)
const result = await operations.transaction(async (tx) => {
  // Create nodes
  await tx.query(`
    CREATE (h:Host {hostname: $hostname, ip: $ip})
  `, { hostname: 'server1', ip: '192.168.1.1' });

  await tx.query(`
    CREATE (f:Finding {cve: $cve, severity: $severity})
  `, { cve: 'CVE-2024-001', severity: 'CRITICAL' });

  // Create relationship
  await tx.query(`
    MATCH (h:Host {hostname: $hostname})
    MATCH (f:Finding {cve: $cve})
    CREATE (h)-[:HAS_FINDING {discovered: date()}]->(f)
  `, { hostname: 'server1', cve: 'CVE-2024-001' });

  return { success: true };
});

// On error, transaction automatically rolls back
// On success, transaction automatically commits
```

### Neo4j Relationships

```javascript
// Create relationship between nodes
await operations.query(`
  MATCH (h:Host {hostname: $hostname})
  MATCH (f:Finding {cve: $cve})
  CREATE (h)-[:HAS_FINDING {severity: $severity, discovered: date()}]->(f)
`, {
  hostname: 'web-server',
  cve: 'CVE-2024-001',
  severity: 'CRITICAL'
});

// Query relationship patterns
const findings = await operations.query(`
  MATCH (h:Host)-[r:HAS_FINDING]->(f:Finding)
  WHERE f.severity IN ['CRITICAL', 'HIGH']
  RETURN h.hostname AS host, f.cve AS cve, f.severity AS severity
`);

// Traverse multiple hops
const sources = await operations.query(`
  MATCH (h:Host)-[:HAS_FINDING]->(f:Finding)-[:FROM_SOURCE]->(s:Source)
  RETURN h.hostname AS host, f.cve AS cve, s.name AS source
`);
```

### Neo4j Path Queries

```javascript
// Simple path
const path = await operations.query(`
  MATCH path = (h:Host)-[:HAS_FINDING]->(f:Finding)
  RETURN path
`);

// Variable length paths
const reachable = await operations.query(`
  MATCH (h1:Host {hostname: 'web-server'})-[:CONNECTS_TO*1..3]-(h2:Host)
  RETURN DISTINCT h2.hostname AS hostname
`);

// Shortest path
const shortest = await operations.query(`
  MATCH (start:Host {hostname: $start}),
        (end:Host {hostname: $end})
  MATCH path = shortestPath((start)-[:CONNECTS_TO*]-(end))
  RETURN [node IN nodes(path) | node.hostname] AS route
`, { start: 'web-server', end: 'db-server' });

// Transform paths to JavaScript arrays
const pathTransforms = CommonNeo4jTransforms.forPaths(['attack_path']);
const attackPaths = await operations.query(`
  MATCH path = (h:Host)-[:HAS_FINDING]->(:Finding)-[:FROM_SOURCE]->(:Source)
  RETURN path AS attack_path
`, {}, pathTransforms);

// Each path segment has start, relationship, end
attackPaths[0].attack_path.forEach(segment => {
  console.log(`${segment.start.hostname} -[${segment.relationship._type}]-> ${segment.end.name}`);
});
```

### Neo4j Multi-Database (Enterprise)

```javascript
// Community Edition (CE): Single database 'neo4j'
const ceOps = new Neo4jOperations({
  schema: 'neo4j',  // CE: Always use 'neo4j'
  uri: 'bolt://localhost:7687'
});

// Enterprise Edition (EE): Multiple databases
const devOps = new Neo4jOperations({
  schema: 'tcdev',  // EE: Development database
  uri: 'bolt://localhost:7687'
});

const prodOps = new Neo4jOperations({
  schema: 'tc',  // EE: Production database
  uri: 'bolt://localhost:7687'
});

// CE Workaround: Use labels for isolation
// Instead of separate databases, use environment labels
await operations.query(`
  CREATE (h:TCDEV:Host {name: 'dev-server'})  // TCDEV label = dev environment
`);

await operations.query(`
  CREATE (h:TC:Host {name: 'prod-server'})    // TC label = prod environment
`);

// Query by environment
const devHosts = await operations.query('MATCH (h:TCDEV:Host) RETURN h');
const prodHosts = await operations.query('MATCH (h:TC:Host) RETURN h');
```

### Neo4j Error Handling

```javascript
import { Neo4jErrorHandler, ERROR_TYPES } from '@rescor/core-db';

try {
  await operations.query('INVALID CYPHER SYNTAX');
} catch (err) {
  // Handle error with Neo4jErrorHandler
  const handled = Neo4jErrorHandler.handle(err, {
    isDevelopment: process.env.NODE_ENV !== 'production'
  });

  console.error('User message:', handled.userMessage);
  // "Cypher syntax error"

  console.error('Error type:', handled.errorType);
  // ERROR_TYPES.SYNTAX

  if (handled.isDevelopment) {
    console.error('Technical details:', handled.technicalMessage);
    // Full error with masked passwords
  }

  // Convert to typed error
  const typedError = Neo4jErrorHandler.toTypedError(err);
  // Returns QueryError, ConnectionError, etc.
}
```

---

## API Documentation

### DB2Operations

Main class for database operations.

#### Constructor Options

```javascript
new DB2Operations({
  schema: string,              // Database schema (e.g., 'TCDEV')
  connectionString: string,    // DB2 connection string (optional)
  config: Configuration,       // Configuration instance (optional)
  transforms: Transforms,      // Transform configuration (optional)
  recorder: Recorder,          // Recorder for logging (optional)
  hostname: string,            // DB hostname (optional)
  port: number,                // DB port (optional)
  database: string,            // Database name (optional)
  user: string,                // DB user (optional)
})
```

#### Methods

- `async connect()` - Connect to database
- `async disconnect()` - Disconnect from database
- `async query(sql, params)` - Execute SQL query
- `async prepare(sql, params)` - Execute prepared statement
- `async beginTransaction()` - Begin transaction
- `async commit()` - Commit transaction
- `async rollback()` - Rollback transaction
- `async transaction(callback)` - Execute callback in transaction
- `async insertMany(table, columns, rows, chunkSize?)` - Bulk insert rows with chunked multi-row INSERT; default chunk size 500; returns total rows inserted
- `qualifyTable(tableName)` - Qualify table name with schema
- `getMetadata()` - Get connection metadata
- `get isConnected` - Check if connected (getter)
- `checkConnection()` - Throw if not connected

### BatchInserter

Streaming accumulator for generator-loop ingest patterns. Delegates each chunk
to `operations.insertMany()` so no duplicate chunking logic.

```javascript
new BatchInserter(operations, table, columns, options?)
```

| Option | Default | Description |
|--------|---------|-------------|
| `chunkSize` | `500` | Rows per INSERT statement |

| Method | Returns | Description |
|--------|---------|-------------|
| `add(row)` | `Promise<number>` | Append one row; returns rows flushed (0 unless chunk fired) |
| `close()` | `Promise<{rowsInserted, chunksExecuted}>` | Flush remainder; return totals |

### Transforms

Row transformation system.

#### Creating Transforms

```javascript
// Fluent API
const transforms = new Transforms()
  .add('id', { type: 'int' })
  .add('price', { type: 'float' })
  .add('active', { type: 'bool' });

// From object
const transforms = Transforms.fromObject({
  id: { type: 'int' },
  metadata: { type: 'json' }
});

// From functions
const transforms = Transforms.fromFunctions({
  name: (value) => value.toUpperCase(),
  email: (value) => value.toLowerCase()
});
```

#### Transform Options

```javascript
new TransformColumn('column_name', {
  type: 'int|float|bool|json|date|string',  // Type conversion
  newName: 'new_column_name',               // Rename output
  from: 'SOURCE_COLUMN',                    // Source column (different from target)
  default: defaultValue,                    // Default if undefined/null
  transform: (value, row) => transformed,   // Custom transform function
  nameTransform: (name) => newName          // Transform column name
})
```

#### CommonTransforms

Pre-built transform helpers:

```javascript
CommonTransforms.ID_INT('id');                    // Integer ID column
CommonTransforms.TIMESTAMPS();                     // created_at, updated_at dates
CommonTransforms.BOOLEAN_FLAGS(['active', 'deleted']);  // Boolean flags
CommonTransforms.JSON_COLUMNS(['metadata', 'config']);  // JSON columns
```

### PhaseManager

Environment phase detection and configuration.

```javascript
const phaseManager = new PhaseManager({
  explicitPhase: 'development|uat|production',  // Override auto-detection
  defaultPhase: 'development',                  // Fallback phase
  env: process.env,                             // Environment variables
  recorder: recorder                            // Recorder for logging
});

// Methods
phaseManager.determinePhase()     // → 'development'|'uat'|'production'
phaseManager.getPhaseConfig()     // → { phase, isDevelopment, ... }
phaseManager.isDevelopment()      // → boolean
phaseManager.isUAT()              // → boolean
phaseManager.isProduction()       // → boolean
phaseManager.getMetadata()        // → { phase, source, ... }
```

### PhaseLifecycle

5-state schema lifecycle management.

**States**: `NOT_INITIALIZED` → `INITIATED` → `POPULATED` → `BACKED_UP` → `RESET` / `HARD_RESET`

```javascript
const lifecycle = new PhaseLifecycle(provisioner, schemaName, {
  recorder: recorder,
  backupSchemaName: 'SCHEMA_BACKUP'  // Optional
});

// Methods
await lifecycle.initiate({ ddlFiles, variables, force });
await lifecycle.populate({ dataFiles, variables, continueOnError });
await lifecycle.backup();
await lifecycle.reset({ ddlFiles, dataFiles });
await lifecycle.hardReset({ ddlFiles, dataFiles, confirm: true });

lifecycle.getState()      // Current lifecycle state
lifecycle.getHistory()    // State transition history
lifecycle.getMetadata()   // Complete metadata
```

### ConnectString

Connection string builder with credential strategies.

```javascript
const builder = new ConnectString({
  hostname: 'localhost',
  port: 50000,
  database: 'TESTDB',
  protocol: 'TCPIP',
  user: 'admin',           // Optional
  password: 'password',    // Optional
  passwordFile: '/run/secrets/db_password'  // Docker secrets
});

// Three-tier credential loading: config → file → environment
const connStr = await builder.build(config);

// Or direct
const connStr = builder.buildDirect('user', 'password');

// Helpers
const builder = ConnectString.fromEnvironment();
const builder = ConnectString.fromDatabaseConfig(dbConfig);
const masked = builder.getMasked();  // For logging
const validation = builder.validate();
```

## Environment Variables

### Database Connection

```bash
DB2_HOSTNAME=localhost          # Database hostname
DB2_PORT=50000                  # Database port (default: 50000)
DB2_DATABASE=TESTDB             # Database name
DB2_PROTOCOL=TCPIP              # Protocol (default: TCPIP)
DB2_USER=admin                  # Database user
DB2_PASSWORD=secret             # Database password
DB2_SCHEMA=TEST                 # Default schema
```

### Phase Detection

```bash
PHASE=development|uat|production   # Explicit phase
NODE_ENV=development|test|production  # Node environment (fallback)
```

## Examples

Complete examples are available in [packages/core-db/examples/](examples/):

- [01-basic-usage.mjs](examples/01-basic-usage.mjs) - Connection, queries, disconnection
- [02-transforms.mjs](examples/02-transforms.mjs) - Type conversions, renaming, custom functions
- [03-transactions.mjs](examples/03-transactions.mjs) - Transaction management
- [04-error-handling.mjs](examples/04-error-handling.mjs) - Error types and recovery
- [05-custom-operations.mjs](examples/05-custom-operations.mjs) - Extending DB2Operations
- [06-audit-proxy.mjs](examples/06-audit-proxy.mjs) - Audit logging integration
- [07-phase-management.mjs](examples/07-phase-management.mjs) - Phase detection and workflows

## Testing

### Unit Tests

Fast, isolated tests that don't require a database:

```bash
npm test                    # Run unit tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Integration Tests

Tests with real DB2 database (requires setup):

```bash
# Set environment variables
export INTEGRATION_TESTS=true
export DB2_HOSTNAME=localhost
export DB2_DATABASE=TESTDB
export DB2_USER=testuser
export DB2_PASSWORD=testpass

# Run integration tests
npm run test:integration

# Or all tests (unit + integration)
npm run test:all
```

See [test/integration/README.md](test/integration/README.md) for complete integration test documentation.

## Error Handling

### Error Types

```javascript
import {
  DatabaseError,        // Base database error
  ConnectionError,      // Connection failures
  QueryError,           // Query execution errors
  NoResults,            // No results found
  DuplicateRecord       // Duplicate key violation
} from '@rescor/core-db';

try {
  await operations.query('SELECT * FROM INVALID_TABLE');
} catch (err) {
  if (err instanceof ConnectionError) {
    console.error('Connection failed:', err.message);
  } else if (err instanceof QueryError) {
    console.error('Query failed:', err.message, err.code);
  } else {
    throw err;
  }
}
```

### Event Logging

Event codes for monitoring and debugging:

- **8500-8599**: Database operations (connect, disconnect, query)
- **8030-8099**: Schema lifecycle (initiate, populate, backup, reset)
- **8510-8519**: Transaction management (begin, commit, rollback)

## Architecture

### Package Structure

```
packages/core-db/
├── src/
│   ├── index.mjs              # Main exports
│   ├── Operations.mjs         # Abstract base class
│   ├── DB2Operations.mjs      # IBM DB2 implementation
│   ├── Transforms.mjs         # Row transformation system
│   ├── ConnectString.mjs      # Connection string builder
│   ├── BatchInserter.mjs      # Streaming bulk-insert accumulator
│   ├── utilities/
│   │   ├── index.mjs          # Utility exports
│   │   ├── queryScalar.mjs    # Query single value
│   │   ├── tableExists.mjs    # Check table existence
│   │   ├── tableHasRows.mjs   # Check if table has data
│   │   ├── getPrimaryKeyColumns.mjs  # Get PK columns
│   │   ├── getTablesWithColumn.mjs   # Find tables with column
│   │   ├── buildInClause.mjs  # Build IN clause with chunking
│   │   ├── copyTableRows.mjs  # Copy rows between schemas
│   │   ├── copyStaticTables.mjs  # Copy reference tables
│   │   ├── clearTables.mjs    # DELETE all rows
│   │   └── computeSampleSize.mjs  # Statistical sample size
│   └── phase/
│       ├── index.mjs          # Phase exports
│       ├── PhaseManager.mjs   # Phase detection
│       ├── PhaseLifecycle.mjs # 5-state lifecycle
│       ├── SchemaMapper.mjs   # Phase ↔ Schema mapping
│       ├── SchemaProvisioner.mjs  # SQL execution
│       ├── SchemaOrchestrator.mjs # High-level workflows
│       └── SchemaPopulator.mjs    # DEV/UAT/PROD population
├── test/
│   ├── unit/                  # Unit tests (fast, no DB)
│   └── integration/           # Integration tests (require DB2)
├── examples/                  # Usage examples
└── README.md                  # This file
```

### Design Principles

1. **DB-Agnostic Base**: `Operations` abstract class can support other databases
2. **Composition**: Small, focused classes that compose well
3. **Immutability**: Transform configurations are immutable
4. **Type Safety**: Full JSDoc with type hints for editor support
5. **Error Context**: Rich error messages with codes and metadata
6. **Audit Trail**: Comprehensive logging via Recorder integration

## Dependencies

### Production

- `ibm_db@^3.2.4` - IBM DB2 driver for Node.js

### Development

- `@rescor/core-config` - Configuration and credential management
- `@rescor/core-utils` - Recorder, Utilities helpers
- `vitest` - Testing framework

## Migration from TestCenter/SPM

If migrating from testingcenter.rescor.net or spm.rescor.net:

1. **Replace imports**:
   ```javascript
   // Old
   import { StcDatabase } from './Database.mjs';

   // New
   import { DB2Operations } from '@rescor/core-db';
   ```

2. **Update class names**:
   - `StcDatabase` → `DB2Operations`
   - `SchemaBuildout` → `SchemaOrchestrator`
   - `SchemaResolver` → `SchemaMapper`

3. **Use Transforms API**:
   ```javascript
   // Old
   const transforms = {
     id: (value) => parseInt(value),
     metadata: (value) => JSON.parse(value)
   };

   // New
   const transforms = new Transforms()
     .add('id', { type: 'int' })
     .add('metadata', { type: 'json' });
   ```

See [MIGRATION-TC.md](../../MIGRATION-TC.md) and [MIGRATION-SPM.md](../../MIGRATION-SPM.md) for complete migration guides.

## Troubleshooting

### Connection Fails

**Problem**: `ConnectionError: Failed to connect to database`

**Solutions**:
- Verify DB2 is running: `db2 list active databases`
- Check network access: `telnet hostname 50000`
- Verify credentials: Test manual connection
- Check environment variables

### Query Returns Uppercase Columns

**Problem**: DB2 returns column names in UPPERCASE

**Solution**: Use Transforms to normalize:
```javascript
const transforms = new Transforms()
  .add('id', { type: 'int' })  // Automatically lowercases to 'id'
  .add('name');                 // Automatically lowercases to 'name'
```

### Schema Already Exists

**Problem**: `SQL0601N The name of the schema already exists`

**Solution**: Use `force: true` or manually drop:
```javascript
await lifecycle.hardReset({ confirm: true });  // Complete rebuild
```

## Contributing

This package is part of the private @rescor monorepo. For development:

1. Make changes in `packages/core-db/src/`
2. Add tests in `packages/core-db/test/`
3. Run tests: `npm test`
4. Update examples if API changes
5. Update this README if features change

## License

UNLICENSED - Private internal use only

## Support

For issues, questions, or contributions, contact the RESCOR development team.

---

**Part of the @rescor Core Package Suite**:
- [@rescor/core-db](../core-db) - Database operations (this package)
- [@rescor/core-config](../core-config) - Configuration and secrets
- [@rescor/core-utils](../core-utils) - Shared utilities
- [@rescor/core-auth](../core-auth) - Authentication
