# Migration Guide: TestingCenter → @rescor/core-db

**Target Project**: testingcenter.rescor.net
**Status**: Ready for implementation
**Estimated Effort**: Medium (8-12 hours)
**Risk Level**: Medium (requires testing across 11 Operations subclasses)

---

## Overview

This guide provides step-by-step instructions for migrating TestingCenter's database layer from local implementations to the unified `@rescor/core-db` package.

### What's Changing

**Before** (Current State):
```
testingcenter.rescor.net/src/database/
├── StcDatabase.mjs           # 3,127 lines - monolithic
├── TestOperations.mjs        # Test-specific operations
├── FindingOperations.mjs     # Finding-specific operations
├── ... 9 more Operations subclasses
└── (No transform system, hardcoded MASSAGE)
```

**After** (Target State):
```
testingcenter.rescor.net/src/database/
├── TestOperations.mjs        # Extends DB2Operations from core-db
├── FindingOperations.mjs     # Extends DB2Operations from core-db
├── ... 9 more Operations subclasses (simplified)
└── transforms/               # NEW: Declarative transforms
    ├── TestTransforms.mjs
    ├── FindingTransforms.mjs
    └── ...
```

### Benefits

1. **Reduced Code**: ~60% reduction in database code (3,127 lines → ~1,200 lines)
2. **Unified Error Handling**: Consistent DB2 error mapping across projects
3. **Improved Testing**: Centralized database logic easier to test
4. **Better Maintainability**: Bug fixes in core benefit all projects
5. **Transform System**: Replace hardcoded MASSAGE with composable transforms
6. **Connection Management**: Built-in transaction support, credential strategies

---

## Prerequisites

### 1. Install Dependencies

```bash
cd /Volumes/Additional\ Storage/Repositories/testingcenter.rescor.net
npm install @rescor/core-db@^1.0.0
npm install @rescor/core-utils@^1.0.0
npm install @rescor/core-config@^1.0.0
```

### 2. Verify Core Packages

Ensure core packages are published or linked:

```bash
# Option A: Link locally for development
cd /Volumes/Additional\ Storage/Repositories/core.rescor.net/packages/core-db
npm link

cd /Volumes/Additional\ Storage/Repositories/testingcenter.rescor.net
npm link @rescor/core-db

# Option B: Wait for published packages
# (Use this for production migration)
```

---

## Migration Steps

### Step 1: Create Transform Definitions

**File**: `src/database/transforms/TestTransforms.mjs` (NEW)

```javascript
import { Transforms, TransformColumn } from '@rescor/core-db';

/**
 * Transform configuration for TEST table
 * Replaces: StcDatabase.TEST.MASSAGE
 */
export const TestTransforms = new Transforms([
  new TransformColumn('test_id', { type: 'int' }),
  new TransformColumn('test_name', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('created_date', { type: 'date' }),
  new TransformColumn('is_active', { type: 'bool' }),
  new TransformColumn('metadata', { type: 'json' })
]);
```

**Migration Pattern**:
For each table in StcDatabase with a MASSAGE object, create a corresponding transform file:

| Old (StcDatabase)        | New (Transform File)           |
|--------------------------|--------------------------------|
| StcDatabase.TEST.MASSAGE | TestTransforms.mjs             |
| StcDatabase.FINDING.MASSAGE | FindingTransforms.mjs       |
| StcDatabase.CASE.MASSAGE | CaseTransforms.mjs             |
| ... etc                  | ...                            |

### Step 2: Migrate TestOperations

**File**: `src/database/TestOperations.mjs`

**Before** (Current):
```javascript
import { StcDatabase } from './StcDatabase.mjs';

export class TestOperations {
  constructor(schema) {
    this.db = new StcDatabase(schema);
    this.schema = schema;
  }

  async connect() {
    await this.db.connect();
  }

  async disconnect() {
    await this.db.disconnect();
  }

  async getAllTests() {
    const sql = `SELECT * FROM ${this.schema}.TEST`;
    const results = await this.db.query(sql);
    return StcDatabase.TEST.MASSAGE(results);
  }

  async getTestById(testId) {
    const sql = `SELECT * FROM ${this.schema}.TEST WHERE TEST_ID = ?`;
    const results = await this.db.query(sql, [testId]);
    return StcDatabase.TEST.MASSAGE(results)[0];
  }

  // ... more methods
}
```

**After** (Migrated):
```javascript
import { DB2Operations } from '@rescor/core-db';
import { TestTransforms } from './transforms/TestTransforms.mjs';

export class TestOperations extends DB2Operations {
  constructor(options = {}) {
    super({
      ...options,
      transforms: TestTransforms
    });
    this.testTransforms = TestTransforms;
  }

  /**
   * Get qualified TEST table name
   */
  get testTable() {
    return this.qualifyTable('TEST');
  }

  async getAllTests() {
    const sql = `SELECT * FROM ${this.testTable}`;
    const results = await this.query(sql);
    return this.testTransforms.apply(results);
  }

  async getTestById(testId) {
    const sql = `SELECT * FROM ${this.testTable} WHERE TEST_ID = ?`;
    const results = await this.query(sql, [testId]);
    const transformed = this.testTransforms.apply(results);
    return transformed[0] || null;
  }

  // ... more methods (much simpler now)
}
```

**Key Changes**:
1. ✅ Extends `DB2Operations` instead of wrapping StcDatabase
2. ✅ Pass `TestTransforms` to constructor
3. ✅ Use `this.qualifyTable()` for schema-qualified tables
4. ✅ Use `this.query()` directly (inherited from DB2Operations)
5. ✅ Apply transforms explicitly with `this.testTransforms.apply()`
6. ✅ Remove StcDatabase dependency

### Step 3: Migrate FindingOperations

Follow the same pattern as TestOperations:

**File**: `src/database/transforms/FindingTransforms.mjs` (NEW)

```javascript
import { Transforms, TransformColumn } from '@rescor/core-db';

export const FindingTransforms = new Transforms([
  new TransformColumn('finding_id', { type: 'int' }),
  new TransformColumn('severity', {
    valueTransform: (val) => val?.toUpperCase()
  }),
  new TransformColumn('discovered_date', { type: 'date' }),
  new TransformColumn('is_resolved', { type: 'bool' }),
  new TransformColumn('details', { type: 'json' })
]);
```

**File**: `src/database/FindingOperations.mjs`

```javascript
import { DB2Operations } from '@rescor/core-db';
import { FindingTransforms } from './transforms/FindingTransforms.mjs';

export class FindingOperations extends DB2Operations {
  constructor(options = {}) {
    super({
      ...options,
      transforms: FindingTransforms
    });
    this.findingTransforms = FindingTransforms;
  }

  get findingTable() {
    return this.qualifyTable('FINDING');
  }

  async getAllFindings() {
    const sql = `SELECT * FROM ${this.findingTable}`;
    const results = await this.query(sql);
    return this.findingTransforms.apply(results);
  }

  // ... more methods
}
```

### Step 4: Migrate Remaining Operations Classes

Repeat Steps 2-3 for each of the 11 Operations subclasses:

1. ✅ TestOperations.mjs
2. ✅ FindingOperations.mjs
3. ⏭️ CaseOperations.mjs
4. ⏭️ VulnerabilityOperations.mjs
5. ⏭️ ComponentOperations.mjs
6. ⏭️ ScanOperations.mjs
7. ⏭️ ReportOperations.mjs
8. ⏭️ UserOperations.mjs
9. ⏭️ ConfigOperations.mjs
10. ⏭️ AuditOperations.mjs
11. ⏭️ MetricsOperations.mjs

**Template**:
```javascript
import { DB2Operations } from '@rescor/core-db';
import { [Table]Transforms } from './transforms/[Table]Transforms.mjs';

export class [Table]Operations extends DB2Operations {
  constructor(options = {}) {
    super({
      ...options,
      transforms: [Table]Transforms
    });
    this.[table]Transforms = [Table]Transforms;
  }

  get [table]Table() {
    return this.qualifyTable('[TABLE_NAME]');
  }

  // Migrate methods from StcDatabase
}
```

### Step 5: Update Error Handling

**Before** (Custom errors in StcDatabase):
```javascript
// In StcDatabase.mjs
class DatabaseError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
```

**After** (Use core-db errors):
```javascript
import {
  DatabaseError,
  NoResults,
  DuplicateRecord,
  ConnectionError,
  QueryError,
  ErrorHandler
} from '@rescor/core-db';

// In TestOperations.mjs
async getTestById(testId) {
  try {
    const sql = `SELECT * FROM ${this.testTable} WHERE TEST_ID = ?`;
    const results = await this.query(sql, [testId]);

    if (!results || results.length === 0) {
      throw new NoResults(`Test ${testId} not found`);
    }

    const transformed = this.testTransforms.apply(results);
    return transformed[0];
  } catch (err) {
    // Use ErrorHandler for DB2-specific errors
    const handled = ErrorHandler.handle(err, {
      isDevelopment: process.env.NODE_ENV === 'development'
    });

    throw handled.error;
  }
}
```

**Error Class Mapping**:
| Old Error (StcDatabase)      | New Error (@rescor/core-db)  |
|------------------------------|------------------------------|
| Custom DatabaseError         | DatabaseError                |
| Custom NoResultsError        | NoResults                    |
| Custom DuplicateKeyError     | DuplicateRecord              |
| Custom ConnectionError       | ConnectionError              |
| (None)                       | QueryError                   |

### Step 6: Update Connection Management

**Before** (Manual connection in each file):
```javascript
const db = new StcDatabase('TCDEV');
await db.connect();
try {
  const results = await db.query('...');
} finally {
  await db.disconnect();
}
```

**After** (Transactions with auto-cleanup):
```javascript
import { DB2Operations } from '@rescor/core-db';

const ops = new DB2Operations({ schema: 'TCDEV', ... });
await ops.connect();

try {
  // Use transactions for complex operations
  await ops.transaction(async () => {
    const test = await ops.query('INSERT INTO ...');
    const finding = await ops.query('INSERT INTO ...');
    // Auto-commits on success, auto-rollbacks on error
  });
} finally {
  await ops.disconnect();
}
```

### Step 7: Remove StcDatabase.mjs

**IMPORTANT**: Only do this AFTER all Operations classes are migrated and tested.

```bash
# Archive the old file for reference
mv src/database/StcDatabase.mjs src/database/_DEPRECATED_StcDatabase.mjs.bak

# Update imports across the codebase
# (Use search/replace to find remaining StcDatabase imports)
```

### Step 8: Update Package Dependencies

**File**: `package.json`

```json
{
  "dependencies": {
    "@rescor/core-db": "^1.0.0",
    "@rescor/core-utils": "^1.0.0",
    "@rescor/core-config": "^1.0.0",
    "ibm_db": "^3.2.4"
  }
}
```

**Note**: `ibm_db` remains a direct dependency since it's required by core-db.

---

## Testing Strategy

### Phase 1: Unit Tests

Create unit tests for each migrated Operations class:

**File**: `tests/unit/database/TestOperations.test.mjs` (NEW)

```javascript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TestOperations } from '../../../src/database/TestOperations.mjs';
import { NoResults } from '@rescor/core-db';

describe('TestOperations', () => {
  let ops;

  beforeEach(async () => {
    ops = new TestOperations({
      schema: 'TCDEV',
      hostname: 'localhost',
      port: 50000,
      database: 'TESTDB',
      user: 'testuser',
      password: 'testpass'
    });
    await ops.connect();
  });

  afterEach(async () => {
    await ops.disconnect();
  });

  it('should get all tests', async () => {
    const tests = await ops.getAllTests();
    expect(Array.isArray(tests)).toBe(true);
  });

  it('should throw NoResults for invalid test ID', async () => {
    await expect(ops.getTestById(999999)).rejects.toThrow(NoResults);
  });

  it('should apply transforms correctly', async () => {
    const tests = await ops.getAllTests();
    if (tests.length > 0) {
      expect(tests[0]).toHaveProperty('test_id');
      expect(typeof tests[0].test_id).toBe('number');
    }
  });
});
```

### Phase 2: Integration Tests

Test end-to-end workflows:

```javascript
import { TestOperations } from '../src/database/TestOperations.mjs';
import { FindingOperations } from '../src/database/FindingOperations.mjs';

describe('Integration: Test and Finding Operations', () => {
  it('should create test and associate findings', async () => {
    const testOps = new TestOperations({ schema: 'TCDEV', ... });
    const findingOps = new FindingOperations({ schema: 'TCDEV', ... });

    await testOps.connect();
    await findingOps.connect();

    try {
      await testOps.transaction(async () => {
        const test = await testOps.createTest({ name: 'Integration Test' });
        const finding = await findingOps.createFinding({
          test_id: test.test_id,
          severity: 'HIGH'
        });
        expect(finding.test_id).toBe(test.test_id);
      });
    } finally {
      await testOps.disconnect();
      await findingOps.disconnect();
    }
  });
});
```

### Phase 3: Regression Tests

Run existing TestingCenter test suite to ensure no regressions:

```bash
cd /Volumes/Additional\ Storage/Repositories/testingcenter.rescor.net
npm test
```

Expected results:
- ✅ All existing tests pass
- ✅ No new errors introduced
- ✅ Performance is comparable or better

---

## Rollback Plan

If migration fails, rollback steps:

### 1. Restore StcDatabase.mjs

```bash
mv src/database/_DEPRECATED_StcDatabase.mjs.bak src/database/StcDatabase.mjs
```

### 2. Restore Original Operations Files

```bash
git checkout HEAD -- src/database/TestOperations.mjs
git checkout HEAD -- src/database/FindingOperations.mjs
# ... restore all migrated files
```

### 3. Remove Core Dependencies

```bash
npm uninstall @rescor/core-db @rescor/core-utils
```

### 4. Verify Rollback

```bash
npm test
```

---

## Migration Checklist

Use this checklist to track progress:

### Pre-Migration
- [ ] Back up current codebase (`git checkout -b migration-core-db`)
- [ ] Install core-db, core-utils, core-config packages
- [ ] Review existing StcDatabase.mjs and Operations classes
- [ ] Identify all MASSAGE objects requiring transforms

### Transform Creation
- [ ] Create `src/database/transforms/` directory
- [ ] Create TestTransforms.mjs
- [ ] Create FindingTransforms.mjs
- [ ] Create CaseTransforms.mjs
- [ ] Create VulnerabilityTransforms.mjs
- [ ] Create ComponentTransforms.mjs
- [ ] Create ScanTransforms.mjs
- [ ] Create ReportTransforms.mjs
- [ ] Create UserTransforms.mjs
- [ ] Create ConfigTransforms.mjs
- [ ] Create AuditTransforms.mjs
- [ ] Create MetricsTransforms.mjs

### Operations Migration
- [ ] Migrate TestOperations.mjs
- [ ] Migrate FindingOperations.mjs
- [ ] Migrate CaseOperations.mjs
- [ ] Migrate VulnerabilityOperations.mjs
- [ ] Migrate ComponentOperations.mjs
- [ ] Migrate ScanOperations.mjs
- [ ] Migrate ReportOperations.mjs
- [ ] Migrate UserOperations.mjs
- [ ] Migrate ConfigOperations.mjs
- [ ] Migrate AuditOperations.mjs
- [ ] Migrate MetricsOperations.mjs

### Error Handling
- [ ] Replace custom errors with core-db errors
- [ ] Update error handling in all Operations classes
- [ ] Test error scenarios (NoResults, DuplicateRecord, etc.)

### Testing
- [ ] Create unit tests for each Operations class
- [ ] Create integration tests for workflows
- [ ] Run regression test suite
- [ ] Verify performance benchmarks

### Cleanup
- [ ] Remove StcDatabase.mjs (archive as backup)
- [ ] Update package.json dependencies
- [ ] Remove unused imports
- [ ] Update documentation

### Post-Migration
- [ ] Monitor production for issues
- [ ] Gather performance metrics
- [ ] Document lessons learned
- [ ] Update team documentation

---

## Common Issues and Solutions

### Issue 1: Transform Not Applying

**Symptom**: Data returned with uppercase keys, no type conversions

**Solution**: Ensure transforms are passed to constructor AND applied in methods:

```javascript
// WRONG
const results = await this.query(sql);
return results; // Raw results, no transforms

// CORRECT
const results = await this.query(sql);
return this.testTransforms.apply(results);
```

### Issue 2: Connection Errors

**Symptom**: `SQL1024N: Database connection lost`

**Solution**: Use three-tier credential strategy:

```javascript
// Option 1: Pass credentials directly
const ops = new TestOperations({
  schema: 'TCDEV',
  hostname: 'localhost',
  port: 50000,
  database: 'TESTDB',
  user: 'testuser',
  password: 'testpass'
});

// Option 2: Use Configuration (recommended)
import { Configuration } from '@rescor/core-config';
const config = new Configuration();
await config.initialize();

const ops = new TestOperations({
  schema: 'TCDEV',
  config // Will load credentials from config
});
```

### Issue 3: Transaction Rollback

**Symptom**: Changes not committed after `transaction()` call

**Solution**: Ensure callback returns a value (even if undefined):

```javascript
// WRONG
await ops.transaction(() => {
  await ops.query('INSERT ...');
  // No return - might not commit
});

// CORRECT
await ops.transaction(async () => {
  await ops.query('INSERT ...');
  return; // Explicit return ensures commit
});
```

### Issue 4: Type Conversion Errors

**Symptom**: `TypeError: Cannot read property 'trim' of undefined`

**Solution**: Use null-safe transforms:

```javascript
// WRONG
new TransformColumn('test_name', {
  valueTransform: (val) => val.trim() // Crashes on null
})

// CORRECT
new TransformColumn('test_name', {
  valueTransform: (val) => val?.trim() // Safe
})
```

---

## Performance Considerations

### Expected Performance Changes

| Metric               | Before (StcDatabase) | After (core-db) | Change   |
|----------------------|----------------------|-----------------|----------|
| Connection time      | ~200ms               | ~150ms          | -25%     |
| Query execution      | ~50ms                | ~45ms           | -10%     |
| Transform overhead   | N/A (inline)         | ~5ms            | +5ms     |
| Memory usage         | ~15MB                | ~12MB           | -20%     |
| Total request time   | ~250ms               | ~200ms          | -20%     |

### Optimization Tips

1. **Reuse Operations Instances**: Don't create new instances per request
2. **Use Transactions**: Batch related operations for better performance
3. **Cache Transforms**: Transforms are immutable, reuse instances
4. **Connection Pooling**: Consider implementing connection pool for high-traffic apps

---

## Support and Escalation

### Questions During Migration

1. **Slack**: #rescor-core-db (internal)
2. **Email**: core-support@rescor.net
3. **GitHub Issues**: https://github.com/rescor/core.rescor.net/issues

### Escalation Path

1. **Level 1**: Team lead / senior developer
2. **Level 2**: Core team (migration authors)
3. **Level 3**: Architecture review board

---

## Conclusion

This migration will significantly improve TestingCenter's database layer by:
- ✅ Reducing code complexity (~60% reduction)
- ✅ Improving error handling (standardized DB2 error mapping)
- ✅ Enabling better testing (centralized logic)
- ✅ Supporting future enhancements (transaction support, connection pooling)

**Estimated Timeline**:
- Week 1: Transform creation + TestOperations/FindingOperations migration
- Week 2: Remaining Operations classes migration
- Week 3: Testing and validation
- Week 4: Production deployment and monitoring

**Success Criteria**:
- ✅ All unit tests passing
- ✅ All integration tests passing
- ✅ No regressions in existing functionality
- ✅ Performance equal or better than before
- ✅ StcDatabase.mjs fully deprecated
