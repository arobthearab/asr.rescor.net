# @rescor/core-db Architecture

**Version**: 1.0.0
**Last Updated**: 2026-02-14
**Status**: Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [Architecture Layers](#architecture-layers)
4. [Component Diagram](#component-diagram)
5. [Core Components](#core-components)
6. [Data Flow](#data-flow)
7. [Error Handling Architecture](#error-handling-architecture)
8. [Security Architecture](#security-architecture)
9. [Extension Points](#extension-points)
10. [Performance Considerations](#performance-considerations)
11. [Future Roadmap](#future-roadmap)

---

## Overview

`@rescor/core-db` is a unified database operations module that provides a generic, DB-agnostic foundation for database access across all RESCOR projects. It consolidates database logic from TestingCenter (~3,127 lines) and SPM (stub) into a reusable, well-tested package.

### Key Features

- **Generic Base Class**: DB-agnostic `Operations` base class
- **DB2 Implementation**: Production-ready IBM DB2 support
- **Transform System**: Composable row normalization
- **Error Handling**: DB2 error code mapping with user-friendly messages
- **Transaction Support**: Built-in transaction management with auto-rollback
- **Security**: Multi-tier credential strategies, sensitive data masking
- **Schema Isolation**: Support for dev/uat/prod schema separation

### Package Dependencies

```
@rescor/core-db
├── @rescor/core-utils (BaseError, utilities)
├── @rescor/core-config (optional - for credential loading)
└── ibm_db (IBM DB2 driver)
```

---

## Design Principles

### 1. Separation of Concerns

Each component has a single, well-defined responsibility:
- **Operations**: Database connectivity and query execution
- **Transforms**: Data normalization
- **ConnectString**: Connection string building
- **ErrorHandler**: Error mapping and classification

### 2. Extensibility

- Abstract base class allows multiple database implementations
- Transform system is composable
- Error handling is configurable (dev/prod modes)
- Subclasses can add domain-specific logic

### 3. Security by Default

- Credential masking in logs
- SQL injection prevention via identifier validation
- Sensitive field masking in error messages
- Multi-tier credential strategies (config → file → env)

### 4. Developer Experience

- Intuitive API with clear method names
- Rich error messages with recommended actions
- Comprehensive examples and documentation
- Migration guides for existing projects

### 5. Performance

- Lazy loading of heavy dependencies (ibm_db)
- Transform caching
- Minimal abstraction overhead
- Connection reuse

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  (TestOperations, FindingOperations, PackageOperations)     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  DB-Specific Layer                          │
│         (DB2Operations, PostgresOperations, etc.)           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Generic Base Layer                         │
│                    (Operations)                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Supporting Components                      │
│  (Transforms, ConnectString, ErrorHandler, BaseError)       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Database Driver                           │
│                      (ibm_db)                                │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

**Application Layer**:
- Domain-specific business logic
- CRUD operations for specific tables
- Validation and business rules
- Extends DB-Specific Layer

**DB-Specific Layer**:
- Database-specific connection logic
- Transaction management
- Query execution
- Error mapping
- Extends Generic Base Layer

**Generic Base Layer**:
- Abstract interface definition
- Schema-aware table qualification
- Result normalization via MassageResults()
- Query logging
- Metadata management

**Supporting Components**:
- **Transforms**: Row normalization and type conversion
- **ConnectString**: Connection string building with credential strategies
- **ErrorHandler**: Error mapping, classification, masking
- **BaseError**: Common error base class (from core-utils)

**Database Driver**:
- Low-level database communication
- Protocol implementation
- Connection pooling (driver-specific)

---

## Component Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                         core-db                                 │
│                                                                 │
│  ┌─────────────┐      ┌──────────────┐     ┌──────────────┐   │
│  │ Operations  │◄─────│ DB2Operations│     │ Transforms   │   │
│  │  (abstract) │      │              │     │              │   │
│  └─────────────┘      └──────────────┘     └──────────────┘   │
│        ▲  ▲                  │                     ▲           │
│        │  │                  │                     │           │
│        │  │                  ▼                     │           │
│  ┌─────────────┐      ┌──────────────┐     ┌──────────────┐   │
│  │ BaseError   │      │ ConnectString│     │TransformColumn│  │
│  │ (core-utils)│      │              │     │              │   │
│  └─────────────┘      └──────────────┘     └──────────────┘   │
│        ▲                     │                                 │
│        │                     │                                 │
│  ┌─────────────┐      ┌──────────────┐   ┌──────────────┐     │
│  │ErrorHandler │      │Configuration │   │BatchInserter │     │
│  │             │      │ (core-config)│   │              │     │
│  └─────────────┘      └──────────────┘   └──────────────┘     │
│                          (optional)             │              │
│                                         uses insertMany()      │
└────────────────────────────────────────────────────────────────┘
         │                      │
         ▼                      ▼
   ┌──────────┐          ┌──────────┐
   │ ibm_db   │          │ DB2 RDBMS│
   └──────────┘          └──────────┘
```

### Component Relationships

- **Operations** → **BaseError**: Throws typed errors
- **DB2Operations** → **Operations**: Extends base class
- **DB2Operations** → **ConnectString**: Uses for connection strings
- **DB2Operations** → **ErrorHandler**: Uses for error mapping
- **DB2Operations** → **ibm_db**: Uses for DB2 connectivity
- **ErrorHandler** → **BaseError**: Creates typed errors
- **Transforms** → **TransformColumn**: Composes multiple columns
- **BatchInserter** → **Operations**: Delegates each chunk to `insertMany()`
- **Application Classes** → **DB2Operations**: Extends for domain logic

---

## Core Components

### 1. Operations (Base Class)

**File**: `src/Operations.mjs`

**Purpose**: Generic, DB-agnostic base class for database operations

**Key Features**:
- Abstract interface (connect, disconnect, query)
- Schema-aware table qualification
- Built-in result normalization (MassageResults)
- SQL identifier validation (SQL injection prevention)
- Query logging with sensitive data masking
- Metadata introspection

**API**:
```javascript
class Operations {
  constructor(options)
  async connect()
  async disconnect()
  async query(sql, params)
  async transaction(callback)
  async insertMany(table, columns, rows, chunkSize = 500)
  qualifyTable(tableName)
  checkConnection()
  get isConnected
  static MassageResults(results, transforms)
  static validateIdentifier(identifier)
}
```

#### `insertMany` — bulk insert

`insertMany` eliminates per-row round-trips by building chunked multi-row
`INSERT ... VALUES (row1), (row2), ...` statements. Default chunk size is 500,
which hits **25K+ rows/sec** on DB2 for typical 12-column tables.

- Accepts a pre-qualified name (`SESSION.BENCH_TABLE`) or an unqualified name
  (auto-qualified via `this.schema`)
- Validates every identifier before building SQL — SQL injection not possible
  through table/column name arguments
- Uses only `this.query()` internally — DB-agnostic, works with any subclass
- Does **not** open a transaction automatically; wrap in `operations.transaction()`
  when atomicity is required

### 2. BatchInserter

**File**: `src/BatchInserter.mjs`

**Purpose**: Streaming accumulator for generator-loop ingest patterns

**Key Features**:
- `add(row)` appends one row and auto-flushes every `chunkSize` rows via `insertMany()`
- Maximum memory held at any time: `chunkSize × rowWidth` (not the full dataset)
- `close()` flushes the remainder and returns `{ rowsInserted, chunksExecuted }`
- Holds no state on the `Operations` instance — caller owns the `BatchInserter` object
- Safe to interleave with `operations.query()` calls on the same connection

**API**:
```javascript
class BatchInserter {
  constructor(operations, table, columns, options = {})
  async add(row)    // → number (rows flushed; 0 unless chunk fired)
  async close()     // → { rowsInserted, chunksExecuted }
}
```

### 3. DB2Operations

**File**: `src/DB2Operations.mjs`

**Purpose**: IBM DB2-specific implementation

**Key Features**:
- Connection management via ibm_db
- Transaction support (begin, commit, rollback, transaction())
- Three-tier credential strategy
- Lazy loading of ibm_db (performance optimization)
- Auto-reconnect on connection loss

**API**:
```javascript
class DB2Operations extends Operations {
  async connect()
  async disconnect()
  async query(sql, params)
  async beginTransaction()
  async commit()
  async rollback()
  async transaction(callback)
}
```

### 3. Transforms System

**Files**: `src/Transforms.mjs`, `src/TransformColumn.mjs`

**Purpose**: Composable row normalization and type conversion

**Key Features**:
- Type conversions (int, float, bool, json, date, string)
- Custom value transformations
- Column renaming
- Default values
- Transform composition

**API**:
```javascript
class TransformColumn {
  constructor(columnName, options)
  transform(row)
  transformName(name)
  transformValue(value, row)
}

class Transforms {
  constructor(columns)
  apply(results)
  clone()
  merge(other)
}
```

**Common Transforms**:
```javascript
// Integer conversion
new TransformColumn('test_id', { type: 'int' })

// Boolean conversion
new TransformColumn('is_active', { type: 'bool' })

// JSON parsing
new TransformColumn('metadata', { type: 'json' })

// Date conversion
new TransformColumn('created_date', { type: 'date' })

// Custom transformation
new TransformColumn('test_name', {
  valueTransform: (val) => val?.trim().toLowerCase()
})
```

### 4. ConnectString

**File**: `src/ConnectString.mjs`

**Purpose**: DB2 connection string builder with credential strategies

**Key Features**:
- Direct connection string building
- Three-tier credential loading (config → file → env)
- Support for all DB2 connection parameters
- Password file support (Docker secrets)
- Environment variable fallback

**API**:
```javascript
class ConnectString {
  constructor(options)
  buildDirect(user, password)
  async build(config)
  static fromConfig(config, schema)
}
```

**Credential Strategies**:
1. **Tier 1**: Configuration (@rescor/core-config)
2. **Tier 2**: Password file (e.g., /run/secrets/db_password)
3. **Tier 3**: Environment variables (DB_USER, DB_PASSWORD)

### 5. ErrorHandler

**File**: `src/ErrorHandler.mjs`

**Purpose**: DB2 error code mapping and handling

**Key Features**:
- Maps 30+ DB2 SQLCODE/SQLSTATE codes
- Error classification (connection, auth, permission, data, syntax, resource)
- Development vs. production error modes
- Sensitive data masking
- Retryable error detection
- Recommended actions

**API**:
```javascript
class ErrorHandler {
  static handle(error, options)
  static mapError(sqlCode, sqlState)
  static classifyError(sqlCode, sqlState)
  static createTypedError(original, type, message, code)
  static isRetryable(error)
  static getRecommendedAction(error)
  static maskSensitiveData(message, sensitiveFields)
}
```

**Error Types**:
- `connection`: Database connection errors
- `authentication`: Auth failures
- `permission`: Insufficient privileges
- `data`: Data integrity violations
- `syntax`: SQL syntax errors
- `resource`: Resource exhaustion
- `unknown`: Unclassified errors

### 6. Error Classes

**File**: `src/Operations.mjs`

**Purpose**: Typed errors for database operations

**Hierarchy**:
```
BaseError (from @rescor/core-utils)
  └── DatabaseError
      ├── NoResults
      ├── DuplicateRecord
      ├── ConnectionError
      └── QueryError
```

**Usage**:
```javascript
import { NoResults, DuplicateRecord } from '@rescor/core-db';

// No results found
if (results.length === 0) {
  throw new NoResults('Test not found');
}

// Duplicate key
catch (err) {
  if (err.code === 'SQL0803N') {
    throw new DuplicateRecord('Test already exists', err.code);
  }
}
```

---

## Data Flow

### Query Execution Flow

```
Application
    │
    ▼
TestOperations.getTestById(123)
    │
    ▼
DB2Operations.query('SELECT * FROM TCDEV.TEST WHERE TEST_ID = ?', [123])
    │
    ├─→ Log query (masked) via recorder
    │
    ├─→ Validate SQL (if enabled)
    │
    ├─→ Execute query via ibm_db
    │       │
    │       ├─→ Success
    │       │      │
    │       │      ▼
    │       │   Raw results [{TEST_ID: 123, TEST_NAME: '...', ...}]
    │       │
    │       └─→ Error
    │              │
    │              ▼
    │           ErrorHandler.handle(err)
    │              │
    │              ├─→ Map SQLCODE to message
    │              ├─→ Classify error type
    │              ├─→ Create typed error
    │              ├─→ Mask sensitive data
    │              │
    │              ▼
    │           Throw ConnectionError/QueryError/etc.
    │
    ▼
TestTransforms.apply(results)
    │
    ├─→ Lowercase column names
    ├─→ Type conversions (int, bool, json, date)
    ├─→ Value transformations (trim, custom)
    │
    ▼
Transformed results [{test_id: 123, test_name: '...', ...}]
    │
    ▼
Return to application
```

### Transaction Flow

```
Application
    │
    ▼
DB2Operations.transaction(async () => {
    │
    ▼
  beginTransaction()
    │
    ├─→ ibm_db: BEGIN
    │
    ▼
  query('INSERT ...')
    │
    ├─→ Success
    │
    ▼
  query('UPDATE ...')
    │
    ├─→ Success
    │      │
    │      ▼
    │   commit()
    │      │
    │      ├─→ ibm_db: COMMIT
    │      │
    │      ▼
    │   Return callback result
    │
    └─→ Error
           │
           ▼
        rollback()
           │
           ├─→ ibm_db: ROLLBACK
           │
           ▼
        Throw error
})
```

---

## Error Handling Architecture

### Error Hierarchy

```
Error (JavaScript built-in)
  │
  ▼
BaseError (@rescor/core-utils)
  │
  ├─→ DatabaseError (@rescor/core-db)
  │      │
  │      ├─→ NoResults
  │      ├─→ DuplicateRecord
  │      ├─→ ConnectionError
  │      └─→ QueryError
  │
  ├─→ ValidationError (@rescor/core-utils)
  ├─→ NotFoundError (@rescor/core-utils)
  └─→ ... (other modules)
```

### Error Flow

```
DB2 Error (from ibm_db)
    │
    ▼
ErrorHandler.handle(err, { isDevelopment, sensitiveFields })
    │
    ├─→ Extract SQLCODE, SQLSTATE
    │
    ├─→ Map to user-friendly message
    │
    ├─→ Classify error type
    │
    ├─→ Create typed error instance
    │   (NoResults, DuplicateRecord, ConnectionError, etc.)
    │
    ├─→ Mask sensitive data in messages
    │
    ├─→ Generate user message (safe for end users)
    │
    ├─→ Generate technical message (dev only)
    │
    ▼
Return {
  error: TypedError,
  type: 'connection' | 'data' | ...,
  code: 'SQL0803N',
  state: '23505',
  userMessage: 'Duplicate key value violates unique constraint',
  technicalMessage: 'Message: ... | SQLCODE: SQL0803N | SQL: ...',
  stack: (if includeStack),
  timestamp: Date
}
```

### Development vs. Production

**Development Mode** (`isDevelopment: true`):
- User message includes SQL code
- Technical message with full details (SQLCODE, SQLSTATE, SQL)
- Stack trace included
- Detailed error logging

**Production Mode** (`isDevelopment: false`):
- User message is generic and safe
- No technical message
- No stack trace
- Minimal logging

---

## Security Architecture

### 1. Credential Management

**Three-Tier Strategy**:

```
Priority 1: Configuration (@rescor/core-config)
    │
    ├─→ Uses SecureStore (Infisical, MemoryStore, etc.)
    ├─→ Encrypted storage
    ├─→ Centralized management
    │
    ▼
Priority 2: Password File (Docker/Kubernetes secrets)
    │
    ├─→ /run/secrets/db_password
    ├─→ File system isolation
    ├─→ Container-native
    │
    ▼
Priority 3: Environment Variables
    │
    ├─→ DB_USER, DB_PASSWORD
    ├─→ Fallback for legacy systems
    └─→ Least secure (visible in process list)
```

### 2. SQL Injection Prevention

**Parameterized Queries**:
```javascript
// SAFE: Parameters passed separately
await ops.query('SELECT * FROM TEST WHERE TEST_ID = ?', [testId]);

// UNSAFE: String concatenation (DO NOT DO THIS)
await ops.query(`SELECT * FROM TEST WHERE TEST_ID = ${testId}`);
```

**Identifier Validation**:
```javascript
Operations.validateIdentifier('TEST_TABLE');  // ✓ OK
Operations.validateIdentifier('TEST; DROP TABLE USERS--');  // ✗ Throws
```

### 3. Sensitive Data Masking

**In Logs**:
```javascript
// Original: password='secret123'
// Logged:   password='***'

this._maskSensitiveData(sql);
```

**In Error Messages**:
```javascript
ErrorHandler.handle(err, {
  sensitiveFields: ['password', 'pwd', 'api_key', 'token', 'secret']
});

// Original: Connection failed: password='secret'
// Masked:   Connection failed: password='***'
```

### 4. Schema Isolation

```javascript
// Development
const ops = new DB2Operations({ schema: 'TCDEV' });
ops.query('SELECT * FROM TEST');  // → SELECT * FROM TCDEV.TEST

// Production
const ops = new DB2Operations({ schema: 'TC' });
ops.query('SELECT * FROM TEST');  // → SELECT * FROM TC.TEST
```

---

## Extension Points

### 1. Custom Operations Subclass

```javascript
import { DB2Operations } from '@rescor/core-db';

export class MyOperations extends DB2Operations {
  constructor(options = {}) {
    super({
      ...options,
      transforms: MyTransforms
    });
  }

  // Add domain-specific methods
  async getActiveRecords() {
    const sql = `SELECT * FROM ${this.qualifyTable('RECORDS')} WHERE IS_ACTIVE = 1`;
    const results = await this.query(sql);
    return this.transforms.apply(results);
  }
}
```

### 2. Custom Transforms

```javascript
import { TransformColumn } from '@rescor/core-db';

const CustomTransform = new TransformColumn('status', {
  valueTransform: (val, row) => {
    // Custom business logic
    if (val === 'A') return 'active';
    if (val === 'I') return 'inactive';
    return 'unknown';
  }
});
```

### 3. Custom Error Handling

```javascript
import { ErrorHandler } from '@rescor/core-db';

class MyErrorHandler extends ErrorHandler {
  static handle(error, options) {
    const handled = super.handle(error, options);

    // Add custom error tracking
    trackError(handled);

    return handled;
  }
}
```

### 4. Other Database Implementations

```javascript
import { Operations } from '@rescor/core-db';

export class PostgresOperations extends Operations {
  async connect() {
    // PostgreSQL connection logic
  }

  async query(sql, params) {
    // PostgreSQL query execution
  }

  // ... other methods
}
```

---

## Performance Considerations

### 1. Connection Pooling

**Current**: Single connection per Operations instance

**Recommendation**: Reuse Operations instances across requests

```javascript
// ✓ GOOD: Reuse instance
const ops = new TestOperations({ schema: 'TCDEV', ... });
await ops.connect();

app.get('/tests', async (req, res) => {
  const tests = await ops.getAllTests();
  res.json(tests);
});

// ✗ BAD: Create new instance per request
app.get('/tests', async (req, res) => {
  const ops = new TestOperations({ schema: 'TCDEV', ... });
  await ops.connect();
  const tests = await ops.getAllTests();
  await ops.disconnect();  // Expensive!
  res.json(tests);
});
```

**Future**: Connection pool support (planned for v1.1)

### 2. Transform Performance

**Transforms are lightweight** (~5ms overhead per 100 rows)

**Best Practices**:
- Reuse Transform instances (they're immutable)
- Apply transforms only when needed
- Use built-in type conversions when possible

### 3. Lazy Loading

**ibm_db is lazy loaded** (only loaded when connect() is called)

```javascript
// This is fast (ibm_db not loaded yet)
const ops = new DB2Operations({ ... });

// This loads ibm_db (slight delay on first connect)
await ops.connect();
```

### 4. Query Logging

**Logging overhead is minimal** (~1ms per query)

**Disable in production if needed**:
```javascript
const ops = new DB2Operations({
  schema: 'TC',
  recorder: null  // Disable logging
});
```

### 5. Benchmarks

| Operation                       | Time (ms)   | Notes                              |
|---------------------------------|-------------|------------------------------------|
| Create Operations instance      | ~1ms        | Lazy loading                       |
| Connect to DB2                  | ~150ms      | First connection                   |
| Execute query                   | ~45ms       | Typical SELECT                     |
| Apply transforms (100 rows)     | ~5ms        | Type conversions                   |
| Begin transaction               | ~10ms       | DB2 overhead                       |
| Commit transaction              | ~15ms       | DB2 overhead                       |
| Rollback transaction            | ~12ms       | DB2 overhead                       |
| Disconnect                      | ~50ms       | Connection cleanup                 |
| insertMany (12-col, 500/chunk)  | ~0.04ms/row | ~25K rows/sec; 90K rows in ~4s     |
| Loop insert (prepared stmt)     | ~4.6ms/row  | ~219 rows/sec; baseline comparison |

---

## Future Roadmap

### Version 1.0 Additions (delivered)

- [x] `insertMany()` — chunked multi-row INSERT on the base `Operations` class (25K+ rows/sec)
- [x] `BatchInserter` — streaming accumulator for generator-loop ingest patterns

### Version 1.1 (Q2 2026)

- [ ] Connection pooling support
- [ ] Prepared statement caching
- [ ] Query builder API
- [ ] Performance metrics collection

### Version 1.2 (Q3 2026)

- [ ] PostgreSQL implementation
- [ ] MySQL implementation
- [ ] Multi-database support (polyglot persistence)
- [ ] Migration utilities

### Version 2.0 (Q4 2026)

- [ ] ORM-like features (optional)
- [ ] Schema migration system
- [ ] Automatic retry logic
- [ ] Circuit breaker pattern
- [ ] Advanced query optimization

### Research Topics

- [ ] NoSQL database support (MongoDB, Redis)
- [ ] GraphQL integration
- [ ] Event-driven architecture support
- [ ] Distributed transaction support (2PC)
- [ ] Read replicas and load balancing

---

## Conclusion

`@rescor/core-db` provides a solid, production-ready foundation for database operations across all RESCOR projects. Its layered architecture, comprehensive error handling, and security-first design make it suitable for both development and production environments.

**Key Strengths**:
- ✅ Generic, extensible architecture
- ✅ Production-ready DB2 implementation
- ✅ Comprehensive error handling
- ✅ Security best practices
- ✅ Transform system for data normalization
- ✅ Transaction support
- ✅ Excellent documentation and examples

**Production Readiness**: ✅ Ready for use in TC and SPM migrations

---

## Related Documentation

- [Migration Guide: TestingCenter](./MIGRATION-TESTINGCENTER.md)
- [Migration Guide: SPM](./MIGRATION-SPM.md)
- [Migration Progress Report](./MIGRATION-PROGRESS.md)
- [Examples](../examples/)
- [Package README](../README.md)

---

**Maintained by**: RESCOR Core Team
**Questions**: core-support@rescor.net
**GitHub**: https://github.com/rescor/core.rescor.net
