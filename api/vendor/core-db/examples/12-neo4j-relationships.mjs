/**
 * Example 12: Neo4j Relationships
 *
 * Demonstrates:
 * - Creating relationships between nodes
 * - Relationship properties
 * - Querying relationships
 * - Traversing relationships
 * - Bidirectional relationships
 * - Relationship patterns
 *
 * NOTE: This example requires a running Neo4j instance.
 */

import { Neo4jOperations } from '../src/Neo4jOperations.mjs';
import { Neo4jTransforms } from '../src/Neo4jTransforms.mjs';

async function neo4jRelationshipsExample() {
  console.log('=== Example 12: Neo4j Relationships ===\n');

  const ops = new Neo4jOperations({
    schema: 'neo4j',
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password'
  });

  try {
    await ops.connect();
    console.log('Connected to Neo4j\n');

    // Example 1: Create nodes and relationships
    console.log('1. Creating nodes and relationships...');
    await ops.query(`
      CREATE (alice:RelExample:Person {name: 'Alice', role: 'Developer'})
      CREATE (bob:RelExample:Person {name: 'Bob', role: 'Manager'})
      CREATE (charlie:RelExample:Person {name: 'Charlie', role: 'Developer'})
      CREATE (alice)-[:REPORTS_TO {since: date('2023-01-01')}]->(bob)
      CREATE (charlie)-[:REPORTS_TO {since: date('2023-06-01')}]->(bob)
      CREATE (alice)-[:WORKS_WITH {project: 'Project Alpha'}]->(charlie)
    `);
    console.log('   ✓ Created 3 people and 3 relationships\n');

    // Example 2: Query relationships
    console.log('2. Querying relationships...');
    const reportsTo = await ops.query(`
      MATCH (p:RelExample:Person)-[r:REPORTS_TO]->(m:RelExample:Person)
      RETURN p.name AS employee, m.name AS manager, r.since AS since
      ORDER BY r.since
    `);

    console.log('   Reporting structure:');
    reportsTo.forEach(rel => {
      console.log(`   - ${rel.employee} reports to ${rel.manager} (since ${rel.since})`);
    });
    console.log();

    // Example 3: Traverse relationships
    console.log('3. Traversing relationships...');
    const colleagues = await ops.query(`
      MATCH (alice:RelExample:Person {name: 'Alice'})-[:WORKS_WITH]-(colleague)
      RETURN colleague.name AS name, colleague.role AS role
    `);

    console.log('   Alice works with:');
    colleagues.forEach(c => {
      console.log(`   - ${c.name} (${c.role})`);
    });
    console.log();

    // Example 4: Relationship properties
    console.log('4. Querying relationship properties...');
    const transforms = new Neo4jTransforms()
      .add('rel', { type: 'relationship' });

    const relationshipProps = await ops.query(
      'MATCH (:RelExample:Person)-[r:REPORTS_TO]->(:RelExample:Person) RETURN r AS rel LIMIT 1',
      {},
      transforms
    );

    console.log('   Relationship properties:');
    console.log('     Type:', relationshipProps[0].rel._type);
    console.log('     Since:', relationshipProps[0].rel.since);
    console.log('     Start ID:', relationshipProps[0].rel._startId);
    console.log('     End ID:', relationshipProps[0].rel._endId);
    console.log();

    // Example 5: Multiple relationship types
    console.log('5. Creating multiple relationship types...');
    await ops.query(`
      MATCH (alice:RelExample:Person {name: 'Alice'})
      MATCH (bob:RelExample:Person {name: 'Bob'})
      CREATE (alice)-[:MENTORED_BY {skills: ['Leadership', 'Architecture']}]->(bob)
    `);

    const aliceRelationships = await ops.query(`
      MATCH (alice:RelExample:Person {name: 'Alice'})-[r]->(other)
      RETURN type(r) AS relType, other.name AS person
      ORDER BY relType
    `);

    console.log('   Alice\'s relationships:');
    aliceRelationships.forEach(rel => {
      console.log(`   - ${rel.relType} → ${rel.person}`);
    });
    console.log();

    // Example 6: Bidirectional relationships
    console.log('6. Creating bidirectional relationships...');
    await ops.query(`
      MATCH (alice:RelExample:Person {name: 'Alice'})
      MATCH (charlie:RelExample:Person {name: 'Charlie'})
      MERGE (alice)-[:FRIENDS_WITH]-(charlie)
    `);

    const friendships = await ops.query(`
      MATCH (p1:RelExample:Person)-[:FRIENDS_WITH]-(p2:RelExample:Person)
      WHERE id(p1) < id(p2)  // Avoid duplicates
      RETURN p1.name AS person1, p2.name AS person2
    `);

    console.log('   Friendships:');
    friendships.forEach(f => {
      console.log(`   - ${f.person1} ↔ ${f.person2}`);
    });
    console.log();

    // Example 7: Relationship patterns
    console.log('7. Complex relationship patterns...');

    // Create project and technology nodes
    await ops.query(`
      CREATE (proj:RelExample:Project {name: 'Project Alpha'})
      CREATE (tech1:RelExample:Technology {name: 'Neo4j'})
      CREATE (tech2:RelExample:Technology {name: 'Node.js'})
      MATCH (alice:RelExample:Person {name: 'Alice'})
      MATCH (charlie:RelExample:Person {name: 'Charlie'})
      CREATE (alice)-[:ASSIGNED_TO {role: 'Lead'}]->(proj)
      CREATE (charlie)-[:ASSIGNED_TO {role: 'Developer'}]->(proj)
      CREATE (proj)-[:USES]->(tech1)
      CREATE (proj)-[:USES]->(tech2)
    `);

    // Find people working on projects using specific technology
    const techUsers = await ops.query(`
      MATCH (person:RelExample:Person)-[:ASSIGNED_TO]->(proj:RelExample:Project)-[:USES]->(tech:RelExample:Technology {name: 'Neo4j'})
      RETURN person.name AS developer, proj.name AS project
    `);

    console.log('   Developers working with Neo4j:');
    techUsers.forEach(u => {
      console.log(`   - ${u.developer} on ${u.project}`);
    });
    console.log();

    // Example 8: Finding indirect relationships
    console.log('8. Finding indirect relationships...');
    const indirectConnections = await ops.query(`
      MATCH (alice:RelExample:Person {name: 'Alice'})-[:REPORTS_TO]->(manager)<-[:REPORTS_TO]-(peer)
      WHERE alice <> peer
      RETURN peer.name AS teammate
    `);

    console.log('   Alice\'s teammates (same manager):');
    indirectConnections.forEach(t => {
      console.log(`   - ${t.teammate}`);
    });
    console.log();

    // Example 9: Counting relationships
    console.log('9. Counting relationships...');
    const relCounts = await ops.query(`
      MATCH (p:RelExample:Person)
      OPTIONAL MATCH (p)-[r]->()
      RETURN p.name AS person, count(r) AS outgoingRelationships
      ORDER BY outgoingRelationships DESC
    `);

    console.log('   Outgoing relationships per person:');
    relCounts.forEach(c => {
      console.log(`   - ${c.person}: ${c.outgoingRelationships} relationships`);
    });
    console.log();

    // Example 10: Updating relationships
    console.log('10. Updating relationship properties...');
    await ops.query(`
      MATCH (alice:RelExample:Person {name: 'Alice'})-[r:REPORTS_TO]->()
      SET r.performance = 'Excellent', r.lastReview = date()
    `);

    const updated = await ops.query(`
      MATCH (alice:RelExample:Person {name: 'Alice'})-[r:REPORTS_TO]->()
      RETURN r.performance AS performance, r.lastReview AS lastReview
    `);

    console.log('   Updated relationship:');
    console.log('     Performance:', updated[0].performance);
    console.log('     Last Review:', updated[0].lastReview);
    console.log();

    // Example 11: Deleting relationships
    console.log('11. Deleting specific relationships...');
    await ops.query(`
      MATCH (:RelExample:Person {name: 'Alice'})-[r:WORKS_WITH]->(:RelExample:Person {name: 'Charlie'})
      DELETE r
    `);

    const remainingRels = await ops.query(`
      MATCH (alice:RelExample:Person {name: 'Alice'})-[r]->()
      RETURN type(r) AS relType
    `);

    console.log('   Alice\'s remaining relationships:');
    remainingRels.forEach(r => {
      console.log(`   - ${r.relType}`);
    });
    console.log();

    // Clean up
    console.log('12. Cleaning up test data...');
    await ops.query('MATCH (n:RelExample) DETACH DELETE n');
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
neo4jRelationshipsExample().catch(console.error);
