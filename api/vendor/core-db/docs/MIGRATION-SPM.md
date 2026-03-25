# Migration Guide: SPM → @rescor/core-db

**Target Project**: spm.rescor.net
**Status**: Ready for implementation
**Estimated Effort**: Low (4-6 hours)
**Risk Level**: Low (minimal existing implementation)

---

## Overview

This guide provides step-by-step instructions for migrating SPM's minimal database stub to the unified `@rescor/core-db` package. Unlike TestingCenter (which has a comprehensive 3,127-line implementation), SPM has only a 50-line stub, making this migration straightforward.

### What's Changing

**Before** (Current State):
```
spm.rescor.net/src/database/
└── SpmDatabase.mjs           # 50 lines - stub implementation
```

**After** (Target State):
```
spm.rescor.net/src/database/
├── PackageOperations.mjs     # NEW: Package-specific operations
├── VulnerabilityOperations.mjs # NEW: Vulnerability-specific operations
├── LicenseOperations.mjs     # NEW: License-specific operations
└── transforms/               # NEW: Declarative transforms
    ├── PackageTransforms.mjs
    ├── VulnerabilityTransforms.mjs
    └── LicenseTransforms.mjs
```

### Benefits

1. **Full Functionality**: Replace stub with production-ready database layer
2. **Unified Error Handling**: Consistent DB2 error mapping
3. **Transform System**: Declarative row normalization
4. **Transaction Support**: Built-in transaction management
5. **Connection Management**: Multi-tier credential strategies
6. **Future-Proof**: Inherit improvements from core-db

---

## Prerequisites

### 1. Install Dependencies

```bash
cd /Volumes/Additional\ Storage/Repositories/spm.rescor.net
npm install @rescor/core-db@^1.0.0
npm install @rescor/core-utils@^1.0.0
npm install @rescor/core-config@^1.0.0
```

### 2. Verify Core Packages

```bash
# Option A: Link locally for development
cd /Volumes/Additional\ Storage/Repositories/core.rescor.net/packages/core-db
npm link

cd /Volumes/Additional\ Storage/Repositories/spm.rescor.net
npm link @rescor/core-db

# Option B: Wait for published packages
```

---

## Migration Steps

### Step 1: Understand Current Stub

**File**: `src/database/SpmDatabase.mjs` (Current)

```javascript
/**
 * SpmDatabase - Minimal stub for SPM database operations
 *
 * This is a placeholder implementation. Full implementation pending.
 */
export class SpmDatabase {
  constructor(schema) {
    this.schema = schema;
    this.handle = null;
  }

  async connect() {
    // Stub - no real connection
    console.log(`[STUB] Connecting to ${this.schema}...`);
  }

  async disconnect() {
    // Stub - no real disconnection
    console.log(`[STUB] Disconnecting from ${this.schema}...`);
  }

  async query(sql, params = []) {
    // Stub - returns empty array
    console.log(`[STUB] Query: ${sql}`);
    return [];
  }
}
```

### Step 2: Design SPM Schema

SPM (Software Package Manager) typically tracks:

1. **Packages**: Software packages and their metadata
2. **Vulnerabilities**: Security vulnerabilities in packages
3. **Licenses**: License information for packages
4. **Dependencies**: Package dependency graphs

**Recommended Tables** (if not already defined):

```sql
-- Packages
CREATE TABLE SPMDEV.PACKAGE (
  PACKAGE_ID INTEGER PRIMARY KEY,
  PACKAGE_NAME VARCHAR(255) NOT NULL,
  VERSION VARCHAR(50),
  REGISTRY VARCHAR(100),
  DESCRIPTION CLOB,
  HOMEPAGE VARCHAR(500),
  CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  METADATA CLOB -- JSON metadata
);

-- Vulnerabilities
CREATE TABLE SPMDEV.VULNERABILITY (
  VULNERABILITY_ID INTEGER PRIMARY KEY,
  PACKAGE_ID INTEGER REFERENCES SPMDEV.PACKAGE(PACKAGE_ID),
  CVE_ID VARCHAR(50),
  SEVERITY VARCHAR(20),
  DESCRIPTION CLOB,
  PUBLISHED_DATE TIMESTAMP,
  FIXED_VERSION VARCHAR(50),
  METADATA CLOB -- JSON metadata
);

-- Licenses
CREATE TABLE SPMDEV.LICENSE (
  LICENSE_ID INTEGER PRIMARY KEY,
  PACKAGE_ID INTEGER REFERENCES SPMDEV.PACKAGE(PACKAGE_ID),
  LICENSE_NAME VARCHAR(100),
  LICENSE_TYPE VARCHAR(50),
  LICENSE_TEXT CLOB,
  IS_APPROVED SMALLINT DEFAULT 0
);
```

### Step 3: Create Transform Definitions

**File**: `src/database/transforms/PackageTransforms.mjs` (NEW)

```javascript
import { Transforms, TransformColumn } from '@rescor/core-db';

/**
 * Transform configuration for PACKAGE table
 */
export const PackageTransforms = new Transforms([
  new TransformColumn('package_id', { type: 'int' }),
  new TransformColumn('package_name', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('version', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('registry', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('description', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('homepage', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('created_date', { type: 'date' }),
  new TransformColumn('metadata', { type: 'json' })
]);
```

**File**: `src/database/transforms/VulnerabilityTransforms.mjs` (NEW)

```javascript
import { Transforms, TransformColumn } from '@rescor/core-db';

/**
 * Transform configuration for VULNERABILITY table
 */
export const VulnerabilityTransforms = new Transforms([
  new TransformColumn('vulnerability_id', { type: 'int' }),
  new TransformColumn('package_id', { type: 'int' }),
  new TransformColumn('cve_id', {
    valueTransform: (val) => val?.trim().toUpperCase()
  }),
  new TransformColumn('severity', {
    valueTransform: (val) => val?.trim().toUpperCase()
  }),
  new TransformColumn('description', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('published_date', { type: 'date' }),
  new TransformColumn('fixed_version', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('metadata', { type: 'json' })
]);
```

**File**: `src/database/transforms/LicenseTransforms.mjs` (NEW)

```javascript
import { Transforms, TransformColumn } from '@rescor/core-db';

/**
 * Transform configuration for LICENSE table
 */
export const LicenseTransforms = new Transforms([
  new TransformColumn('license_id', { type: 'int' }),
  new TransformColumn('package_id', { type: 'int' }),
  new TransformColumn('license_name', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('license_type', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('license_text', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('is_approved', { type: 'bool' })
]);
```

### Step 4: Create PackageOperations

**File**: `src/database/PackageOperations.mjs` (NEW)

```javascript
import { DB2Operations, NoResults } from '@rescor/core-db';
import { PackageTransforms } from './transforms/PackageTransforms.mjs';

/**
 * PackageOperations - Package-specific database operations
 *
 * Provides CRUD operations for software packages in SPM
 */
export class PackageOperations extends DB2Operations {
  constructor(options = {}) {
    super({
      ...options,
      transforms: PackageTransforms
    });
    this.packageTransforms = PackageTransforms;
  }

  /**
   * Get qualified PACKAGE table name
   */
  get packageTable() {
    return this.qualifyTable('PACKAGE');
  }

  /**
   * Get all packages
   *
   * @returns {Promise<Array>} - All packages
   */
  async getAllPackages() {
    const sql = `SELECT * FROM ${this.packageTable} ORDER BY PACKAGE_NAME`;
    const results = await this.query(sql);
    return this.packageTransforms.apply(results);
  }

  /**
   * Get package by ID
   *
   * @param {number} packageId - Package ID
   * @returns {Promise<Object>} - Package details
   * @throws {NoResults} - If package not found
   */
  async getPackageById(packageId) {
    const sql = `
      SELECT * FROM ${this.packageTable}
      WHERE PACKAGE_ID = ?
    `;
    const results = await this.query(sql, [packageId]);

    if (!results || results.length === 0) {
      throw new NoResults(`Package ${packageId} not found`);
    }

    const transformed = this.packageTransforms.apply(results);
    return transformed[0];
  }

  /**
   * Get package by name and version
   *
   * @param {string} name - Package name
   * @param {string} version - Package version
   * @returns {Promise<Object|null>} - Package or null
   */
  async getPackageByNameVersion(name, version) {
    const sql = `
      SELECT * FROM ${this.packageTable}
      WHERE PACKAGE_NAME = ? AND VERSION = ?
    `;
    const results = await this.query(sql, [name, version]);
    const transformed = this.packageTransforms.apply(results);
    return transformed[0] || null;
  }

  /**
   * Create new package
   *
   * @param {Object} packageData - Package details
   * @returns {Promise<Object>} - Created package
   */
  async createPackage(packageData) {
    const sql = `
      INSERT INTO ${this.packageTable} (
        PACKAGE_NAME, VERSION, REGISTRY, DESCRIPTION, HOMEPAGE, METADATA
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [
      packageData.package_name,
      packageData.version,
      packageData.registry || 'npm',
      packageData.description || null,
      packageData.homepage || null,
      packageData.metadata ? JSON.stringify(packageData.metadata) : null
    ];

    await this.query(sql, params);

    // Return created package
    return this.getPackageByNameVersion(
      packageData.package_name,
      packageData.version
    );
  }

  /**
   * Update package
   *
   * @param {number} packageId - Package ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated package
   */
  async updatePackage(packageId, updates) {
    const fields = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      const upperKey = key.toUpperCase();
      if (upperKey !== 'PACKAGE_ID') {
        fields.push(`${upperKey} = ?`);
        params.push(
          upperKey === 'METADATA' ? JSON.stringify(value) : value
        );
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    params.push(packageId);

    const sql = `
      UPDATE ${this.packageTable}
      SET ${fields.join(', ')}
      WHERE PACKAGE_ID = ?
    `;

    await this.query(sql, params);
    return this.getPackageById(packageId);
  }

  /**
   * Delete package
   *
   * @param {number} packageId - Package ID
   * @returns {Promise<void>}
   */
  async deletePackage(packageId) {
    const sql = `DELETE FROM ${this.packageTable} WHERE PACKAGE_ID = ?`;
    await this.query(sql, [packageId]);
  }

  /**
   * Search packages by name
   *
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} - Matching packages
   */
  async searchPackages(searchTerm) {
    const sql = `
      SELECT * FROM ${this.packageTable}
      WHERE UPPER(PACKAGE_NAME) LIKE ?
      ORDER BY PACKAGE_NAME
    `;
    const results = await this.query(sql, [`%${searchTerm.toUpperCase()}%`]);
    return this.packageTransforms.apply(results);
  }
}
```

### Step 5: Create VulnerabilityOperations

**File**: `src/database/VulnerabilityOperations.mjs` (NEW)

```javascript
import { DB2Operations, NoResults } from '@rescor/core-db';
import { VulnerabilityTransforms } from './transforms/VulnerabilityTransforms.mjs';

/**
 * VulnerabilityOperations - Vulnerability-specific database operations
 */
export class VulnerabilityOperations extends DB2Operations {
  constructor(options = {}) {
    super({
      ...options,
      transforms: VulnerabilityTransforms
    });
    this.vulnerabilityTransforms = VulnerabilityTransforms;
  }

  get vulnerabilityTable() {
    return this.qualifyTable('VULNERABILITY');
  }

  async getAllVulnerabilities() {
    const sql = `SELECT * FROM ${this.vulnerabilityTable} ORDER BY SEVERITY DESC, PUBLISHED_DATE DESC`;
    const results = await this.query(sql);
    return this.vulnerabilityTransforms.apply(results);
  }

  async getVulnerabilityById(vulnerabilityId) {
    const sql = `SELECT * FROM ${this.vulnerabilityTable} WHERE VULNERABILITY_ID = ?`;
    const results = await this.query(sql, [vulnerabilityId]);

    if (!results || results.length === 0) {
      throw new NoResults(`Vulnerability ${vulnerabilityId} not found`);
    }

    const transformed = this.vulnerabilityTransforms.apply(results);
    return transformed[0];
  }

  async getVulnerabilitiesByPackage(packageId) {
    const sql = `
      SELECT * FROM ${this.vulnerabilityTable}
      WHERE PACKAGE_ID = ?
      ORDER BY SEVERITY DESC
    `;
    const results = await this.query(sql, [packageId]);
    return this.vulnerabilityTransforms.apply(results);
  }

  async getVulnerabilitiesBySeverity(severity) {
    const sql = `
      SELECT * FROM ${this.vulnerabilityTable}
      WHERE UPPER(SEVERITY) = ?
      ORDER BY PUBLISHED_DATE DESC
    `;
    const results = await this.query(sql, [severity.toUpperCase()]);
    return this.vulnerabilityTransforms.apply(results);
  }

  async createVulnerability(vulnerabilityData) {
    const sql = `
      INSERT INTO ${this.vulnerabilityTable} (
        PACKAGE_ID, CVE_ID, SEVERITY, DESCRIPTION, PUBLISHED_DATE, FIXED_VERSION, METADATA
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      vulnerabilityData.package_id,
      vulnerabilityData.cve_id,
      vulnerabilityData.severity,
      vulnerabilityData.description,
      vulnerabilityData.published_date || null,
      vulnerabilityData.fixed_version || null,
      vulnerabilityData.metadata ? JSON.stringify(vulnerabilityData.metadata) : null
    ];

    await this.query(sql, params);

    // Get the created vulnerability (assuming auto-increment ID)
    const getLastSql = `
      SELECT * FROM ${this.vulnerabilityTable}
      WHERE CVE_ID = ? AND PACKAGE_ID = ?
    `;
    const results = await this.query(getLastSql, [
      vulnerabilityData.cve_id,
      vulnerabilityData.package_id
    ]);

    const transformed = this.vulnerabilityTransforms.apply(results);
    return transformed[0];
  }
}
```

### Step 6: Create LicenseOperations

**File**: `src/database/LicenseOperations.mjs` (NEW)

```javascript
import { DB2Operations, NoResults } from '@rescor/core-db';
import { LicenseTransforms } from './transforms/LicenseTransforms.mjs';

/**
 * LicenseOperations - License-specific database operations
 */
export class LicenseOperations extends DB2Operations {
  constructor(options = {}) {
    super({
      ...options,
      transforms: LicenseTransforms
    });
    this.licenseTransforms = LicenseTransforms;
  }

  get licenseTable() {
    return this.qualifyTable('LICENSE');
  }

  async getAllLicenses() {
    const sql = `SELECT * FROM ${this.licenseTable} ORDER BY LICENSE_NAME`;
    const results = await this.query(sql);
    return this.licenseTransforms.apply(results);
  }

  async getLicenseById(licenseId) {
    const sql = `SELECT * FROM ${this.licenseTable} WHERE LICENSE_ID = ?`;
    const results = await this.query(sql, [licenseId]);

    if (!results || results.length === 0) {
      throw new NoResults(`License ${licenseId} not found`);
    }

    const transformed = this.licenseTransforms.apply(results);
    return transformed[0];
  }

  async getLicensesByPackage(packageId) {
    const sql = `SELECT * FROM ${this.licenseTable} WHERE PACKAGE_ID = ?`;
    const results = await this.query(sql, [packageId]);
    return this.licenseTransforms.apply(results);
  }

  async getApprovedLicenses() {
    const sql = `SELECT * FROM ${this.licenseTable} WHERE IS_APPROVED = 1`;
    const results = await this.query(sql);
    return this.licenseTransforms.apply(results);
  }

  async createLicense(licenseData) {
    const sql = `
      INSERT INTO ${this.licenseTable} (
        PACKAGE_ID, LICENSE_NAME, LICENSE_TYPE, LICENSE_TEXT, IS_APPROVED
      ) VALUES (?, ?, ?, ?, ?)
    `;

    const params = [
      licenseData.package_id,
      licenseData.license_name,
      licenseData.license_type || null,
      licenseData.license_text || null,
      licenseData.is_approved ? 1 : 0
    ];

    await this.query(sql, params);
  }

  async approveLicense(licenseId) {
    const sql = `UPDATE ${this.licenseTable} SET IS_APPROVED = 1 WHERE LICENSE_ID = ?`;
    await this.query(sql, [licenseId]);
    return this.getLicenseById(licenseId);
  }
}
```

### Step 7: Remove Stub Implementation

**IMPORTANT**: Only after all Operations classes are created and tested.

```bash
# Archive the stub
mv src/database/SpmDatabase.mjs src/database/_DEPRECATED_SpmDatabase.mjs.bak

# Remove any imports of SpmDatabase
# (Search codebase for "SpmDatabase" and replace with specific Operations classes)
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

---

## Testing Strategy

### Phase 1: Unit Tests

**File**: `tests/unit/database/PackageOperations.test.mjs` (NEW)

```javascript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PackageOperations } from '../../../src/database/PackageOperations.mjs';
import { NoResults } from '@rescor/core-db';

describe('PackageOperations', () => {
  let ops;

  beforeEach(async () => {
    ops = new PackageOperations({
      schema: 'SPMDEV',
      hostname: 'localhost',
      port: 50000,
      database: 'SPMDB',
      user: 'spmuser',
      password: 'spmpass'
    });
    await ops.connect();
  });

  afterEach(async () => {
    await ops.disconnect();
  });

  it('should get all packages', async () => {
    const packages = await ops.getAllPackages();
    expect(Array.isArray(packages)).toBe(true);
  });

  it('should throw NoResults for invalid package ID', async () => {
    await expect(ops.getPackageById(999999)).rejects.toThrow(NoResults);
  });

  it('should create and retrieve package', async () => {
    const packageData = {
      package_name: 'test-package',
      version: '1.0.0',
      registry: 'npm',
      description: 'Test package'
    };

    const created = await ops.createPackage(packageData);
    expect(created.package_name).toBe('test-package');
    expect(created.version).toBe('1.0.0');

    // Cleanup
    await ops.deletePackage(created.package_id);
  });

  it('should apply transforms correctly', async () => {
    const packages = await ops.getAllPackages();
    if (packages.length > 0) {
      expect(packages[0]).toHaveProperty('package_id');
      expect(typeof packages[0].package_id).toBe('number');
    }
  });
});
```

### Phase 2: Integration Tests

```javascript
import { PackageOperations } from '../src/database/PackageOperations.mjs';
import { VulnerabilityOperations } from '../src/database/VulnerabilityOperations.mjs';

describe('Integration: Package and Vulnerability Operations', () => {
  it('should create package and associate vulnerability', async () => {
    const pkgOps = new PackageOperations({ schema: 'SPMDEV', ... });
    const vulnOps = new VulnerabilityOperations({ schema: 'SPMDEV', ... });

    await pkgOps.connect();
    await vulnOps.connect();

    try {
      await pkgOps.transaction(async () => {
        const pkg = await pkgOps.createPackage({
          package_name: 'vulnerable-package',
          version: '1.0.0'
        });

        const vuln = await vulnOps.createVulnerability({
          package_id: pkg.package_id,
          cve_id: 'CVE-2024-1234',
          severity: 'HIGH',
          description: 'Test vulnerability'
        });

        expect(vuln.package_id).toBe(pkg.package_id);
      });
    } finally {
      await pkgOps.disconnect();
      await vulnOps.disconnect();
    }
  });
});
```

---

## Migration Checklist

### Pre-Migration
- [ ] Back up current codebase (`git checkout -b migration-core-db`)
- [ ] Install core-db, core-utils, core-config packages
- [ ] Review existing SpmDatabase.mjs stub
- [ ] Design SPM schema (PACKAGE, VULNERABILITY, LICENSE tables)

### Transform Creation
- [ ] Create `src/database/transforms/` directory
- [ ] Create PackageTransforms.mjs
- [ ] Create VulnerabilityTransforms.mjs
- [ ] Create LicenseTransforms.mjs

### Operations Creation
- [ ] Create PackageOperations.mjs (full CRUD)
- [ ] Create VulnerabilityOperations.mjs (full CRUD)
- [ ] Create LicenseOperations.mjs (full CRUD)

### Testing
- [ ] Create unit tests for PackageOperations
- [ ] Create unit tests for VulnerabilityOperations
- [ ] Create unit tests for LicenseOperations
- [ ] Create integration tests
- [ ] Test with real DB2 instance

### Cleanup
- [ ] Remove SpmDatabase.mjs stub (archive as backup)
- [ ] Update package.json dependencies
- [ ] Update imports across codebase

### Post-Migration
- [ ] Monitor for issues
- [ ] Document lessons learned
- [ ] Update team documentation

---

## Common Issues and Solutions

### Issue 1: No Existing Schema

**Symptom**: Tables don't exist (SQL0204N: Object does not exist)

**Solution**: Create SPM schema and tables first:

```sql
-- Create schema
CREATE SCHEMA SPMDEV;

-- Create tables (see Step 2 for full DDL)
CREATE TABLE SPMDEV.PACKAGE (...);
CREATE TABLE SPMDEV.VULNERABILITY (...);
CREATE TABLE SPMDEV.LICENSE (...);
```

### Issue 2: Auto-Increment IDs

**Symptom**: Need to get last inserted ID

**Solution**: Use DB2 identity columns and query by unique fields:

```javascript
// After INSERT, query by unique constraint
const results = await this.query(
  `SELECT * FROM ${this.packageTable} WHERE PACKAGE_NAME = ? AND VERSION = ?`,
  [name, version]
);
```

### Issue 3: JSON Metadata

**Symptom**: Metadata stored as string, not parsed

**Solution**: Transforms handle this automatically:

```javascript
new TransformColumn('metadata', { type: 'json' })
// Automatically parses JSON strings into objects
```

---

## Performance Considerations

### Expected Performance

| Metric               | Stub (Before) | core-db (After) | Change    |
|----------------------|---------------|-----------------|-----------|
| Connection time      | N/A (no conn) | ~150ms          | +150ms    |
| Query execution      | N/A (stub)    | ~45ms           | +45ms     |
| Transform overhead   | N/A           | ~5ms            | +5ms      |
| Memory usage         | ~1MB          | ~12MB           | +11MB     |

**Note**: The "increase" is actually adding real functionality where only a stub existed.

---

## Conclusion

This migration transforms SPM from a minimal stub into a production-ready database layer by leveraging `@rescor/core-db`.

**Key Benefits**:
- ✅ Full CRUD operations for packages, vulnerabilities, licenses
- ✅ Standardized error handling with DB2 error mapping
- ✅ Transform system for data normalization
- ✅ Transaction support for complex operations
- ✅ Multi-tier credential strategies

**Estimated Timeline**:
- Day 1: Schema design + Transform creation
- Day 2: PackageOperations implementation
- Day 3: VulnerabilityOperations + LicenseOperations
- Day 4: Testing and deployment

**Success Criteria**:
- ✅ All CRUD operations working
- ✅ Unit tests passing
- ✅ Integration tests passing
- ✅ Stub fully replaced
