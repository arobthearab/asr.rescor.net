/**
 * Example 10: Neo4j Transactions
 *
 * Demonstrates:
 * - Transaction callback pattern
 * - Atomic operations (all-or-nothing)
 * - Transaction commit on success
 * - Transaction rollback on error
 * - Multiple operations in single transaction
 *
 * NOTE: This example requires a running Neo4j instance.
 */

import { Neo4jOperations } from '../src/Neo4jOperations.mjs';

async function neo4jTransactionsExample() {
  console.log('=== Example 10: Neo4j Transactions ===\n');

  const ops = new Neo4jOperations({
    schema: 'neo4j',
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password'
  });

  try {
    await ops.connect();
    console.log('Connected to Neo4j\n');

    // Example 1: Successful transaction (commits)
    console.log('1. Successful transaction (will commit)...');
    const commitResult = await ops.transaction(async (tx) => {
      // Create multiple nodes in same transaction
      await tx.query(`
        CREATE (u:TxExample:User {name: 'Alice', email: 'alice@example.com'})
      `);

      await tx.query(`
        CREATE (u:TxExample:User {name: 'Bob', email: 'bob@example.com'})
      `);

      // Return result for verification
      return await tx.query('MATCH (u:TxExample:User) RETURN count(u) AS userCount');
    });

    console.log('   ✓ Transaction committed');
    console.log('   Users created:', commitResult[0].userCount);
    console.log();

    // Verify nodes persist after transaction
    console.log('2. Verifying committed nodes persist...');
    const persistedUsers = await ops.query('MATCH (u:TxExample:User) RETURN u.name AS name ORDER BY name');
    console.log('   ✓ Found users:', persistedUsers.map(r => r.name).join(', '));
    console.log();

    // Example 2: Failed transaction (rolls back)
    console.log('3. Failed transaction (will rollback)...');
    try {
      await ops.transaction(async (tx) => {
        // Create a node
        await tx.query(`
          CREATE (u:TxExample:User {name: 'Charlie', email: 'charlie@example.com'})
        `);

        // Intentionally throw error to trigger rollback
        throw new Error('Intentional error - transaction should rollback');
      });
    } catch (err) {
      console.log('   ✓ Transaction rolled back:', err.message);
    }
    console.log();

    // Verify Charlie was NOT created (transaction rolled back)
    console.log('4. Verifying rollback (Charlie should not exist)...');
    const afterRollback = await ops.query('MATCH (u:TxExample:User {name: $name}) RETURN u', { name: 'Charlie' });
    console.log('   ✓ Charlie exists:', afterRollback.length > 0 ? 'Yes (ERROR!)' : 'No (correct)');
    console.log();

    // Example 3: Query error triggers rollback
    console.log('5. Query error triggers rollback...');
    try {
      await ops.transaction(async (tx) => {
        // Create a node
        await tx.query(`
          CREATE (u:TxExample:User {name: 'Dave', email: 'dave@example.com'})
        `);

        // Execute invalid Cypher (will cause rollback)
        await tx.query('INVALID CYPHER SYNTAX');
      });
    } catch (err) {
      console.log('   ✓ Transaction rolled back due to query error');
    }
    console.log();

    // Verify Dave was NOT created
    console.log('6. Verifying Dave was not created...');
    const daveCheck = await ops.query('MATCH (u:TxExample:User {name: $name}) RETURN u', { name: 'Dave' });
    console.log('   ✓ Dave exists:', daveCheck.length > 0 ? 'Yes (ERROR!)' : 'No (correct)');
    console.log();

    // Example 4: Complex transaction with relationships
    console.log('7. Complex transaction with nodes and relationships...');
    await ops.transaction(async (tx) => {
      // Create project
      await tx.query(`
        CREATE (p:TxExample:Project {name: 'Project Alpha', status: 'active'})
      `);

      // Assign users to project
      await tx.query(`
        MATCH (u:TxExample:User {name: 'Alice'})
        MATCH (p:TxExample:Project {name: 'Project Alpha'})
        CREATE (u)-[:ASSIGNED_TO {role: 'Lead', since: date()}]->(p)
      `);

      await tx.query(`
        MATCH (u:TxExample:User {name: 'Bob'})
        MATCH (p:TxExample:Project {name: 'Project Alpha'})
        CREATE (u)-[:ASSIGNED_TO {role: 'Developer', since: date()}]->(p)
      `);
    });

    console.log('   ✓ Project and assignments created');
    console.log();

    // Verify complex transaction results
    console.log('8. Verifying project assignments...');
    const assignments = await ops.query(`
      MATCH (u:TxExample:User)-[r:ASSIGNED_TO]->(p:TxExample:Project)
      RETURN u.name AS user, r.role AS role, p.name AS project
      ORDER BY r.role DESC
    `);

    assignments.forEach(assignment => {
      console.log(`   - ${assignment.user}: ${assignment.role} on ${assignment.project}`);
    });
    console.log();

    // Example 5: Transaction with conditional logic
    console.log('9. Transaction with conditional logic...');
    await ops.transaction(async (tx) => {
      // Check if user exists
      const existing = await tx.query(
        'MATCH (u:TxExample:User {email: $email}) RETURN u',
        { email: 'eve@example.com' }
      );

      if (existing.length === 0) {
        // User doesn't exist, create it
        await tx.query(`
          CREATE (u:TxExample:User {name: 'Eve', email: 'eve@example.com'})
        `);
        console.log('   ✓ Created new user: Eve');
      } else {
        console.log('   ✓ User already exists, skipping creation');
      }
    });
    console.log();

    // Example 6: Batch operations in transaction
    console.log('10. Batch operations in transaction...');
    const newUsers = [
      { name: 'Frank', email: 'frank@example.com' },
      { name: 'Grace', email: 'grace@example.com' },
      { name: 'Henry', email: 'henry@example.com' }
    ];

    await ops.transaction(async (tx) => {
      for (const user of newUsers) {
        await tx.query(
          'CREATE (u:TxExample:User {name: $name, email: $email})',
          user
        );
      }
    });

    const totalUsers = await ops.query('MATCH (u:TxExample:User) RETURN count(u) AS count');
    console.log(`   ✓ Batch created ${newUsers.length} users`);
    console.log(`   Total users now: ${totalUsers[0].count}`);
    console.log();

    // Clean up
    console.log('11. Cleaning up test data...');
    await ops.query('MATCH (n:TxExample) DETACH DELETE n');
    console.log('    ✓ Test data deleted\n');

  } catch (err) {
    console.error('Error:', err.message);
    if (err.code) {
      console.error('Error Code:', err.code);
    }
    console.error();
  } finally {
    await ops.disconnect();
    console.log('Disconnected\n');
  }
}

// Run example
neo4jTransactionsExample().catch(console.error);
