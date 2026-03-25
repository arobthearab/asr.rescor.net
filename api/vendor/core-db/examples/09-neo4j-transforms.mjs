/**
 * Example 9: Neo4j Transforms
 *
 * Demonstrates:
 * - Neo4jTransforms for converting Neo4j types to JavaScript objects
 * - Node transform (Neo4j Node → object with properties + _labels, _id)
 * - Relationship transform (Neo4j Relationship → object with _type, _startId, _endId)
 * - Path transform (Neo4j Path → array of segments)
 * - CommonNeo4jTransforms patterns (forNodes, forRelationships, etc.)
 *
 * NOTE: This example requires a running Neo4j instance.
 */

import { Neo4jOperations } from '../src/Neo4jOperations.mjs';
import { Neo4jTransforms, CommonNeo4jTransforms } from '../src/Neo4jTransforms.mjs';

async function neo4jTransformsExample() {
  console.log('=== Example 9: Neo4j Transforms ===\n');

  const ops = new Neo4jOperations({
    schema: 'neo4j',
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password'
  });

  try {
    await ops.connect();
    console.log('Connected to Neo4j\n');

    // Create test graph
    console.log('1. Creating test graph...');
    await ops.query(`
      CREATE (h:TransformExample:Host {hostname: 'server1', ip: '192.168.1.10'})
      CREATE (f:TransformExample:Finding {cve: 'CVE-2024-001', severity: 'CRITICAL', score: 95})
      CREATE (s:TransformExample:Source {name: 'NVD', url: 'https://nvd.nist.gov'})
      CREATE (h)-[:HAS_FINDING {discovered: '2024-01-01'}]->(f)
      CREATE (f)-[:FROM_SOURCE {verified: true}]->(s)
    `);
    console.log('   ✓ Test graph created\n');

    // Example 1: Manual transform configuration
    console.log('2. Using manual transform configuration...');
    const manualTransforms = new Neo4jTransforms()
      .add('host', { type: 'node' })
      .add('finding', { type: 'node' })
      .add('affects', { type: 'relationship' });

    const manualResults = await ops.query(
      'MATCH (h:TransformExample:Host)-[r:HAS_FINDING]->(f:TransformExample:Finding) RETURN h AS host, r AS affects, f AS finding',
      {},
      manualTransforms
    );

    console.log('   Raw Neo4j result would be:', typeof manualResults[0].host);
    console.log('   Transformed result:');
    console.log('     Host:', manualResults[0].host.hostname, '(IP:', manualResults[0].host.ip + ')');
    console.log('     Finding:', manualResults[0].finding.cve);
    console.log('     Relationship type:', manualResults[0].affects._type);
    console.log();

    // Example 2: CommonNeo4jTransforms.forNodes()
    console.log('3. Using CommonNeo4jTransforms.forNodes()...');
    const nodeTransforms = CommonNeo4jTransforms.forNodes(['host', 'finding']);

    const nodeResults = await ops.query(
      'MATCH (h:TransformExample:Host)-->(f:TransformExample:Finding) RETURN h AS host, f AS finding',
      {},
      nodeTransforms
    );

    console.log('   Transformed nodes:');
    console.log('     Host labels:', nodeResults[0].host._labels);
    console.log('     Host properties:', nodeResults[0].host.hostname);
    console.log('     Finding labels:', nodeResults[0].finding._labels);
    console.log('     Finding properties:', nodeResults[0].finding.cve);
    console.log();

    // Example 3: CommonNeo4jTransforms.forRelationships()
    console.log('4. Using CommonNeo4jTransforms.forRelationships()...');
    const relTransforms = CommonNeo4jTransforms.forRelationships(['affects']);

    const relResults = await ops.query(
      'MATCH (:TransformExample:Host)-[r:HAS_FINDING]->(:TransformExample:Finding) RETURN r AS affects',
      {},
      relTransforms
    );

    console.log('   Transformed relationship:');
    console.log('     Type:', relResults[0].affects._type);
    console.log('     Properties:', relResults[0].affects);
    console.log();

    // Example 4: Path transforms
    console.log('5. Using path transforms...');
    const pathTransforms = CommonNeo4jTransforms.forPaths(['path_to_source']);

    const pathResults = await ops.query(
      'MATCH path = (h:TransformExample:Host)-[*]->(s:TransformExample:Source) RETURN path AS path_to_source',
      {},
      pathTransforms
    );

    console.log('   Transformed path:');
    console.log('     Segments:', pathResults[0].path_to_source.length);
    pathResults[0].path_to_source.forEach((segment, idx) => {
      console.log(`     Segment ${idx + 1}: ${segment.start.hostname || segment.start.cve || segment.start.name} -[${segment.relationship._type}]-> ${segment.end.hostname || segment.end.cve || segment.end.name}`);
    });
    console.log();

    // Example 5: Column renaming
    console.log('6. Using column renaming...');
    const renameTransforms = new Neo4jTransforms()
      .add('h', { type: 'node', newName: 'host' })
      .add('f', { type: 'node', newName: 'finding' });

    const renameResults = await ops.query(
      'MATCH (h:TransformExample:Host)-->(f:TransformExample:Finding) RETURN h, f',
      {},
      renameTransforms
    );

    console.log('   Original columns (h, f) renamed to (host, finding):');
    console.log('     Has "host" property:', 'host' in renameResults[0]);
    console.log('     Has "finding" property:', 'finding' in renameResults[0]);
    console.log('     Has "h" property:', 'h' in renameResults[0]);
    console.log('     Has "f" property:', 'f' in renameResults[0]);
    console.log();

    // Example 6: Complete finding chain pattern
    console.log('7. Using CommonNeo4jTransforms.forFindingChain()...');
    const findingChainTransforms = new Neo4jTransforms()
      .add('h', { type: 'node', newName: 'host' })
      .add('f', { type: 'node', newName: 'finding' })
      .add('s', { type: 'node', newName: 'source' });

    const chainResults = await ops.query(
      'MATCH (h:TransformExample:Host)-->(f:TransformExample:Finding)-->(s:TransformExample:Source) RETURN h, f, s',
      {},
      findingChainTransforms
    );

    console.log('   Complete chain:');
    console.log('     Host:', chainResults[0].host.hostname);
    console.log('     Finding:', chainResults[0].finding.cve, '(severity:', chainResults[0].finding.severity + ')');
    console.log('     Source:', chainResults[0].source.name);
    console.log();

    // Example 7: Extracting specific properties
    console.log('8. Extracting specific properties...');
    const propsTransforms = new Neo4jTransforms()
      .add('host', { type: 'properties' })  // Only properties, no _labels or _id
      .add('labels', { type: 'labels', from: 'host_node' });

    const propsResults = await ops.query(
      'MATCH (h:TransformExample:Host) RETURN h AS host, h AS host_node',
      {},
      propsTransforms
    );

    console.log('   Properties only:', propsResults[0].host);
    console.log('   Labels only:', propsResults[0].labels);
    console.log();

    // Clean up
    console.log('9. Cleaning up test graph...');
    await ops.query('MATCH (n:TransformExample) DETACH DELETE n');
    console.log('   ✓ Test graph deleted\n');

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
neo4jTransformsExample().catch(console.error);
