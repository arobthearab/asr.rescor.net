/**
 * Example 1: Basic Usage
 *
 * Demonstrates:
 * - Creating a DB2Operations instance
 * - Connecting to database
 * - Executing queries
 * - Disconnecting
 *
 * NOTE: This is a demonstration example. Update connection details for your environment.
 */

import { DB2Operations } from '../src/DB2Operations.mjs';

async function basicUsageExample() {
  console.log('=== Example 1: Basic Usage ===\n');

  // Create operations instance
  const ops = new DB2Operations({
    schema: 'TCDEV',
    hostname: 'localhost',
    port: 50000,
    database: 'TESTDB',
    user: 'devuser',
    password: 'devpass123'
  });

  try {
    // Connect to database
    console.log('1. Connecting to database...');
    await ops.connect();
    console.log('   ✓ Connected\n');

    // Execute a simple query
    console.log('2. Executing query...');
    const sql = 'SELECT * FROM TCDEV.TEST WHERE TEST_ID < ? ORDER BY TEST_ID';
    const results = await ops.query(sql, [10]);
    console.log(`   ✓ Query returned ${results.length} rows\n`);

    // Display results (raw - no transforms)
    if (results.length > 0) {
      console.log('3. First result (raw):');
      console.log('   ', results[0]);
      console.log();
    }

    // Get metadata
    console.log('4. Operations metadata:');
    const metadata = ops.getMetadata();
    console.log('   Schema:', metadata.schema);
    console.log('   Connected:', metadata.connected);
    console.log();

  } catch (err) {
    console.error('Error:', err.message);
    if (err.code) {
      console.error('SQL Code:', err.code);
    }
  } finally {
    // Always disconnect
    console.log('5. Disconnecting...');
    await ops.disconnect();
    console.log('   ✓ Disconnected\n');
  }
}

// Run example
basicUsageExample().catch(console.error);
