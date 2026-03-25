/**
 * Example 8: Neo4j Basic Usage
 *
 * Demonstrates:
 * - Creating a Neo4jOperations instance
 * - Connecting to Neo4j database
 * - Executing Cypher queries
 * - Using query parameters
 * - Disconnecting
 *
 * NOTE: This example requires a running Neo4j instance.
 * Update connection details or set environment variables:
 * - NEO4J_URI (default: bolt://localhost:7687)
 * - NEO4J_USERNAME (default: neo4j)
 * - NEO4J_PASSWORD (required)
 */

import { Neo4jOperations } from '../src/Neo4jOperations.mjs';

async function neo4jBasicExample() {
  console.log('=== Example 8: Neo4j Basic Usage ===\n');

  // Create operations instance
  // Credentials can be provided directly or via environment variables
  const ops = new Neo4jOperations({
    schema: 'neo4j',  // Database name (CE supports 'neo4j' database only)
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password'
  });

  try {
    // Connect to database
    console.log('1. Connecting to Neo4j...');
    await ops.connect();
    console.log('   ✓ Connected\n');

    // Execute a simple query
    console.log('2. Executing simple query...');
    const simpleResults = await ops.query('RETURN 1 AS value, "Hello Neo4j!" AS message');
    console.log('   ✓ Query results:', simpleResults[0]);
    console.log();

    // Query with parameters (recommended for security)
    console.log('3. Executing query with parameters...');
    const paramResults = await ops.query(
      'RETURN $name AS name, $count AS count, $active AS active',
      {
        name: 'TestNode',
        count: 42,
        active: true
      }
    );
    console.log('   ✓ Parameterized results:', paramResults[0]);
    console.log();

    // Create a test node
    console.log('4. Creating test node...');
    const createResults = await ops.query(
      'CREATE (n:Example {name: $name, value: $value, created: datetime()}) RETURN n',
      { name: 'BasicExample', value: 100 }
    );
    console.log('   ✓ Created node:', createResults[0].n.properties.name);
    console.log();

    // Query the created node
    console.log('5. Querying created node...');
    const queryResults = await ops.query(
      'MATCH (n:Example {name: $name}) RETURN n',
      { name: 'BasicExample' }
    );
    console.log('   ✓ Found node:', queryResults[0].n.properties);
    console.log();

    // Update the node
    console.log('6. Updating node...');
    await ops.query(
      'MATCH (n:Example {name: $name}) SET n.value = $newValue, n.updated = datetime()',
      { name: 'BasicExample', newValue: 200 }
    );
    console.log('   ✓ Node updated\n');

    // Verify update
    console.log('7. Verifying update...');
    const updatedResults = await ops.query(
      'MATCH (n:Example {name: $name}) RETURN n.value AS value',
      { name: 'BasicExample' }
    );
    console.log('   ✓ Updated value:', updatedResults[0].value);
    console.log();

    // Delete the test node
    console.log('8. Cleaning up test node...');
    await ops.query(
      'MATCH (n:Example {name: $name}) DELETE n',
      { name: 'BasicExample' }
    );
    console.log('   ✓ Node deleted\n');

    // Get metadata
    console.log('9. Operations metadata:');
    const metadata = ops.getMetadata();
    console.log('   Type:', metadata.type);
    console.log('   Database:', metadata.database);
    console.log('   Connected:', metadata.connected);
    console.log();

  } catch (err) {
    console.error('Error:', err.message);
    if (err.code) {
      console.error('Error Code:', err.code);
    }
    console.error();
  } finally {
    // Always disconnect
    console.log('10. Disconnecting...');
    await ops.disconnect();
    console.log('    ✓ Disconnected\n');
  }
}

// Run example
neo4jBasicExample().catch(console.error);
