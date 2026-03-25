/**
 * Example 13: Neo4j Paths
 *
 * Demonstrates:
 * - Simple path queries
 * - Multi-hop paths
 * - Variable length paths [*1..3]
 * - Shortest path algorithm
 * - All paths between nodes
 * - Path properties and filtering
 * - Path transforms
 *
 * NOTE: This example requires a running Neo4j instance.
 */

import { Neo4jOperations } from '../src/Neo4jOperations.mjs';
import { Neo4jTransforms } from '../src/Neo4jTransforms.mjs';

async function neo4jPathsExample() {
  console.log('=== Example 13: Neo4j Paths ===\n');

  const ops = new Neo4jOperations({
    schema: 'neo4j',
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password'
  });

  try {
    await ops.connect();
    console.log('Connected to Neo4j\n');

    // Create a network topology graph
    console.log('1. Creating network topology graph...');
    await ops.query(`
      CREATE (h1:PathExample:Host {name: 'web-server', tier: 'frontend'})
      CREATE (h2:PathExample:Host {name: 'app-server', tier: 'application'})
      CREATE (h3:PathExample:Host {name: 'db-server', tier: 'database'})
      CREATE (h4:PathExample:Host {name: 'cache-server', tier: 'cache'})
      CREATE (h5:PathExample:Host {name: 'backup-server', tier: 'backup'})
      CREATE (f1:PathExample:Finding {cve: 'CVE-2024-001', severity: 'CRITICAL'})
      CREATE (f2:PathExample:Finding {cve: 'CVE-2024-002', severity: 'HIGH'})
      CREATE (s:PathExample:Source {name: 'NVD'})

      CREATE (h1)-[:CONNECTS_TO {port: 8080}]->(h2)
      CREATE (h2)-[:CONNECTS_TO {port: 5432}]->(h3)
      CREATE (h2)-[:CONNECTS_TO {port: 6379}]->(h4)
      CREATE (h3)-[:BACKED_UP_BY]->(h5)
      CREATE (h1)-[:HAS_FINDING]->(f1)
      CREATE (h3)-[:HAS_FINDING]->(f2)
      CREATE (f1)-[:FROM_SOURCE]->(s)
      CREATE (f2)-[:FROM_SOURCE]->(s)
    `);
    console.log('   ✓ Created network topology\n');

    // Example 2: Simple path
    console.log('2. Simple path query...');
    const simplePath = await ops.query(`
      MATCH path = (web:PathExample:Host {name: 'web-server'})-[:CONNECTS_TO]->(app:PathExample:Host)
      RETURN web.name AS start, app.name AS end
    `);

    console.log('   Simple connection:');
    console.log(`   ${simplePath[0].start} → ${simplePath[0].end}`);
    console.log();

    // Example 3: Multi-hop path
    console.log('3. Multi-hop path query...');
    const multiHopPath = await ops.query(`
      MATCH path = (web:PathExample:Host {name: 'web-server'})-[:CONNECTS_TO*2]->(db:PathExample:Host {tier: 'database'})
      RETURN web.name AS start, db.name AS end, length(path) AS hops
    `);

    console.log('   Multi-hop connection:');
    console.log(`   ${multiHopPath[0].start} → ${multiHopPath[0].end} (${multiHopPath[0].hops} hops)`);
    console.log();

    // Example 4: Variable length paths
    console.log('4. Variable length paths [*1..3]...');
    const varLengthPaths = await ops.query(`
      MATCH path = (h1:PathExample:Host {name: 'web-server'})-[:CONNECTS_TO*1..3]-(h2:PathExample:Host)
      RETURN h2.name AS destination, length(path) AS distance
      ORDER BY distance, destination
    `);

    console.log('   Reachable hosts from web-server:');
    varLengthPaths.forEach(p => {
      console.log(`   - ${p.destination} (distance: ${p.distance})`);
    });
    console.log();

    // Example 5: Shortest path
    console.log('5. Shortest path algorithm...');
    const shortestPath = await ops.query(`
      MATCH (start:PathExample:Host {name: 'web-server'}),
            (end:PathExample:Host {name: 'backup-server'})
      MATCH path = shortestPath((start)-[:CONNECTS_TO|BACKED_UP_BY*]-(end))
      RETURN [node IN nodes(path) | node.name] AS route, length(path) AS hops
    `);

    console.log('   Shortest path web-server → backup-server:');
    console.log(`   Route: ${shortestPath[0].route.join(' → ')}`);
    console.log(`   Hops: ${shortestPath[0].hops}`);
    console.log();

    // Example 6: All paths between nodes
    console.log('6. Finding all paths between nodes...');
    const allPaths = await ops.query(`
      MATCH (start:PathExample:Host {name: 'web-server'}),
            (end:PathExample:Host {name: 'cache-server'})
      MATCH path = allShortestPaths((start)-[:CONNECTS_TO*]-(end))
      RETURN [node IN nodes(path) | node.name] AS route
    `);

    console.log('   All shortest paths web-server → cache-server:');
    allPaths.forEach((p, idx) => {
      console.log(`   Path ${idx + 1}: ${p.route.join(' → ')}`);
    });
    console.log();

    // Example 7: Path with transforms
    console.log('7. Path transforms...');
    const pathTransforms = new Neo4jTransforms()
      .add('attack_path', { type: 'path' });

    const transformedPaths = await ops.query(`
      MATCH path = (h:PathExample:Host)-[:HAS_FINDING]->(:PathExample:Finding)-[:FROM_SOURCE]->(:PathExample:Source)
      RETURN path AS attack_path
      LIMIT 1
    `, {}, pathTransforms);

    console.log('   Transformed path (Host → Finding → Source):');
    const path = transformedPaths[0].attack_path;
    path.forEach((segment, idx) => {
      const startName = segment.start.name || segment.start.cve;
      const endName = segment.end.name || segment.end.cve;
      console.log(`   Segment ${idx + 1}: ${startName} -[${segment.relationship._type}]-> ${endName}`);
    });
    console.log();

    // Example 8: Filtering paths
    console.log('8. Filtering paths by relationship properties...');
    const filteredPaths = await ops.query(`
      MATCH path = (h1:PathExample:Host)-[r:CONNECTS_TO*]->(h2:PathExample:Host)
      WHERE ALL(rel IN relationships(path) WHERE rel.port IS NOT NULL)
      RETURN h1.name AS start, h2.name AS end, [rel IN relationships(path) | rel.port] AS ports
      LIMIT 3
    `);

    console.log('   Paths with port information:');
    filteredPaths.forEach(p => {
      console.log(`   ${p.start} → ${p.end} (ports: ${p.ports.join(', ')})`);
    });
    console.log();

    // Example 9: Path patterns for security analysis
    console.log('9. Security analysis: Attack paths...');
    const attackPaths = await ops.query(`
      MATCH path = (entry:PathExample:Host {tier: 'frontend'})-[:CONNECTS_TO*]->(critical:PathExample:Host {tier: 'database'}),
            (critical)-[:HAS_FINDING]->(f:PathExample:Finding)
      WHERE f.severity IN ['CRITICAL', 'HIGH']
      RETURN entry.name AS entryPoint,
             critical.name AS targetHost,
             f.cve AS vulnerability,
             f.severity AS severity,
             length(path) AS pathLength
    `);

    console.log('   Potential attack paths:');
    attackPaths.forEach(ap => {
      console.log(`   - ${ap.entryPoint} → ${ap.targetHost}`);
      console.log(`     Vulnerability: ${ap.vulnerability} (${ap.severity})`);
      console.log(`     Path length: ${ap.pathLength} hops`);
    });
    console.log();

    // Example 10: Path aggregation
    console.log('10. Path aggregation and analysis...');
    const pathStats = await ops.query(`
      MATCH path = (h1:PathExample:Host)-[:CONNECTS_TO*]-(h2:PathExample:Host)
      WHERE id(h1) < id(h2)
      RETURN h1.name AS host1,
             h2.name AS host2,
             min(length(path)) AS shortestPath,
             count(path) AS pathCount
      ORDER BY shortestPath
    `);

    console.log('   Path statistics between hosts:');
    pathStats.forEach(stat => {
      console.log(`   ${stat.host1} ↔ ${stat.host2}: ${stat.pathCount} paths (shortest: ${stat.shortestPath})`);
    });
    console.log();

    // Example 11: Directed vs undirected paths
    console.log('11. Directed vs undirected paths...');

    const directedPaths = await ops.query(`
      MATCH path = (h1:PathExample:Host {name: 'web-server'})-[:CONNECTS_TO*]->(h2:PathExample:Host)
      RETURN count(DISTINCT h2) AS reachableForward
    `);

    const undirectedPaths = await ops.query(`
      MATCH path = (h1:PathExample:Host {name: 'web-server'})-[:CONNECTS_TO*]-(h2:PathExample:Host)
      RETURN count(DISTINCT h2) AS reachableEither
    `);

    console.log('   From web-server:');
    console.log(`   - Reachable (forward only): ${directedPaths[0].reachableForward} hosts`);
    console.log(`   - Reachable (any direction): ${undirectedPaths[0].reachableEither} hosts`);
    console.log();

    // Example 12: Complex path patterns
    console.log('12. Complex path patterns...');
    const complexPaths = await ops.query(`
      MATCH path = (h:PathExample:Host)-[:HAS_FINDING]->(f:PathExample:Finding)-[:FROM_SOURCE]->(s:PathExample:Source)
      WHERE h.tier <> 'backup'
      RETURN h.tier AS hostTier,
             count(DISTINCT f) AS findingCount,
             collect(DISTINCT f.severity) AS severities
      ORDER BY findingCount DESC
    `);

    console.log('   Findings by host tier:');
    complexPaths.forEach(cp => {
      console.log(`   ${cp.hostTier}: ${cp.findingCount} findings (${cp.severities.join(', ')})`);
    });
    console.log();

    // Clean up
    console.log('13. Cleaning up test data...');
    await ops.query('MATCH (n:PathExample) DETACH DELETE n');
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
neo4jPathsExample().catch(console.error);
