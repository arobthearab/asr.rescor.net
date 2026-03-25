/**
 * Example 7: Phase Management
 *
 * Demonstrates complete schema lifecycle management:
 * - PhaseManager: Determine deployment phase
 * - SchemaMapper: Map phase to schema name
 * - SchemaProvisioner: Execute SQL files
 * - PhaseLifecycle: Manage 5-state lifecycle
 * - SchemaOrchestrator: High-level workflows
 *
 * NOTE: This is a demonstration. Update connection details and SQL file paths.
 */

import {
  DB2Operations,
  PhaseManager,
  SchemaMapper,
  SchemaProvisioner,
  PhaseLifecycle,
  SchemaOrchestrator,
  PHASES,
  LIFECYCLE_STATES
} from '../src/index.mjs';

async function phaseManagementExample() {
  console.log('=== Example 7: Phase Management ===\n');

  // Create operations instance
  const ops = new DB2Operations({
    schema: 'TCDEV',  // Will be overridden by orchestrator
    hostname: 'localhost',
    port: 50000,
    database: 'TESTDB',
    user: 'devuser',
    password: 'devpass123'
  });

  try {
    await ops.connect();

    // ========================================
    // Part 1: PhaseManager
    // ========================================
    console.log('1. PhaseManager - Determine deployment phase:\n');

    // Create phase manager
    const phaseManager = new PhaseManager({
      env: { NODE_ENV: 'development' }
    });

    const currentPhase = phaseManager.determinePhase();
    console.log(`   Current phase: ${currentPhase}`);
    console.log(`   Is development: ${phaseManager.isDevelopment()}`);
    console.log(`   Is production: ${phaseManager.isProduction()}`);

    const phaseConfig = phaseManager.getPhaseConfig();
    console.log(`   Allow debug: ${phaseConfig.allowDebug}`);
    console.log(`   Allow reset: ${phaseConfig.allowReset}`);
    console.log();

    // ========================================
    // Part 2: SchemaMapper
    // ========================================
    console.log('2. SchemaMapper - Map phase to schema:\n');

    // Create mapper for TestingCenter
    const mapper = SchemaMapper.forProject('TC');

    const devSchema = mapper.getSchema('development');
    const uatSchema = mapper.getSchema('uat');
    const prodSchema = mapper.getSchema('production');

    console.log(`   Development → ${devSchema}`);
    console.log(`   UAT → ${uatSchema}`);
    console.log(`   Production → ${prodSchema}`);

    // Reverse mapping
    const schemaPhase = mapper.getPhase('TCUAT');
    console.log(`   TCUAT → ${schemaPhase}`);

    // Validation
    const isValid = mapper.validate('development', 'TCDEV');
    console.log(`   Is 'development → TCDEV' valid: ${isValid}`);
    console.log();

    // ========================================
    // Part 3: SchemaProvisioner
    // ========================================
    console.log('3. SchemaProvisioner - SQL execution:\n');

    const provisioner = new SchemaProvisioner(ops);

    // Create schema
    await provisioner.createSchema('TCDEV_EXAMPLE');
    console.log('   ✓ Schema created: TCDEV_EXAMPLE');

    // Check if schema exists
    const exists = await provisioner.schemaExists('TCDEV_EXAMPLE');
    console.log(`   ✓ Schema exists: ${exists}`);

    // Execute inline SQL (simulated file execution)
    const createTableSQL = `
      CREATE TABLE TCDEV_EXAMPLE.DEMO (
        ID INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        NAME VARCHAR(100),
        CREATED TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await provisioner.operations.query(createTableSQL);
    console.log('   ✓ Table created: TCDEV_EXAMPLE.DEMO');

    // Insert test data
    const insertSQL = `
      INSERT INTO TCDEV_EXAMPLE.DEMO (NAME) VALUES
        ('Test 1'),
        ('Test 2'),
        ('Test 3')
    `;

    await provisioner.operations.query(insertSQL);
    console.log('   ✓ Test data inserted');
    console.log();

    // ========================================
    // Part 4: PhaseLifecycle
    // ========================================
    console.log('4. PhaseLifecycle - 5-state lifecycle:\n');

    const lifecycle = new PhaseLifecycle(provisioner, 'TCDEV_LIFECYCLE');

    console.log(`   Initial state: ${lifecycle.getState()}`);

    // Initiate
    await lifecycle.initiate({
      ddlFiles: []  // Inline SQL used instead for demo
    });
    console.log(`   After initiate: ${lifecycle.getState()}`);

    // Create table inline
    await provisioner.operations.query(`
      CREATE TABLE TCDEV_LIFECYCLE.DEMO (
        ID INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        NAME VARCHAR(100)
      )
    `);

    // Populate
    await lifecycle.populate({
      dataFiles: []  // Inline SQL used instead
    });
    console.log(`   After populate: ${lifecycle.getState()}`);

    await provisioner.operations.query(`
      INSERT INTO TCDEV_LIFECYCLE.DEMO (NAME) VALUES ('Lifecycle Test')
    `);

    // Get metadata
    const metadata = lifecycle.getMetadata();
    console.log(`   Initiated at: ${metadata.initiatedAt}`);
    console.log(`   Populated at: ${metadata.populatedAt}`);
    console.log();

    // ========================================
    // Part 5: SchemaOrchestrator
    // ========================================
    console.log('5. SchemaOrchestrator - High-level workflow:\n');

    const orchestrator = new SchemaOrchestrator(ops, {
      project: 'TC'
    });

    console.log(`   Current phase: ${orchestrator.getCurrentPhase()}`);
    console.log(`   Current schema: ${orchestrator.getCurrentSchema()}`);

    // Get status of all phases
    const status = await orchestrator.getPhaseStatus();
    console.log('\n   Phase status:');
    for (const [phase, info] of Object.entries(status)) {
      console.log(`     ${phase}: schema=${info.schema}, exists=${info.exists}`);
    }

    // Get orchestrator metadata
    const orchMetadata = orchestrator.getMetadata();
    console.log(`\n   Project: ${orchMetadata.project}`);
    console.log(`   Phase mapping:`, orchMetadata.phaseMapping);
    console.log();

    // ========================================
    // Part 6: Complete Workflow Example
    // ========================================
    console.log('6. Complete workflow example:\n');

    console.log('   Workflow: Setup development environment');
    console.log('   → Determine phase (development)');
    console.log('   → Map to schema (TCDEV)');
    console.log('   → Create schema');
    console.log('   → Execute DDL (tables, indexes)');
    console.log('   → Populate test data');
    console.log('   → Create backup');
    console.log('\n   (This would normally call:)');
    console.log('   await orchestrator.setupPhase("development", {');
    console.log('     ddlFiles: ["tables.sql", "indexes.sql"],');
    console.log('     dataFiles: ["test-data.sql"],');
    console.log('     createBackup: true');
    console.log('   });');
    console.log();

    // ========================================
    // Part 7: Cleanup
    // ========================================
    console.log('7. Cleanup:\n');

    // Drop example schemas
    await provisioner.dropSchema('TCDEV_EXAMPLE', { cascade: true });
    console.log('   ✓ Dropped TCDEV_EXAMPLE');

    await provisioner.dropSchema('TCDEV_LIFECYCLE', { cascade: true });
    console.log('   ✓ Dropped TCDEV_LIFECYCLE');
    console.log();

  } catch (err) {
    console.error('Error:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
  } finally {
    await ops.disconnect();
    console.log('8. Disconnected\n');
  }

  console.log('=== Example Complete! ===\n');
}

// Run example
phaseManagementExample().catch(console.error);
