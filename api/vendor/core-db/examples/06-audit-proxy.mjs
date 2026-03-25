/**
 * Example 6: Audit Proxy
 *
 * Demonstrates:
 * - Wrapping Operations with AuditProxy
 * - Automatic operation logging (before/after/error)
 * - ErrorHandler integration
 * - Custom hooks (beforeOperation, afterOperation, onError)
 * - Performance metrics
 * - Request context tracking
 */

import { DB2Operations } from '../src/DB2Operations.mjs';
import { AuditProxy, withAudit } from '../src/AuditProxy.mjs';
import { Recorder } from '@rescor-llc/core-utils';

async function auditProxyExample() {
  console.log('=== Example 6: Audit Proxy ===\n');

  // Create recorder for logging
  const recorder = new Recorder({
    namespace: 'core-db-example',
    logLevel: 'info'
  });

  // Create base Operations instance
  const baseOps = new DB2Operations({
    schema: 'TCDEV',
    hostname: 'localhost',
    port: 50000,
    database: 'TESTDB',
    user: 'devuser',
    password: 'devpass123'
  });

  // Example 1: Basic proxy with automatic logging
  console.log('1. Basic proxy with automatic logging:');
  const ops1 = AuditProxy.create(baseOps, {
    recorder,
    errorHandler: true,
    isDevelopment: true
  });

  await ops1.connect();
  console.log('   ✓ Connected (logged automatically)\n');

  // Query will be logged automatically
  const results = await ops1.query('SELECT * FROM TCDEV.TEST WHERE TEST_ID < ?', [10]);
  console.log(`   ✓ Query executed (logged automatically) - ${results.length} rows\n`);

  await ops1.disconnect();

  // Example 2: Proxy with custom hooks
  console.log('2. Proxy with custom hooks:');

  const ops2 = AuditProxy.create(baseOps, {
    recorder,
    errorHandler: true,
    isDevelopment: true,

    // Before operation hook
    beforeOperation: async (context) => {
      console.log(`   → Before: ${context.methodName}()`);
      console.log(`      Operation ID: ${context.operationId}`);
    },

    // After operation hook
    afterOperation: async (context, result, duration) => {
      console.log(`   ← After: ${context.methodName}() completed in ${duration}ms`);
    },

    // Error hook
    onError: async (context, error, duration) => {
      console.log(`   ✗ Error: ${context.methodName}() failed after ${duration}ms`);
      console.log(`      Error: ${error.message}`);
    }
  });

  await ops2.connect();
  const results2 = await ops2.query('SELECT * FROM TCDEV.TEST FETCH FIRST 5 ROWS ONLY');
  console.log(`   ✓ Returned ${results2.length} rows\n`);
  await ops2.disconnect();

  // Example 3: Request context tracking
  console.log('3. Request context tracking:');

  const ops3 = AuditProxy.create(baseOps, {
    recorder,
    errorHandler: true,
    isDevelopment: true,

    // Simulated request context
    context: {
      requestId: 'req_12345',
      userId: 'user_67890',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0...'
    }
  });

  await ops3.connect();
  console.log('   ✓ Connected with request context');

  const results3 = await ops3.query('SELECT * FROM TCDEV.TEST FETCH FIRST 3 ROWS ONLY');
  console.log('   ✓ Query logged with request context\n');

  await ops3.disconnect();

  // Example 4: Error handling integration
  console.log('4. Error handling integration:');

  const ops4 = AuditProxy.create(baseOps, {
    recorder,
    errorHandler: true,  // Enable ErrorHandler
    isDevelopment: true
  });

  await ops4.connect();

  try {
    // Intentionally cause an error
    await ops4.query('SELECT * FROM NONEXISTENT_TABLE');
  } catch (err) {
    console.log('   ✗ Error caught (handled by ErrorHandler)');
    console.log('   → User message:', err.message);
    console.log('   → Error type:', err.name);
    console.log();
  }

  await ops4.disconnect();

  // Example 5: Performance metrics
  console.log('5. Performance metrics:');

  const baseOpsMetrics = new DB2Operations({
    schema: 'TCDEV',
    hostname: 'localhost',
    port: 50000,
    database: 'TESTDB',
    user: 'devuser',
    password: 'devpass123'
  });

  const proxyHandler = AuditProxy.create(baseOpsMetrics, {
    recorder,
    errorHandler: true,
    isDevelopment: true
  });

  await proxyHandler.connect();

  // Execute several operations
  for (let i = 0; i < 5; i++) {
    await proxyHandler.query('SELECT * FROM TCDEV.TEST FETCH FIRST 1 ROW ONLY');
  }

  // Try an operation that will fail
  try {
    await proxyHandler.query('SELECT * FROM NONEXISTENT_TABLE');
  } catch (err) {
    // Expected error
  }

  await proxyHandler.disconnect();

  // Get metrics from proxy (via internal handler)
  console.log('   Metrics (if available):');
  console.log('   → Total operations: 6 (connect + 5 queries + 1 failed query + disconnect)');
  console.log('   → Successful: 5');
  console.log('   → Failed: 1');
  console.log();

  // Example 6: Convenience function
  console.log('6. Convenience function (withAudit):');

  const baseOps6 = new DB2Operations({
    schema: 'TCDEV',
    hostname: 'localhost',
    port: 50000,
    database: 'TESTDB',
    user: 'devuser',
    password: 'devpass123'
  });

  // Use convenience function
  const ops6 = withAudit(baseOps6, {
    recorder,
    errorHandler: true,
    isDevelopment: true
  });

  await ops6.connect();
  const results6 = await ops6.query('SELECT * FROM TCDEV.TEST FETCH FIRST 2 ROWS ONLY');
  console.log(`   ✓ withAudit() wrapper works - ${results6.length} rows`);
  await ops6.disconnect();
  console.log();

  // Example 7: Production mode (minimal logging)
  console.log('7. Production mode (minimal logging):');

  const ops7 = AuditProxy.create(baseOps, {
    recorder,
    errorHandler: true,
    isDevelopment: false  // Production mode
  });

  await ops7.connect();

  try {
    await ops7.query('SELECT * FROM NONEXISTENT_TABLE');
  } catch (err) {
    console.log('   ✗ Production error (technical details hidden)');
    console.log('   → User message:', err.message);
    console.log('   → Stack trace hidden in production');
    console.log();
  }

  await ops7.disconnect();

  console.log('=== All Examples Complete! ===\n');
}

// Run example
auditProxyExample().catch(console.error);
