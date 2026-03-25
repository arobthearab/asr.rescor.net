/**
 * Example 11: Neo4j Multi-Database
 *
 * Demonstrates:
 * - Database selection via schema parameter
 * - Neo4j Community Edition limitation (single database 'neo4j')
 * - Enterprise Edition multi-database support (tcdev, tc, spmdev, spm)
 * - Database isolation patterns
 * - Label-based isolation workaround for CE
 *
 * NOTE: Multi-database support requires Neo4j Enterprise Edition.
 * Community Edition only supports the 'neo4j' database.
 *
 * This example demonstrates patterns for both CE and Enterprise.
 */

import { Neo4jOperations } from '../src/Neo4jOperations.mjs';

async function neo4jMultiDatabaseExample() {
  console.log('=== Example 11: Neo4j Multi-Database ===\n');

  // Check if we have Enterprise or Community Edition
  console.log('NOTE: This example demonstrates multi-database patterns.');
  console.log('Community Edition only supports the "neo4j" database.');
  console.log('Enterprise Edition supports multiple named databases.\n');

  try {
    // Pattern 1: Community Edition - Single database with label-based isolation
    console.log('1. Community Edition Pattern: Label-based Isolation');
    console.log('   Using labels to simulate database separation\n');

    const ceOps = new Neo4jOperations({
      schema: 'neo4j',  // CE: Always use 'neo4j' database
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password'
    });

    await ceOps.connect();

    // Create data with environment labels (TCDEV, TC, SPMDEV, SPM)
    console.log('   Creating data with environment labels...');
    await ceOps.query(`
      CREATE (h1:TCDEV:Host {name: 'dev-server-1', env: 'development'})
      CREATE (h2:TC:Host {name: 'prod-server-1', env: 'production'})
      CREATE (h3:SPMDEV:Host {name: 'spm-dev-server-1', env: 'development'})
      CREATE (h4:SPM:Host {name: 'spm-prod-server-1', env: 'production'})
    `);
    console.log('   ✓ Created hosts with environment labels\n');

    // Query by environment (label-based isolation)
    console.log('   Querying TCDEV environment (development):');
    const tcdevHosts = await ceOps.query('MATCH (h:TCDEV:Host) RETURN h.name AS name');
    console.log('   ', tcdevHosts.map(r => r.name).join(', '));
    console.log();

    console.log('   Querying TC environment (production):');
    const tcHosts = await ceOps.query('MATCH (h:TC:Host) RETURN h.name AS name');
    console.log('   ', tcHosts.map(r => r.name).join(', '));
    console.log();

    console.log('   Querying SPMDEV environment (development):');
    const spmdevHosts = await ceOps.query('MATCH (h:SPMDEV:Host) RETURN h.name AS name');
    console.log('   ', spmdevHosts.map(r => r.name).join(', '));
    console.log();

    // Show isolation with WHERE clause
    console.log('   All development hosts (TCDEV + SPMDEV):');
    const devHosts = await ceOps.query(`
      MATCH (h:Host)
      WHERE h:TCDEV OR h:SPMDEV
      RETURN h.name AS name, labels(h) AS labels
    `);
    devHosts.forEach(host => {
      console.log('   -', host.name, '(labels:', host.labels.join(', ') + ')');
    });
    console.log();

    // Clean up CE data
    await ceOps.query('MATCH (n:Host) WHERE n:TCDEV OR n:TC OR n:SPMDEV OR n:SPM DETACH DELETE n');
    await ceOps.disconnect();
    console.log('   ✓ CE pattern demonstration complete\n');

    // Pattern 2: Enterprise Edition - Multiple databases
    console.log('2. Enterprise Edition Pattern: True Multi-Database');
    console.log('   Using separate databases for isolation\n');

    console.log('   Example code for Enterprise Edition:');
    console.log('   (This will fail on CE, shown for reference only)\n');

    console.log('   ```javascript');
    console.log('   // Connect to TCDEV database');
    console.log('   const tcdevOps = new Neo4jOperations({');
    console.log('     schema: \'tcdev\',  // Enterprise: Use database name');
    console.log('     uri: \'bolt://localhost:7687\',');
    console.log('     username: \'neo4j\',');
    console.log('     password: \'password\'');
    console.log('   });');
    console.log('   await tcdevOps.connect();');
    console.log('   await tcdevOps.query(\'CREATE (h:Host {name: "dev-server"})\');');
    console.log();

    console.log('   // Connect to TC database (production)');
    console.log('   const tcOps = new Neo4jOperations({');
    console.log('     schema: \'tc\',  // Different database');
    console.log('     uri: \'bolt://localhost:7687\',');
    console.log('     username: \'neo4j\',');
    console.log('     password: \'password\'');
    console.log('   });');
    console.log('   await tcOps.connect();');
    console.log('   await tcOps.query(\'CREATE (h:Host {name: "prod-server"})\');');
    console.log('   ```\n');

    console.log('   ✓ Enterprise pattern demonstration complete\n');

    // Pattern 3: Database selection strategy
    console.log('3. Database Selection Strategy');
    console.log('   Dynamically select database based on environment\n');

    console.log('   ```javascript');
    console.log('   // Function to get database name based on project and phase');
    console.log('   function getDatabaseName(project, phase) {');
    console.log('     if (process.env.NEO4J_EDITION === \'enterprise\') {');
    console.log('       // Enterprise: Use separate databases');
    console.log('       const dbMap = {');
    console.log('         \'tc\': { dev: \'tcdev\', uat: \'tcuat\', prod: \'tc\' },');
    console.log('         \'spm\': { dev: \'spmdev\', uat: \'spmuat\', prod: \'spm\' }');
    console.log('       };');
    console.log('       return dbMap[project][phase];');
    console.log('     } else {');
    console.log('       // Community: Always use \'neo4j\'');
    console.log('       return \'neo4j\';');
    console.log('     }');
    console.log('   }');
    console.log();

    console.log('   // Function to get label prefix for CE isolation');
    console.log('   function getLabelPrefix(project, phase) {');
    console.log('     if (process.env.NEO4J_EDITION === \'community\') {');
    console.log('       // Community: Use labels for isolation');
    console.log('       const labelMap = {');
    console.log('         \'tc\': { dev: \'TCDEV\', uat: \'TCUAT\', prod: \'TC\' },');
    console.log('         \'spm\': { dev: \'SPMDEV\', uat: \'SPMUAT\', prod: \'SPM\' }');
    console.log('       };');
    console.log('       return labelMap[project][phase];');
    console.log('     } else {');
    console.log('       // Enterprise: Labels not needed for isolation');
    console.log('       return null;');
    console.log('     }');
    console.log('   }');
    console.log('   ```\n');

    console.log('   ✓ Strategy pattern demonstration complete\n');

    // Summary
    console.log('4. Summary\n');
    console.log('   Community Edition (CE):');
    console.log('   - Single database: \'neo4j\'');
    console.log('   - Use labels for isolation: :TCDEV, :TC, :SPMDEV, :SPM');
    console.log('   - Query with label filters: MATCH (n:TCDEV:Host)');
    console.log('   - Lower cost, simpler setup\n');

    console.log('   Enterprise Edition (EE):');
    console.log('   - Multiple databases: tcdev, tc, spmdev, spm');
    console.log('   - True isolation at database level');
    console.log('   - Separate backup/restore per database');
    console.log('   - Higher cost, enterprise features\n');

    console.log('   Recommendation:');
    console.log('   - Development: Use CE with label-based isolation');
    console.log('   - Production: Consider EE if strict isolation required\n');

  } catch (err) {
    console.error('Error:', err.message);
    if (err.code) {
      console.error('Error Code:', err.code);
    }
    console.error();
  }
}

// Run example
neo4jMultiDatabaseExample().catch(console.error);
