# Database Migration to core-db - Progress Report

**Date**: 2026-02-14
**Status**: 🚧 **IN PROGRESS** (Foundation Complete, DB2-specific components in progress)

---

## Architecture Decision: Error Organization

### ✅ Decision: Hybrid Approach (IMPLEMENTED)

**Structure**:
```
@rescor/core-utils/
  └── src/errors/
      └── BaseError.mjs          # Common base + ValidationError, NotFoundError, etc.

@rescor/core-db/
  └── src/Operations.mjs         # DatabaseError extends BaseError
      └── errors: NoResults, DuplicateRecord, ConnectionError, QueryError

@rescor/core-config/
  └── src/                       # Future: ConfigurationError extends BaseError
```

**Rationale**:
- ✅ **Minimal coupling**: Only lightweight dependency on core-utils for base errors
- ✅ **Module independence**: core-db doesn't need core-config's errors
- ✅ **Clear ownership**: Database errors defined in core-db
- ✅ **Flexible catching**: Can catch broadly (BaseError) or specifically (DatabaseError)
- ✅ **Self-contained**: Each module documents its error contract

**Benefits**:
```javascript
// Catch specific database error
try {
  await operations.query();
} catch (err) {
  if (err instanceof NoResults) {
    // Handle no results specifically
  }
}

// Catch any database error
try {
  await operations.connect();
} catch (err) {
  if (err instanceof DatabaseError) {
    // Handle any DB error
  }
}

// Catch any RESCOR error (db, config, etc.)
try {
  await config.initialize();
  await operations.connect();
} catch (err) {
  if (err instanceof BaseError) {
    // Handle any RESCOR package error
  }
}
```

---

## ✅ Completed Components

### 1. Package Structure

**Created**:
- `/packages/core-db/` - Database operations package
- `/packages/core-utils/` - Common utilities and base errors

**Configuration**:
- `core-db/package.json` - IBM DB2 dependency, core-config peer dependency
- `core-utils/package.json` - No dependencies (lightweight)

---

### 2. Base Operations Class (`core-db/src/Operations.mjs`)

**Lines**: ~300

**Features**:
- ✅ Generic, DB-agnostic foundation
- ✅ Schema-aware operations (`qualifyTable()`, `tableReference`)
- ✅ Abstract methods: `connect()`, `disconnect()`, `query()`
- ✅ Row normalization: `MassageResults()` with JSON parsing, trimming, lowercase
- ✅ Identifier validation: `validateIdentifier()` prevents SQL injection
- ✅ Query logging with sensitive data masking
- ✅ Connection state management (`isConnected`)
- ✅ Metadata introspection (`getMetadata()`)

**Example**:
```javascript
class TestOperations extends Operations {
  constructor(schema) {
    super({ schema });
  }

  async describe(testId) {
    const sql = `SELECT * FROM ${this.qualifyTable('TEST')} WHERE id = ?`;
    const results = await this.query(sql, [testId]);
    return Operations.MassageResults(results[0]);
  }
}
```

---

### 3. Transform System (`core-db/src/Transforms.mjs`)

**Lines**: ~380

**Classes**:
- `TransformColumn` - Single column transformation
- `Transforms` - Collection of transforms
- `CommonTransforms` - Pre-built transform builders

**Features**:
- ✅ Column name transformations (rename, case conversion)
- ✅ Value transformations (custom functions)
- ✅ Type conversions: int, float, bool, json, date, string
- ✅ Default values
- ✅ Row-level context access
- ✅ Factory methods: `fromObject()`, `fromFunctions()`
- ✅ Composable transforms

**Example**:
```javascript
import { Transforms, CommonTransforms } from '@rescor/core-db';

const transforms = new Transforms([
  CommonTransforms.parseInt('test_id'),
  CommonTransforms.parseJSON('metadata'),
  CommonTransforms.parseDate('created_at'),
  new TransformColumn('status', {
    newName: 'test_status',
    valueTransform: (v) => v.toUpperCase()
  })
]);

const normalized = transforms.apply(databaseRows);
// { test_id: 123, metadata: {foo: 'bar'}, created_at: Date, test_status: 'ACTIVE' }
```

---

### 4. Base Error System (`core-utils/src/errors/`)

**Files**:
- `BaseError.mjs` - Common base error with metadata, codes, timestamps
- `index.mjs` - Error exports

**Common Errors**:
- `BaseError` - Foundation for all RESCOR errors
- `ValidationError` - Input validation failures
- `NotFoundError` - Resource not found
- `AuthenticationError` - Auth failures
- `AuthorizationError` - Permission denied
- `TimeoutError` - Operation timeouts
- `NetworkError` - Network failures

**Database Errors** (in core-db):
- `DatabaseError` extends `BaseError`
- `NoResults` extends `DatabaseError`
- `DuplicateRecord` extends `DatabaseError`
- `ConnectionError` extends `DatabaseError`
- `QueryError` extends `DatabaseError`

**Features**:
- ✅ Error codes (SQL codes like 'SQL0803N' or numeric)
- ✅ Original error preservation (wrapping)
- ✅ Metadata support
- ✅ Timestamps
- ✅ Stack trace capture
- ✅ JSON serialization (`toJSON()`)
- ✅ User-friendly messages (`getUserMessage()`)
- ✅ Type checking (`is()` method)

---

## 🚧 In Progress

### DB2Operations Class

**Planned Features**:
- IBM DB2-specific connection management
- ConnectString builder with credential strategies
- Three-tier credential precedence (config → file → env)
- Audit proxy integration
- DB2 identifier validation (128 chars, specific charset)
- Parameterized query execution
- Transaction support

---

## 📋 Remaining Components

### High Priority

1. **DB2Operations** (`core-db/src/DB2Operations.mjs`)
   - Concrete implementation of Operations
   - IBM DB2 connection via ibm_db
   - Connection string builder
   - Credential management integration

2. **ConnectString** (`core-db/src/ConnectString.mjs`)
   - DB2 connection string builder
   - Three-tier credential strategy:
     1. Configuration (core-config)
     2. Password file (`/run/secrets/db_password`)
     3. Environment variables
   - Integration with DatabaseSchema/DatabaseTemplate

3. **ErrorHandler** (`core-db/src/ErrorHandler.mjs`)
   - DB2-specific error code mapping
   - User-friendly error messages
   - Sensitive field masking
   - Development vs. production modes

4. **Package Exports** (`core-db/src/index.mjs`)
   - Export Operations, DB2Operations
   - Export Transforms, TransformColumn, CommonTransforms
   - Export database errors
   - Export ConnectString, ErrorHandler

### Medium Priority

5. **Examples** (`core-db/examples/`)
   - Basic Operations usage
   - Transform system usage
   - DB2Operations with real connection
   - Error handling patterns
   - Integration with core-config

6. **Migration Guides**
   - TC Migration Guide - How to refactor TC to use core-db
   - SPM Migration Guide - How to refactor SPM to use core-db
   - Breaking changes, backward compatibility
   - Step-by-step migration process

### Lower Priority

7. **Advanced Features** (Future)
   - ConnectionPool (from TC)
   - RateLimiter (from TC)
   - DatabaseProxyFactory for audit logging
   - Transaction manager
   - Query builder

---

## Integration with Existing Packages

### core-config Integration

**DatabaseTemplate** already provides connection configuration:
```javascript
import { LocalDatabaseTemplate } from '@rescor/core-config';
import { DB2Operations } from '@rescor/core-db';

// Load database config
const template = new LocalDatabaseTemplate();
await template.apply(config);
const db = await template.schema.load(config);

// Create operations with config
const operations = new DB2Operations({
  schema: 'TCDEV',
  connectionString: db.connectionString
});
```

### Phase Management Integration

**PhaseSchema** provides schema name:
```javascript
import { PhaseSchema } from '@rescor/core-config';
import { DB2Operations } from '@rescor/core-db';

// Load phase config
const phaseTemplate = new TCDevelopmentTemplate();
await phaseTemplate.apply(config);
const phase = await phaseTemplate.schema.load(config);

// Use schema name in operations
const operations = new DB2Operations({
  schema: phase.schema  // 'TCDEV', 'TCUAT', or 'TC'
});
```

---

## Migration Strategy

### TC Migration Path

**Current**: TC has comprehensive database system (3,127 lines)

**Extract to Core**:
1. ✅ Base Operations class → `@rescor/core-db/Operations`
2. ✅ Transform system → `@rescor/core-db/Transforms`
3. 🚧 DB2 connection → `@rescor/core-db/DB2Operations`
4. ⏭️ ConnectString → `@rescor/core-db/ConnectString`
5. ⏭️ Error handling → `@rescor/core-db/ErrorHandler`

**Keep in TC** (project-specific):
- 11 specialized Operations subclasses (TestOperations, IngestionOperations, etc.)
- PhaseManager (DEV/UAT/PROD orchestration)
- SchemaProvisioner (SQL file execution)
- SchemaBuildout (high-level provisioning)
- ConnectionPool, RateLimiter (optional - can extract later)

**Migration Impact**: ~60-70% code reduction in TC database module

### SPM Migration Path

**Current**: SPM has minimal stub (~50 lines)

**Benefit**: Can immediately adopt full core-db functionality

**Migration**: Replace stub Database.mjs with core-db Operations/DB2Operations

---

## Testing Plan

### Unit Tests (TODO)

1. **Operations Tests**
   - Schema qualification
   - Identifier validation
   - MassageResults normalization
   - Error handling

2. **Transform Tests**
   - Type conversions
   - Name transformations
   - Value transformations
   - Edge cases (null, undefined, malformed)

3. **Error Tests**
   - Error hierarchy
   - Code preservation
   - Original error wrapping
   - JSON serialization

### Integration Tests (TODO)

1. **DB2Operations Tests** (requires test database)
   - Connection establishment
   - Query execution
   - Transaction support
   - Error mapping

2. **Config Integration Tests**
   - DatabaseTemplate → DB2Operations
   - PhaseSchema → schema resolution
   - Credential loading

---

## Documentation TODO

1. **API Reference** - Complete API docs for all classes
2. **Architecture Guide** - Overall design and patterns
3. **Migration Guides** - TC and SPM specific guides
4. **Examples** - Working examples with real DB2
5. **Best Practices** - Recommended patterns and anti-patterns

---

## Next Steps

### Immediate (This Session)

1. ✅ ~~Create base Operations class~~
2. ✅ ~~Create Transform system~~
3. ✅ ~~Create BaseError in core-utils~~
4. 🚧 Create DB2Operations class
5. 🚧 Create ConnectString builder
6. 🚧 Create ErrorHandler
7. 🚧 Create package exports
8. 🚧 Create migration guides

### Follow-up (Next Session)

1. Create working examples
2. Add unit tests
3. Test with real DB2 instance
4. Document edge cases
5. Performance testing

---

## File Inventory

### Created Files

```
core.rescor.net/packages/
├── core-db/
│   ├── package.json                    ✅
│   ├── src/
│   │   ├── Operations.mjs              ✅ (300 lines)
│   │   ├── Transforms.mjs              ✅ (380 lines)
│   │   ├── DB2Operations.mjs           🚧 (in progress)
│   │   ├── ConnectString.mjs           ⏭️
│   │   ├── ErrorHandler.mjs            ⏭️
│   │   └── index.mjs                   ⏭️
│   ├── examples/                       ⏭️
│   └── docs/
│       └── MIGRATION-PROGRESS.md       ✅ (this file)
│
└── core-utils/
    ├── package.json                    ✅
    └── src/
        ├── index.mjs                   ✅
        └── errors/
            ├── BaseError.mjs           ✅ (150 lines)
            └── index.mjs               ✅
```

**Total Lines Created**: ~830 lines
**Estimated Remaining**: ~800-1000 lines

---

## Success Criteria

### Phase 1 (Foundation) - ✅ COMPLETE

- [x] Package structure created
- [x] Base Operations class implemented
- [x] Transform system implemented
- [x] Base error system implemented

### Phase 2 (DB2 Specific) - 🚧 IN PROGRESS

- [ ] DB2Operations implemented
- [ ] ConnectString builder implemented
- [ ] ErrorHandler implemented
- [ ] Package exports complete

### Phase 3 (Integration) - ⏭️ PENDING

- [ ] Examples created
- [ ] Migration guides written
- [ ] TC integration tested
- [ ] SPM integration tested

### Phase 4 (Production Ready) - ⏭️ PENDING

- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Documentation complete
- [ ] Performance validated

---

## Questions & Decisions Log

### Q1: Where should custom errors be defined?

**Decision**: Hybrid approach
- Common base errors in `@rescor/core-utils`
- Module-specific errors in their packages
- Module errors extend BaseError

**Rationale**: Minimal coupling, module independence, clear ownership

### Q2: Should we extract ConnectionPool from TC?

**Decision**: Defer to later phase
- Focus on core operations first
- ConnectionPool is advanced feature
- Can extract once basic operations proven

### Q3: How to handle DB2-specific validation?

**Decision**: DB2Operations overrides validateIdentifier()
- Base class has generic validation
- DB2 subclass enforces 128-char limit, DB2 charset rules
- Follows open/closed principle

---

## Lessons Learned

1. **Start with abstractions** - Base Operations class provides solid foundation
2. **Hybrid error approach works** - Best of both worlds (standardization + independence)
3. **Transform system powerful** - Eliminates hardcoded MASSAGE objects from TC
4. **Documentation critical** - Progress docs help maintain context across sessions

---

**Last Updated**: 2026-02-14
**Next Review**: After DB2Operations completion
