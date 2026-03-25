/**
 * Example 15: Infisical-First Credential Loading
 *
 * Demonstrates the default Infisical-first credential strategy.
 *
 * This example shows how @rescor-llc/core-db Operations classes now prioritize
 * Infisical as the primary credential source, with graceful fallback to
 * constructor parameters and environment variables.
 *
 * Credential loading priority:
 * 1. Infisical (via Configuration) - PRIMARY
 * 2. Constructor parameters - OVERRIDE
 * 3. Environment variables - FALLBACK
 *
 * Event codes:
 * - 8506: Credentials loaded from Infisical
 * - 8507: Infisical unavailable, using fallback
 * - 8508: Using constructor credentials
 * - 8509: Using environment credentials
 */

import { Neo4jOperations } from '@rescor-llc/core-db';
import { Recorder } from '@rescor-llc/core-utils';

// Create recorder to log credential loading events
// Events 8506-8509 will be logged to /tmp/rescor/logs/app.log
const recorder = new Recorder();

console.log('='.repeat(70));
console.log('Example 15: Infisical-First Credential Loading');
console.log('='.repeat(70));

console.log('\nNOTE: This example demonstrates Infisical-first credential loading.');
console.log('      Event codes 8506-8509 are logged to /tmp/rescor/logs/app.log');
console.log('      Use "tail -f /tmp/rescor/logs/app.log" to see real-time logs.');

console.log('\n1. Connecting to Neo4j with Infisical-first credentials...');

// Connect to Neo4j using Infisical-first strategy
const ops = new Neo4jOperations({
  schema: 'neo4j',
  uri: 'bolt://localhost:7687',
  recorder,
  useInfisicalFirst: true  // DEFAULT (can omit)
});

try {
  console.log('   Attempting connection...');
  await ops.connect();
  console.log('✅ Connected to Neo4j successfully!');

  // Verify database is accessible
  console.log('\n2. Verifying database access with simple query...');
  const result = await ops.query('RETURN 1 AS test, datetime() AS timestamp');

  console.log('✅ Database query successful!');
  console.log('   Result:', {
    test: result[0].test,
    timestamp: result[0].timestamp
  });

  console.log('\n3. Credential Source Summary:');
  console.log('   Check /tmp/rescor/logs/app.log for event codes:');
  console.log('   - Event 8506: Credentials loaded from Infisical (PRIMARY)');
  console.log('   - Event 8507: Infisical unavailable warning');
  console.log('   - Event 8508: Using constructor credentials (OVERRIDE)');
  console.log('   - Event 8509: Using environment credentials (FALLBACK)');

} catch (err) {
  console.error('\n❌ Connection or query failed:', err.message);
  console.error('\nTroubleshooting:');
  console.error('1. Ensure Neo4j is running: docker-compose -f docker-compose.neo4j.yml up -d');
  console.error('2. Check Infisical status: curl http://localhost:8080/api/status');
  console.error('3. Set environment fallback: export NEO4J_PASSWORD=rescordev123');
} finally {
  await ops.disconnect();
  console.log('\n✅ Disconnected from Neo4j');
}

console.log('\n' + '='.repeat(70));
console.log('Example Complete');
console.log('='.repeat(70));
console.log('\nKey Takeaways:');
console.log('• Infisical is now the PRIMARY credential source (enabled by default)');
console.log('• Automatic fallback to constructor and environment ensures compatibility');
console.log('• Event codes 8506-8509 track credential source for debugging');
console.log('• VitalSign helper makes it easy to auto-start Infisical');
console.log('• Opt-out available via useInfisicalFirst: false for special cases');
console.log('='.repeat(70) + '\n');
