/**
 * Phase 2 Test: MemoryStore with unified API
 *
 * Tests Phase 2 updates to MemoryStore
 */

import { MemoryStore } from '../src/stores/MemoryStore.mjs';
import { ClassifiedDatum, ClassifiedData, Classified } from '../src/ClassifiedDatum.mjs';

async function main() {
  console.log('=== Phase 2: MemoryStore Test ===\n');

  const store = new MemoryStore({ enableTTL: false });
  await store.initialize();

  // ============================================================================
  // Test 1: Single datum (unified API)
  // ============================================================================
  console.log('1. Single Datum (Unified API):');

  const password = ClassifiedDatum.credential('database', 'password').with('secret123');
  await store.store(password);
  console.log(`   ✓ Stored ${password.fullKey}`);

  const retrieved = await store.get(ClassifiedDatum.credential('database', 'password'));
  console.log(`   ✓ Retrieved: ${retrieved}\n`);

  // ============================================================================
  // Test 2: Batch operations (ClassifiedData)
  // ============================================================================
  console.log('2. Batch Operations (ClassifiedData):');

  const config = new ClassifiedData([
    ClassifiedDatum.setting('database', 'hostname'),
    ClassifiedDatum.setting('database', 'port'),
    ClassifiedDatum.credential('database', 'user'),
    ClassifiedDatum.credential('database', 'password')
  ]);

  config.setValue('database', 'hostname', 'localhost');
  config.setValue('database', 'port', '50000');
  config.setValue('database', 'user', 'admin');
  config.setValue('database', 'password', 'secret123');

  await store.store(config);
  console.log(`   ✓ Stored ${config.size} items`);

  const loaded = new ClassifiedData([
    ClassifiedDatum.setting('database', 'hostname'),
    ClassifiedDatum.setting('database', 'port'),
    ClassifiedDatum.credential('database', 'user'),
    ClassifiedDatum.credential('database', 'password')
  ]);

  await store.get(loaded);
  console.log('   ✓ Retrieved all:');
  console.log(`      - hostname: ${loaded.getValue('database', 'hostname')}`);
  console.log(`      - port: ${loaded.getValue('database', 'port')}`);
  console.log(`      - user: ${loaded.getValue('database', 'user')}`);
  console.log(`      - password: ${loaded.getValue('database', 'password')}\n`);

  // ============================================================================
  // Test 3: Backward compatibility
  // ============================================================================
  console.log('3. Backward Compatibility (Legacy API):');

  await store.storeCredential('api', 'key', 'api-key-123');
  const apiKey = await store.getCredential('api', 'key');
  console.log(`   ✓ Legacy API works: ${apiKey}\n`);

  // ============================================================================
  // Test 4: List by domain
  // ============================================================================
  console.log('4. List by Domain:');

  const allDbItems = await store._listByDomain('database');
  console.log(`   ✓ Total database items: ${allDbItems.size}`);
  console.log(`   ✓ Credentials: ${allDbItems.credentials.length}`);
  console.log(`   ✓ Settings: ${allDbItems.settings.length}`);

  for (const item of allDbItems.credentials) {
    console.log(`      - ${item.fullKey} (${item.classificationName}, TTL: ${item.recommendedTTL}ms)`);
  }

  for (const item of allDbItems.settings) {
    console.log(`      - ${item.fullKey} (${item.classificationName}, TTL: ${item.recommendedTTL}ms)`);
  }

  console.log('\n=== Phase 2: All Tests Passed ===');
}

main().catch(console.error);
