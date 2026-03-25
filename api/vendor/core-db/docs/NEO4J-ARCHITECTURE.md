# Neo4j Architecture in @rescor/core-db

Comprehensive architecture documentation for Neo4j integration in @rescor/core-db.

## Table of Contents

- [Overview](#overview)
- [Design Philosophy](#design-philosophy)
- [Architecture Layers](#architecture-layers)
- [Core Components](#core-components)
- [Type System](#type-system)
- [Error Handling](#error-handling)
- [Transaction Management](#transaction-management)
- [Multi-Database Support](#multi-database-support)
- [Integration Patterns](#integration-patterns)
- [Performance Considerations](#performance-considerations)
- [Security](#security)

## Overview

The Neo4j integration in @rescor/core-db provides:
- Unified API consistent with DB2Operations
- Graph-specific transform system for Neo4j types
- Comprehensive error handling with code mapping
- Transaction support with automatic rollback
- Multi-tier credential loading
- Event logging via Recorder integration

### Goals

1. **Consistency**: Match DB2Operations API patterns
2. **Type Safety**: Convert Neo4j types to JavaScript types
3. **Developer Experience**: Simple, intuitive API
4. **Production Ready**: Error handling, logging, security
5. **Flexibility**: Support CE and Enterprise editions

## Design Philosophy

### 1. Unified Operations API

Both DB2Operations and Neo4jOperations extend the base `Operations` class:

```
Operations (abstract base)
├── DB2Operations (SQL, DB2-specific)
└── Neo4jOperations (Cypher, Neo4j-specific)
```

**Benefits**:
- Consistent method names (connect, disconnect, query, transaction)
- Shared error handling patterns
- Common credential loading strategy
- Interchangeable in application code

### 2. Graph-First Design

Neo4j operations embrace graph concepts:
- Nodes with labels (not just tables)
- Relationships as first-class entities
- Paths for traversal queries
- Pattern matching instead of JOINs

### 3. Transform System Inheritance

```
Transform (base type conversion)
├── Transforms (DB2: uppercase → lowercase)
└── Neo4jTransforms (Neo4j: Node/Relationship/Path → JavaScript)
```

Neo4jTransforms extends base Transforms:
- Inherits standard type conversions (int, float, bool, date, json)
- Adds Neo4j-specific conversions (node, relationship, path, neo4j-int)
- Supports CommonNeo4jTransforms patterns

## Architecture Layers

### Layer 1: Core Operations

**File**: `src/Neo4jOperations.mjs` (501 lines)

**Responsibilities**:
- Connection management (connect, disconnect, isConnected)
- Query execution (query, queryRaw)
- Transaction management (transaction)
- Credential loading (three-tier strategy)
- Type conversion (Neo4j types → JavaScript)
- Event emission (Recorder integration)

**Key Methods**:
```javascript
class Neo4jOperations extends Operations {
  connect()                   // Establish connection
  disconnect()                // Close connection
  query(cypher, params, tx)   // Execute Cypher query
  transaction(callback)       // Transaction with rollback
  _recordsToRows(records)     // Convert Neo4j Records to rows
  _neo4jValueToJS(value)      // Convert Neo4j types to JS
  _getCredentials()           // Three-tier credential loading
}
```

### Layer 2: Error Handling

**File**: `src/Neo4jErrorHandler.mjs` (293 lines)

**Responsibilities**:
- Map 30+ Neo4j error codes to user-friendly messages
- Classify errors (connection, auth, permission, data, syntax, etc.)
- Mask sensitive data (passwords, URIs)
- Convert to typed errors (ConnectionError, QueryError, etc.)
- Support development vs production modes

**Error Mappings**:
```javascript
NEO4J_ERROR_MAPPINGS = {
  'ServiceUnavailable': 'Database service unavailable',
  'Neo.ClientError.Security.Unauthorized': 'Invalid credentials',
  'Neo.ClientError.Statement.SyntaxError': 'Cypher syntax error',
  'Neo.ClientError.Schema.ConstraintViolation': 'Unique constraint violation',
  'Neo.TransientError.Transaction.DeadlockDetected': 'Transaction deadlock detected',
  // ... 25+ more
}
```

**Error Types**:
- CONNECTION: Service unavailable, session expired
- AUTHENTICATION: Invalid credentials, token expired
- PERMISSION: Forbidden, authorization expired
- SYNTAX: Cypher syntax/semantic errors
- DATA: Constraint violations, entity not found
- TRANSACTION: Deadlocks, terminated transactions
- RESOURCE: Out of memory, stack overflow

### Layer 3: Transform System

**File**: `src/Neo4jTransforms.mjs` (313 lines)

**Responsibilities**:
- Convert Neo4j Node → JavaScript object with _labels, _id
- Convert Neo4j Relationship → object with _type, _startId, _endId
- Convert Neo4j Path → array of segments
- Convert Neo4j Integer → JavaScript number
- Provide common transform patterns

**Transform Types**:
```javascript
// Node transform
{ type: 'node' }
// Input: Neo4j Node { identity, labels, properties }
// Output: { ...properties, _labels: [...], _id: number }

// Relationship transform
{ type: 'relationship' }
// Input: Neo4j Relationship { identity, type, properties, start, end }
// Output: { ...properties, _type: string, _id, _startId, _endId }

// Path transform
{ type: 'path' }
// Input: Neo4j Path { segments: [...] }
// Output: [{ start: Node, relationship: Rel, end: Node }, ...]

// Neo4j Integer transform
{ type: 'neo4j-int' }
// Input: Neo4j Integer (int64)
// Output: JavaScript number
```

**CommonNeo4jTransforms Patterns**:
```javascript
CommonNeo4jTransforms.forNodes(['host', 'finding']);
CommonNeo4jTransforms.forRelationships(['affects']);
CommonNeo4jTransforms.forPaths(['attack_path']);
CommonNeo4jTransforms.forIntegers(['id', 'count']);
CommonNeo4jTransforms.forFindingChain();  // Pre-configured chain
```

## Core Components

### 1. Neo4jOperations

**Connection Management**:
```javascript
// Create driver (singleton per instance)
this.driver = neo4j.driver(uri, auth, {
  disableLosslessIntegers: true,  // Convert to JS numbers
  maxConnectionPoolSize: 50,
  connectionAcquisitionTimeout: 60000
});

// Verify connectivity
await this.driver.verifyConnectivity();

// Create session for database
this.session = this.driver.session({
  database: this.schema,  // 'neo4j', 'tcdev', etc.
  defaultAccessMode: neo4j.session.WRITE
});
```

**Query Execution**:
```javascript
async query(cypher, params = {}, transforms = null) {
  // 1. Emit pre-query event (8501)
  this.recorder.emit(8501, { cypher, params });

  // 2. Execute Cypher
  const result = await this.session.run(cypher, params);

  // 3. Convert Records to rows
  const rows = this._recordsToRows(result.records);

  // 4. Apply transforms if provided
  const transformed = transforms
    ? Operations.MassageResults(rows, transforms)
    : rows;

  // 5. Emit post-query event (8502)
  this.recorder.emit(8502, { rowCount: transformed.length });

  return transformed;
}
```

**Type Conversion**:
```javascript
_neo4jValueToJS(value) {
  // Neo4j Node
  if (value instanceof neo4j.types.Node) {
    return {
      ...this._convertProperties(value.properties),
      _labels: value.labels,
      _id: neo4j.isInt(value.identity) ? value.identity.toNumber() : value.identity
    };
  }

  // Neo4j Relationship
  if (value instanceof neo4j.types.Relationship) {
    return {
      ...this._convertProperties(value.properties),
      _type: value.type,
      _id: neo4j.isInt(value.identity) ? value.identity.toNumber() : value.identity,
      _startId: neo4j.isInt(value.start) ? value.start.toNumber() : value.start,
      _endId: neo4j.isInt(value.end) ? value.end.toNumber() : value.end
    };
  }

  // Neo4j Integer (int64)
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }

  // Arrays (recursive)
  if (Array.isArray(value)) {
    return value.map(item => this._neo4jValueToJS(item));
  }

  // Objects (recursive)
  if (value && typeof value === 'object') {
    const converted = {};
    for (const [key, val] of Object.entries(value)) {
      converted[key] = this._neo4jValueToJS(val);
    }
    return converted;
  }

  // Primitives
  return value;
}
```

### 2. Neo4jErrorHandler

**Error Handling Flow**:
```
1. Catch Neo4j error
2. Extract error code (e.g., 'Neo.ClientError.Statement.SyntaxError')
3. Map to user message ('Cypher syntax error')
4. Classify error type (SYNTAX)
5. Mask sensitive data (passwords, URIs)
6. Return handled error or convert to typed exception
```

**Development vs Production**:
```javascript
// Development mode: show technical details
Neo4jErrorHandler.handle(err, { isDevelopment: true });
// Returns: { userMessage, technicalMessage, errorType, errorCode, stack }

// Production mode: hide technical details
Neo4jErrorHandler.handle(err, { isDevelopment: false });
// Returns: { userMessage, errorType, errorCode }
```

**Sensitive Data Masking**:
```javascript
_maskSensitiveData(message, sensitiveFields) {
  // Mask field=value patterns
  password=secret123 → password=***

  // Mask connection strings
  bolt://neo4j:password@localhost:7687 → bolt://***:***@localhost:7687
}
```

### 3. Neo4jTransforms

**Transform Pipeline**:
```
1. Query returns Neo4j Records
2. Records converted to row objects (_recordsToRows)
3. Transforms applied to each row (MassageResults)
4. TransformColumn processes each column
5. _applyTypeConversion converts based on type
6. Final JavaScript objects returned
```

**Example Transform**:
```javascript
// Input (Neo4j Record)
{
  host: Node {
    identity: Integer(123),
    labels: ['Host'],
    properties: { hostname: 'server1', port: Integer(8080) }
  },
  affects: Relationship {
    identity: Integer(456),
    type: 'HAS_FINDING',
    properties: { severity: 'CRITICAL' },
    start: Integer(123),
    end: Integer(789)
  }
}

// Transforms
const transforms = new Neo4jTransforms()
  .add('host', { type: 'node' })
  .add('affects', { type: 'relationship' });

// Output (JavaScript Object)
{
  host: {
    hostname: 'server1',
    port: 8080,  // Converted from Integer
    _labels: ['Host'],
    _id: 123  // Converted from Integer
  },
  affects: {
    severity: 'CRITICAL',
    _type: 'HAS_FINDING',
    _id: 456,
    _startId: 123,
    _endId: 789
  }
}
```

## Type System

### Neo4j Native Types

| Neo4j Type | JavaScript Equivalent | Notes |
|------------|----------------------|-------|
| **Integer** | Number | int64 converted to number |
| **Float** | Number | IEEE 754 double |
| **String** | String | UTF-8 |
| **Boolean** | Boolean | true/false |
| **Node** | Object | { ...properties, _labels, _id } |
| **Relationship** | Object | { ...properties, _type, _id, _startId, _endId } |
| **Path** | Array | [{ start, relationship, end }, ...] |
| **Date** | String | ISO 8601 format |
| **Time** | String | ISO 8601 format |
| **DateTime** | String | ISO 8601 format |
| **Duration** | Object | { months, days, seconds, nanoseconds } |
| **Point** | Object | { srid, x, y, z } |
| **List** | Array | Recursive type conversion |
| **Map** | Object | Recursive type conversion |

### Type Conversion Strategy

**Automatic Conversion** (via `disableLosslessIntegers: true`):
- Neo4j Integer → JavaScript Number (default)
- Avoids Neo4j Integer objects in results

**Manual Conversion** (via Neo4jTransforms):
- Node → Object with metadata
- Relationship → Object with metadata
- Path → Array of segments
- Nested types → Recursive conversion

## Error Handling

### Error Classification

```javascript
classifyError(code) {
  if (code.includes('ServiceUnavailable')) return ERROR_TYPES.CONNECTION;
  if (code.includes('Security.Unauthorized')) return ERROR_TYPES.AUTHENTICATION;
  if (code.includes('Security.Forbidden')) return ERROR_TYPES.PERMISSION;
  if (code.includes('Statement.SyntaxError')) return ERROR_TYPES.SYNTAX;
  if (code.includes('Schema.Constraint')) return ERROR_TYPES.DATA;
  if (code.includes('Transaction')) return ERROR_TYPES.TRANSACTION;
  if (code.includes('OutOfMemoryError')) return ERROR_TYPES.RESOURCE;
  return ERROR_TYPES.UNKNOWN;
}
```

### Typed Error Conversion

```javascript
toTypedError(error, options) {
  const handled = this.handle(error, options);
  const errorType = handled.errorType;

  switch (errorType) {
    case ERROR_TYPES.CONNECTION:
      return new ConnectionError(message, code, error);

    case ERROR_TYPES.DATA:
      if (code.includes('ConstraintViolation')) {
        return new DuplicateRecord(message, code);
      }
      if (code.includes('NotFound')) {
        return new NoResults(message, code);
      }
      return new QueryError(message, code, error);

    case ERROR_TYPES.SYNTAX:
    case ERROR_TYPES.TRANSACTION:
      return new QueryError(message, code, error);

    default:
      return new DatabaseError(message, code, error);
  }
}
```

## Transaction Management

### Transaction Callback Pattern

```javascript
async transaction(callback) {
  // 1. Create transaction session
  const txSession = this.driver.session({
    database: this.schema,
    defaultAccessMode: neo4j.session.WRITE
  });

  // 2. Begin transaction
  const tx = txSession.beginTransaction();

  // 3. Create transaction proxy with query method
  const txProxy = {
    query: async (cypher, params) => {
      const result = await tx.run(cypher, params);
      return this._recordsToRows(result.records);
    }
  };

  try {
    // 4. Execute callback with transaction proxy
    const result = await callback(txProxy);

    // 5. Commit on success
    await tx.commit();

    return result;
  } catch (err) {
    // 6. Rollback on error
    await tx.rollback();
    throw Neo4jErrorHandler.toTypedError(err);
  } finally {
    // 7. Always close session
    await txSession.close();
  }
}
```

### Usage Example

```javascript
await ops.transaction(async (tx) => {
  // All queries in same transaction
  await tx.query('CREATE (n:Node {id: 1})');
  await tx.query('CREATE (n:Node {id: 2})');
  await tx.query('CREATE RELATIONSHIP ...');

  // If any query fails, all roll back
  // If all succeed, transaction commits
});
```

## Multi-Database Support

### Community Edition (CE)

**Limitation**: Single database (`neo4j`) only

**Workaround**: Label-based isolation

```javascript
// Use labels to simulate databases
CREATE (h:TCDEV:Host {name: 'dev-server'})    // Development
CREATE (h:TC:Host {name: 'prod-server'})      // Production

// Query by environment label
MATCH (h:TCDEV:Host) RETURN h  // Dev only
MATCH (h:TC:Host) RETURN h     // Prod only
```

### Enterprise Edition (EE)

**Support**: Multiple named databases

```javascript
// Create separate databases
CREATE DATABASE tcdev;
CREATE DATABASE tc;
CREATE DATABASE spmdev;
CREATE DATABASE spm;

// Connect to specific database
const devOps = new Neo4jOperations({ schema: 'tcdev' });
const prodOps = new Neo4jOperations({ schema: 'tc' });
```

### Database Selection Strategy

```javascript
function getDatabaseName(edition, project, phase) {
  if (edition === 'enterprise') {
    // Use separate databases
    const map = {
      tc: { dev: 'tcdev', uat: 'tcuat', prod: 'tc' },
      spm: { dev: 'spmdev', uat: 'spmuat', prod: 'spm' }
    };
    return map[project][phase];
  } else {
    // CE: Always use 'neo4j'
    return 'neo4j';
  }
}

function getLabelPrefix(edition, project, phase) {
  if (edition === 'community') {
    // Use labels for isolation
    const map = {
      tc: { dev: 'TCDEV', uat: 'TCUAT', prod: 'TC' },
      spm: { dev: 'SPMDEV', uat: 'SPMUAT', prod: 'SPM' }
    };
    return map[project][phase];
  } else {
    // EE: No label prefix needed
    return null;
  }
}
```

## Integration Patterns

### Recorder Integration

```javascript
// Event codes (8500-8599 range)
8501: 'neo4j.query.start'      // Before query execution
8502: 'neo4j.query.complete'   // After query execution
8503: 'neo4j.query.error'      // Query error
8504: 'neo4j.connect'          // Connection established
8505: 'neo4j.disconnect'       // Connection closed
8510: 'neo4j.transaction.begin'
8511: 'neo4j.transaction.commit'
8512: 'neo4j.transaction.rollback'
```

### Configuration Integration

```javascript
// Three-tier credential loading
class Neo4jOperations {
  async _getCredentials() {
    // Tier 1: Constructor parameters
    if (this.uri && this.username && this.password) {
      return { uri: this.uri, username: this.username, password: this.password };
    }

    // Tier 2: Configuration instance (via getCredential)
    if (this.config) {
      const uri = await this.config.getCredential('neo4j', 'uri');
      const username = await this.config.getCredential('neo4j', 'username');
      const password = await this.config.getCredential('neo4j', 'password');
      if (uri && username && password) {
        return { uri, username, password };
      }
    }

    // Tier 3: Environment variables
    return {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD
    };
  }
}
```

## Performance Considerations

### Connection Pooling

```javascript
// Configure driver options
neo4j.driver(uri, auth, {
  maxConnectionPoolSize: 50,              // Max concurrent connections
  connectionAcquisitionTimeout: 60000,    // 60s timeout
  maxTransactionRetryTime: 30000,         // 30s retry
  disableLosslessIntegers: true           // Performance optimization
});
```

### Query Optimization

```cypher
-- Use indexes
CREATE INDEX host_hostname FOR (h:Host) ON (h.hostname);
CREATE INDEX finding_cve FOR (f:Finding) ON (f.cve);

-- Use LIMIT to reduce result sets
MATCH (h:Host) RETURN h LIMIT 100;

-- Use parameters (query plan caching)
MATCH (h:Host {hostname: $hostname}) RETURN h;

-- Profile queries
PROFILE MATCH (h:Host)-->(f:Finding) RETURN h, f;
```

### Transform Performance

```javascript
// Batch processing
const batchSize = 1000;
for (let i = 0; i < totalRecords; i += batchSize) {
  const batch = await ops.query(`
    MATCH (h:Host)
    RETURN h
    SKIP $skip LIMIT $limit
  `, { skip: i, limit: batchSize }, transforms);

  await processBatch(batch);
}
```

## Security

### Credential Management

```javascript
// ✅ Good: Environment variables
const ops = new Neo4jOperations({
  schema: 'neo4j',
  uri: process.env.NEO4J_URI,
  username: process.env.NEO4J_USERNAME,
  password: process.env.NEO4J_PASSWORD
});

// ❌ Bad: Hardcoded credentials
const ops = new Neo4jOperations({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password123'  // Never do this!
});
```

### Connection Security

```javascript
// Production: Use TLS encryption
const ops = new Neo4jOperations({
  uri: 'neo4j+s://production.example.com:7687',  // +s = TLS
  username: process.env.NEO4J_USERNAME,
  password: process.env.NEO4J_PASSWORD
});

// Development: Unencrypted OK
const ops = new Neo4jOperations({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'devpass123'
});
```

### Parameter Injection Prevention

```javascript
// ✅ Good: Parameterized queries
await ops.query(
  'MATCH (h:Host {hostname: $hostname}) RETURN h',
  { hostname: userInput }
);

// ❌ Bad: String concatenation
await ops.query(
  `MATCH (h:Host {hostname: '${userInput}'}) RETURN h`
);
```

### Sensitive Data Masking

Neo4jErrorHandler automatically masks:
- Passwords in error messages
- Connection strings with credentials
- Custom sensitive fields

```javascript
// Error message: "Connection failed with password=secret123"
// Masked: "Connection failed with password=***"

// URI: "bolt://neo4j:password@localhost:7687"
// Masked: "bolt://***:***@localhost:7687"
```

## Summary

The Neo4j integration in @rescor/core-db provides:

1. **Unified API**: Consistent with DB2Operations
2. **Graph Transforms**: Convert Neo4j types to JavaScript
3. **Error Handling**: Comprehensive error mapping and classification
4. **Transactions**: Automatic commit/rollback
5. **Multi-Database**: Support for CE (label-based) and EE (true multi-DB)
6. **Security**: Three-tier credentials, TLS support, sensitive data masking
7. **Performance**: Connection pooling, query optimization
8. **Production Ready**: Logging, error handling, best practices

For more information:
- **Quick Start**: See `docs/NEO4J-QUICKSTART.md`
- **Migration**: See `docs/MIGRATION-NEO4J.md`
- **Examples**: See `examples/08-neo4j-basic.mjs` through `14-neo4j-config-integration.mjs`
