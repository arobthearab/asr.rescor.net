/**
 * Phase 2 Example: Full integration with Configuration class
 *
 * Demonstrates unified API working through Configuration
 */

import { Configuration } from '../src/Configuration.mjs';
import { ClassifiedDatum, ClassifiedData } from '../src/ClassifiedDatum.mjs';

async function main() {
  console.log('=== Phase 2: Configuration Integration ===\n');

  const config = new Configuration({
    enableCache: true,
    cacheTTL: 3600000,
    enableInfisical: false, // Disable Infisical for this example
    envPrefix: 'RESCOR'
  });

  await config.initialize();
  console.log('✓ Configuration initialized\n');

  // ============================================================================
  // Example 1: Unified API - Single datum
  // ============================================================================
  console.log('1. Unified API - Single Datum:');

  const password = ClassifiedDatum.credential('database', 'password').with('my-secret-pw');
  await config.set(password);
  console.log(`   ✓ Stored ${password.fullKey} using unified API`);

  const retrieved = await config.get(ClassifiedDatum.credential('database', 'password'));
  console.log(`   ✓ Retrieved: ${retrieved}\n`);

  // ============================================================================
  // Example 2: Unified API - Batch operations
  // ============================================================================
  console.log('2. Unified API - Batch Operations:');

  const dbConfig = new ClassifiedData([
    ClassifiedDatum.setting('database', 'hostname'),
    ClassifiedDatum.setting('database', 'port'),
    ClassifiedDatum.setting('database', 'database'),
    ClassifiedDatum.credential('database', 'user'),
    ClassifiedDatum.credential('database', 'password')
  ]);

  // Set values
  dbConfig.setValue('database', 'hostname', 'localhost');
  dbConfig.setValue('database', 'port', '50000');
  dbConfig.setValue('database', 'database', 'TESTDB');
  dbConfig.setValue('database', 'user', 'admin');
  dbConfig.setValue('database', 'password', 'super-secret');

  await config.set(dbConfig);
  console.log(`   ✓ Stored ${dbConfig.size} configuration items`);

  // Retrieve all
  const loadedConfig = new ClassifiedData([
    ClassifiedDatum.setting('database', 'hostname'),
    ClassifiedDatum.setting('database', 'port'),
    ClassifiedDatum.setting('database', 'database'),
    ClassifiedDatum.credential('database', 'user'),
    ClassifiedDatum.credential('database', 'password')
  ]);

  await config.get(loadedConfig);
  console.log('   ✓ Retrieved configuration:');
  console.log(`      - hostname: ${loadedConfig.getValue('database', 'hostname')}`);
  console.log(`      - port: ${loadedConfig.getValue('database', 'port')}`);
  console.log(`      - database: ${loadedConfig.getValue('database', 'database')}`);
  console.log(`      - user: ${loadedConfig.getValue('database', 'user')}`);
  console.log(`      - password: ${loadedConfig.getValue('database', 'password')}\n`);

  // ============================================================================
  // Example 3: Legacy API still works
  // ============================================================================
  console.log('3. Legacy API (Backward Compatibility):');

  await config.setConfig('api', 'nvd_key', 'my-api-key-123');
  const apiKey = await config.getConfig('api', 'nvd_key');
  console.log(`   ✓ Legacy setConfig/getConfig: ${apiKey}\n`);

  // ============================================================================
  // Example 4: Convenience helpers
  // ============================================================================
  console.log('4. Convenience Helpers:');

  const dbPassword = await config.getDb2Password();
  console.log(`   ✓ getDb2Password(): ${dbPassword}`);

  const dbUser = await config.getDb2User();
  console.log(`   ✓ getDb2User(): ${dbUser}`);

  const connString = await config.getDb2ConnectionString();
  console.log(`   ✓ Connection string: ${connString}\n`);

  // ============================================================================
  // Example 5: List configuration
  // ============================================================================
  console.log('5. List Configuration:');

  const allDbConfig = await config.listConfig('database');
  console.log(`   ✓ Total database items: ${allDbConfig.size}`);
  console.log(`   ✓ Credentials: ${allDbConfig.credentials.length}`);
  console.log(`   ✓ Settings: ${allDbConfig.settings.length}\n`);

  // ============================================================================
  // Example 6: Structured configuration schema
  // ============================================================================
  console.log('6. Structured Configuration Schema:');

  class DatabaseSchema extends ClassifiedData {
    constructor() {
      super([
        ClassifiedDatum.setting('database', 'hostname'),
        ClassifiedDatum.setting('database', 'port'),
        ClassifiedDatum.setting('database', 'database'),
        ClassifiedDatum.credential('database', 'user'),
        ClassifiedDatum.credential('database', 'password')
      ]);
    }

    async load(config) {
      await config.get(this);
      this.validate();
      return {
        hostname: this.getValue('database', 'hostname'),
        port: parseInt(this.getValue('database', 'port')),
        database: this.getValue('database', 'database'),
        user: this.getValue('database', 'user'),
        password: this.getValue('database', 'password'),
        connectionString: `DATABASE=${this.getValue('database', 'database')};` +
          `HOSTNAME=${this.getValue('database', 'hostname')};` +
          `PORT=${this.getValue('database', 'port')};` +
          `UID=${this.getValue('database', 'user')};` +
          `PWD=${this.getValue('database', 'password')}`
      };
    }
  }

  const schema = new DatabaseSchema();
  const dbSettings = await schema.load(config);
  console.log('   ✓ Loaded via structured schema:', dbSettings);

  console.log('\n=== Phase 2 Complete ===');
}

main().catch(console.error);
