/**
 * Example: Unified API with ClassifiedDatum/ClassifiedData
 *
 * Demonstrates Phase 1 implementation of ClassifiedDatum-based API
 */

import { MemoryStore } from '../src/stores/MemoryStore.mjs';
import { ClassifiedDatum, ClassifiedData, Classified } from '../src/ClassifiedDatum.mjs';

async function main() {
  console.log('=== Unified API Example ===\n');

  const store = new MemoryStore({ enableTTL: false });
  await store.initialize();

  // ============================================================================
  // Example 1: Single datum operations
  // ============================================================================
  console.log('1. Single Datum Operations:');

  // Store a credential (password)
  const password = ClassifiedDatum.credential('database', 'password').with('super-secret-123');
  await store.store(password);
  console.log(`   ✓ Stored ${password.fullKey} (${password.classificationName})`);

  // Store a setting (hostname)
  const hostname = ClassifiedDatum.setting('database', 'hostname').with('db.example.com');
  await store.store(hostname);
  console.log(`   ✓ Stored ${hostname.fullKey} (${hostname.classificationName})`);

  // Get credential
  const retrievedPassword = await store.get(ClassifiedDatum.credential('database', 'password'));
  console.log(`   ✓ Retrieved password: ${retrievedPassword}`);

  // Get setting
  const retrievedHostname = await store.get(ClassifiedDatum.setting('database', 'hostname'));
  console.log(`   ✓ Retrieved hostname: ${retrievedHostname}\n`);

  // ============================================================================
  // Example 2: Batch operations with ClassifiedData
  // ============================================================================
  console.log('2. Batch Operations (ClassifiedData):');

  // Define database configuration schema
  const dbConfig = new ClassifiedData([
    ClassifiedDatum.setting('database', 'hostname'),
    ClassifiedDatum.setting('database', 'port'),
    ClassifiedDatum.setting('database', 'database'),
    ClassifiedDatum.credential('database', 'user'),
    ClassifiedDatum.credential('database', 'password')
  ]);

  // Store all at once
  dbConfig.setValue('database', 'hostname', 'db.example.com');
  dbConfig.setValue('database', 'port', '50000');
  dbConfig.setValue('database', 'database', 'TESTDB');
  dbConfig.setValue('database', 'user', 'admin');
  dbConfig.setValue('database', 'password', 'super-secret-123');

  await store.store(dbConfig);
  console.log(`   ✓ Stored ${dbConfig.size} database configuration items`);

  // Retrieve all at once
  const loadedConfig = new ClassifiedData([
    ClassifiedDatum.setting('database', 'hostname'),
    ClassifiedDatum.setting('database', 'port'),
    ClassifiedDatum.setting('database', 'database'),
    ClassifiedDatum.credential('database', 'user'),
    ClassifiedDatum.credential('database', 'password')
  ]);

  await store.get(loadedConfig);

  console.log('   ✓ Retrieved configuration:');
  console.log(`      - hostname: ${loadedConfig.getValue('database', 'hostname')}`);
  console.log(`      - port: ${loadedConfig.getValue('database', 'port')}`);
  console.log(`      - database: ${loadedConfig.getValue('database', 'database')}`);
  console.log(`      - user: ${loadedConfig.getValue('database', 'user')}`);
  console.log(`      - password: ${loadedConfig.getValue('database', 'password')}\n`);

  // ============================================================================
  // Example 3: Validation
  // ============================================================================
  console.log('3. Configuration Validation:');

  try {
    loadedConfig.validate();
    console.log('   ✓ All required configuration present\n');
  } catch (err) {
    console.log(`   ✗ Validation failed: ${err.message}\n`);
  }

  // ============================================================================
  // Example 4: Classification-based filtering
  // ============================================================================
  console.log('4. Classification-Based Filtering:');

  const allItems = await store._listByDomain('database');
  console.log(`   ✓ Total items: ${allItems.size}`);
  console.log(`   ✓ Credentials: ${allItems.credentials.length}`);
  console.log(`   ✓ Settings: ${allItems.settings.length}`);

  console.log('   Credentials:');
  for (const cred of allItems.credentials) {
    console.log(`      - ${cred.fullKey} (TTL: ${cred.recommendedTTL}ms)`);
  }

  console.log('   Settings:');
  for (const setting of allItems.settings) {
    console.log(`      - ${setting.fullKey} (TTL: ${setting.recommendedTTL}ms)`);
  }
  console.log();

  // ============================================================================
  // Example 5: Auto-detection of classification
  // ============================================================================
  console.log('5. Auto-Detection of Classification:');

  const autoItems = [
    ClassifiedDatum.auto('api', 'nvd_key'),          // → CREDENTIAL (has 'key')
    ClassifiedDatum.auto('api', 'base_url'),         // → SETTING
    ClassifiedDatum.auto('user', 'email'),           // → PERSONAL (PII)
    ClassifiedDatum.auto('smtp', 'password'),        // → CREDENTIAL (has 'password')
    ClassifiedDatum.auto('smtp', 'host')             // → SETTING
  ];

  for (const item of autoItems) {
    console.log(`   ${item.fullKey} → ${item.classificationName} (TTL: ${item.recommendedTTL}ms)`);
  }
  console.log();

  // ============================================================================
  // Example 6: Backward compatibility (legacy API still works)
  // ============================================================================
  console.log('6. Backward Compatibility (Legacy API):');

  // Old API still works (uses unified API under the hood)
  await store.storeCredential('legacy', 'api_key', 'old-style-key');
  const legacyKey = await store.getCredential('legacy', 'api_key');
  console.log(`   ✓ Legacy getCredential: ${legacyKey}`);

  await store.storeConfiguration('legacy', 'timeout', '5000');
  const legacyTimeout = await store.getConfiguration('legacy', 'timeout');
  console.log(`   ✓ Legacy getConfiguration: ${legacyTimeout}\n`);

  // ============================================================================
  // Example 7: Structured configuration class
  // ============================================================================
  console.log('7. Structured Configuration Class:');

  class DatabaseConfig extends ClassifiedData {
    constructor() {
      super([
        ClassifiedDatum.setting('database', 'hostname'),
        ClassifiedDatum.setting('database', 'port'),
        ClassifiedDatum.credential('database', 'user'),
        ClassifiedDatum.credential('database', 'password')
      ]);
    }

    async load(store) {
      await store.get(this);
      this.validate();
      return {
        hostname: this.getValue('database', 'hostname'),
        port: parseInt(this.getValue('database', 'port')),
        user: this.getValue('database', 'user'),
        password: this.getValue('database', 'password')
      };
    }
  }

  const structuredConfig = new DatabaseConfig();
  const config = await structuredConfig.load(store);
  console.log('   ✓ Loaded structured config:', config);

  console.log('\n=== Example Complete ===');
}

main().catch(console.error);
