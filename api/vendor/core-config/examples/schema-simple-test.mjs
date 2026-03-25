/**
 * Simple Schema Test (No External Dependencies)
 *
 * Tests the Schema system using only MemoryStore
 */

// Import specific modules to avoid Infisical dependency
import { DatabaseSchema } from '../src/schemas/DatabaseSchema.mjs';
import { ApiSchema } from '../src/schemas/ApiSchema.mjs';
import { PhaseSchema } from '../src/schemas/PhaseSchema.mjs';
import { defaultRegistry } from '../src/SchemaRegistry.mjs';
import { MemoryStore } from '../src/stores/MemoryStore.mjs';
import { Configuration } from '../src/Configuration.mjs';

console.log('=== Testing Schema System ===\n');

// Create configuration with MemoryStore (no external dependencies)
const config = new Configuration({ store: new MemoryStore() });

// Test 1: DatabaseSchema
console.log('Test 1: DatabaseSchema');
const dbSchema = new DatabaseSchema();

await dbSchema.save(config, {
  database: {
    hostname: 'localhost',
    port: '50000',
    database: 'TESTDB',
    protocol: 'TCPIP',
    user: 'admin',
    password: 'testpass123'
  }
});

const db = await dbSchema.load(config);
console.log('  ✓ Loaded database config');
console.log('  ✓ Port type:', typeof db.port, '=', db.port);
console.log('  ✓ Connection string generated:', db.connectionString.substring(0, 50) + '...');

if (typeof db.port !== 'number') {
  throw new Error('Port should be a number!');
}
if (db.port !== 50000) {
  throw new Error('Port should be 50000!');
}

// Test 2: ApiSchema
console.log('\nTest 2: ApiSchema');
const apiSchema = new ApiSchema({ apis: ['nvd', 'github'] });

await apiSchema.save(config, {
  api: {
    nvd_base_url: 'https://services.nvd.nist.gov/rest/json',
    nvd_key: 'test-nvd-key-12345',
    github_base_url: 'https://api.github.com',
    github_key: 'ghp_test123456789'
  }
});

const apis = await apiSchema.load(config);
console.log('  ✓ Loaded API config');
console.log('  ✓ NVD configured:', apiSchema.hasApi('nvd'));
console.log('  ✓ GitHub configured:', apiSchema.hasApi('github'));
console.log('  ✓ Safe config:', JSON.stringify(apiSchema.getSafeConfig(), null, 2).substring(0, 100) + '...');

// Test 3: PhaseSchema
console.log('\nTest 3: PhaseSchema');
const phaseSchema = new PhaseSchema({ projectPrefix: 'TC' });

await phaseSchema.save(config, {
  app: {
    phase: 'DEV',
    project_prefix: 'TC',
    log_level: 'debug'
  }
});

const phase = await phaseSchema.load(config);
console.log('  ✓ Loaded phase config');
console.log('  ✓ Schema name:', phase.schema);
console.log('  ✓ Is development:', phase.isDevelopment);
console.log('  ✓ Is production:', phase.isProduction);

if (phase.schema !== 'TCDEV') {
  throw new Error('Schema should be TCDEV!');
}
if (!phase.isDevelopment) {
  throw new Error('Should be development!');
}

// Test 4: Schema Registry
console.log('\nTest 4: Schema Registry');
console.log('  ✓ Available schemas:', defaultRegistry.list());

const dbViaRegistry = await defaultRegistry.load('database', config);
console.log('  ✓ Loaded database via registry');
console.log('  ✓ Database name:', dbViaRegistry.database);

if (dbViaRegistry.database !== 'TESTDB') {
  throw new Error('Database name should be TESTDB!');
}

// Test 5: Validation
console.log('\nTest 5: Validation');
const newDbSchema = new DatabaseSchema({ domain: 'test_db' });

let isComplete = await newDbSchema.isComplete(config);
console.log('  ✓ Incomplete schema detected:', !isComplete);

if (isComplete) {
  throw new Error('Schema should be incomplete!');
}

// Test 6: Metadata
console.log('\nTest 6: Metadata');
const metadata = dbSchema.getMetadata();
console.log('  ✓ Schema name:', metadata.name);
console.log('  ✓ Item count:', metadata.itemCount);
console.log('  ✓ Credentials count:', metadata.credentials);
console.log('  ✓ Settings count:', metadata.settings);

const fields = dbSchema.getRequiredFields();
console.log('  ✓ Required fields:', fields.length);

// Test 7: Custom Schema
console.log('\nTest 7: Custom Schema');

import { Schema } from '../src/Schema.mjs';
import { ClassifiedDatum } from '../src/ClassifiedDatum.mjs';

class TestSchema extends Schema {
  constructor() {
    super([
      ClassifiedDatum.setting('test', 'value1'),
      ClassifiedDatum.setting('test', 'value2')
    ]);
  }

  toTypedObject() {
    return {
      value1: this.getValue('test', 'value1'),
      value2: parseInt(this.getValue('test', 'value2'))
    };
  }
}

const testSchema = new TestSchema();
await testSchema.save(config, {
  test: {
    value1: 'hello',
    value2: '42'
  }
});

const test = await testSchema.load(config);
console.log('  ✓ Custom schema loaded');
console.log('  ✓ value1:', test.value1);
console.log('  ✓ value2:', test.value2, '(type:', typeof test.value2 + ')');

if (typeof test.value2 !== 'number') {
  throw new Error('value2 should be a number!');
}

console.log('\n=== All Tests Passed! ✅ ===\n');
