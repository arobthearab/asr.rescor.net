/**
 * Schema System Examples
 *
 * Demonstrates Phase 3: Structured Configuration Schemas
 */

import {
  Configuration,
  DatabaseSchema,
  ApiSchema,
  PhaseSchema,
  defaultRegistry
} from '../src/index.mjs';

// ============================================================================
// Example 1: Direct Schema Usage
// ============================================================================

async function example1_DirectSchemaUsage() {
  console.log('\n=== Example 1: Direct Schema Usage ===\n');

  const config = new Configuration();
  await config.initialize();

  // Create and load database schema
  const dbSchema = new DatabaseSchema();

  // First, save some test data
  await dbSchema.save(config, {
    database: {
      hostname: 'localhost',
      port: '50000',
      database: 'TESTDB',
      protocol: 'TCPIP',
      user: 'admin',
      password: 'testpass123'
    }
  });

  // Load and use the database configuration
  const db = await dbSchema.load(config);

  console.log('Database Configuration:');
  console.log('  Hostname:', db.hostname);
  console.log('  Port:', db.port, '(type:', typeof db.port, ')'); // number, not string!
  console.log('  Database:', db.database);
  console.log('  User:', db.user);
  console.log('  Connection String:', db.connectionString);
}

// ============================================================================
// Example 2: Schema Registry Usage
// ============================================================================

async function example2_SchemaRegistry() {
  console.log('\n=== Example 2: Schema Registry Usage ===\n');

  const config = new Configuration();
  await config.initialize();

  // List available schemas
  console.log('Available schemas:', defaultRegistry.list());

  // Save API configuration
  const apiSchema = defaultRegistry.create('api', { apis: ['nvd', 'github'] });
  await apiSchema.save(config, {
    api: {
      nvd_base_url: 'https://services.nvd.nist.gov/rest/json',
      nvd_key: 'test-nvd-key-12345',
      github_base_url: 'https://api.github.com',
      github_key: 'ghp_test123456789'
    }
  });

  // Load using registry
  const apis = await defaultRegistry.load('api', config, { apis: ['nvd', 'github'] });

  console.log('API Configuration:');
  console.log('  NVD Base URL:', apis.nvd.baseUrl);
  console.log('  NVD Key:', apis.nvd.key.substring(0, 8) + '...');
  console.log('  GitHub Base URL:', apis.github.baseUrl);
  console.log('  GitHub Key:', apis.github.key.substring(0, 8) + '...');
}

// ============================================================================
// Example 3: Phase Schema with Computed Properties
// ============================================================================

async function example3_PhaseSchema() {
  console.log('\n=== Example 3: Phase Schema ===\n');

  const config = new Configuration();
  await config.initialize();

  // Create phase schema for Test Center
  const phaseSchema = new PhaseSchema({ projectPrefix: 'TC' });

  // Save phase configuration
  await phaseSchema.save(config, {
    app: {
      phase: 'DEV',
      project_prefix: 'TC',
      log_level: 'debug'
    }
  });

  // Load with computed properties
  const phase = await phaseSchema.load(config);

  console.log('Phase Configuration:');
  console.log('  Phase:', phase.phase);
  console.log('  Project Prefix:', phase.projectPrefix);
  console.log('  Log Level:', phase.logLevel);
  console.log('  Schema Name:', phase.schema);  // TCDEV
  console.log('  Is Development:', phase.isDevelopment);  // true
  console.log('  Is Production:', phase.isProduction);    // false

  // Test other phases
  await phaseSchema.save(config, { app: { phase: 'PROD' } });
  const prodPhase = await phaseSchema.load(config);
  console.log('\nProduction Schema Name:', prodPhase.schema); // TC (no suffix)
}

// ============================================================================
// Example 4: Schema Validation and Completeness Checking
// ============================================================================

async function example4_ValidationAndCompleteness() {
  console.log('\n=== Example 4: Validation & Completeness ===\n');

  const config = new Configuration();
  await config.initialize();

  const dbSchema = new DatabaseSchema();

  // Check if schema is complete (should be false initially)
  let isComplete = await dbSchema.isComplete(config);
  console.log('Database schema complete?', isComplete);

  // Save partial configuration
  await dbSchema.save(config, {
    database: {
      hostname: 'localhost',
      port: '50000'
      // Missing: database, user, password
    }
  });

  // Check again (still incomplete)
  isComplete = await dbSchema.isComplete(config);
  console.log('Database schema complete after partial save?', isComplete);

  // Complete the configuration
  await dbSchema.save(config, {
    database: {
      hostname: 'localhost',
      port: '50000',
      database: 'TESTDB',
      user: 'admin',
      password: 'testpass123'
    }
  });

  // Check again (now complete)
  isComplete = await dbSchema.isComplete(config);
  console.log('Database schema complete after full save?', isComplete);

  if (isComplete) {
    const db = await dbSchema.load(config);
    console.log('Successfully loaded:', db.database);
  }
}

// ============================================================================
// Example 5: Custom Schema
// ============================================================================

import { Schema, ClassifiedDatum } from '../src/index.mjs';

class EmailSchema extends Schema {
  constructor() {
    super([
      ClassifiedDatum.setting('email', 'smtp_host', {
        description: 'SMTP server hostname',
        default: 'smtp.gmail.com'
      }),
      ClassifiedDatum.setting('email', 'smtp_port', {
        description: 'SMTP server port',
        default: '587'
      }),
      ClassifiedDatum.credential('email', 'smtp_user', {
        description: 'SMTP username',
        required: true
      }),
      ClassifiedDatum.credential('email', 'smtp_password', {
        description: 'SMTP password',
        required: true
      }),
      ClassifiedDatum.setting('email', 'from_address', {
        description: 'Default from address',
        required: true
      })
    ]);
  }

  toTypedObject() {
    return {
      host: this.getValue('email', 'smtp_host') || 'smtp.gmail.com',
      port: parseInt(this.getValue('email', 'smtp_port') || '587'),
      user: this.getValue('email', 'smtp_user'),
      password: this.getValue('email', 'smtp_password'),
      from: this.getValue('email', 'from_address'),

      // Computed property: authentication config
      auth: {
        user: this.getValue('email', 'smtp_user'),
        pass: this.getValue('email', 'smtp_password')
      }
    };
  }
}

async function example5_CustomSchema() {
  console.log('\n=== Example 5: Custom Schema ===\n');

  const config = new Configuration();
  await config.initialize();

  // Create and use custom schema
  const emailSchema = new EmailSchema();

  await emailSchema.save(config, {
    email: {
      smtp_host: 'smtp.gmail.com',
      smtp_port: '587',
      smtp_user: 'noreply@rescor.net',
      smtp_password: 'secret123',
      from_address: 'RESCOR System <noreply@rescor.net>'
    }
  });

  const email = await emailSchema.load(config);

  console.log('Email Configuration:');
  console.log('  Host:', email.host);
  console.log('  Port:', email.port, '(type:', typeof email.port, ')');
  console.log('  From:', email.from);
  console.log('  Auth User:', email.auth.user);

  // Register custom schema
  defaultRegistry.register('email', EmailSchema);
  console.log('\nRegistered schemas:', defaultRegistry.list());

  // Load via registry
  const emailViaRegistry = await defaultRegistry.load('email', config);
  console.log('Loaded via registry:', emailViaRegistry.from);
}

// ============================================================================
// Example 6: Schema Metadata and Introspection
// ============================================================================

async function example6_SchemaMetadata() {
  console.log('\n=== Example 6: Schema Metadata ===\n');

  const dbSchema = new DatabaseSchema();

  // Get metadata
  const metadata = dbSchema.getMetadata();
  console.log('Schema Metadata:');
  console.log('  Name:', metadata.name);
  console.log('  Item Count:', metadata.itemCount);
  console.log('  Domains:', metadata.domains);
  console.log('  Credentials:', metadata.credentials);
  console.log('  Settings:', metadata.settings);

  // Get required fields
  const fields = dbSchema.getRequiredFields();
  console.log('\nRequired Fields:');
  fields.forEach(field => {
    console.log(`  - ${field.fullKey} (${field.classification}): ${field.description}`);
  });

  // Export as JSON
  const json = dbSchema.toJSON();
  console.log('\nSchema as JSON:');
  console.log(JSON.stringify(json, null, 2));
}

// ============================================================================
// Example 7: Multiple Schemas Together
// ============================================================================

async function example7_MultipleSchemas() {
  console.log('\n=== Example 7: Multiple Schemas Together ===\n');

  const config = new Configuration();
  await config.initialize();

  // Load all configurations
  const [db, apis, phase] = await Promise.all([
    defaultRegistry.load('database', config).catch(() => ({
      hostname: 'localhost',
      port: 50000,
      database: 'DEMO'
    })),
    defaultRegistry.load('api', config, { apis: ['nvd'] }).catch(() => ({
      nvd: { baseUrl: 'https://services.nvd.nist.gov/rest/json', key: 'not_configured' }
    })),
    defaultRegistry.load('phase', config, { projectPrefix: 'TC' }).catch(() => ({
      phase: 'DEV',
      schema: 'TCDEV'
    }))
  ]);

  console.log('Application Configuration:');
  console.log('  Database:', db.database || 'DEMO');
  console.log('  Schema:', phase.schema);
  console.log('  Phase:', phase.phase);
  console.log('  NVD API:', apis.nvd.baseUrl);
}

// ============================================================================
// Run Examples
// ============================================================================

async function runAllExamples() {
  try {
    await example1_DirectSchemaUsage();
    await example2_SchemaRegistry();
    await example3_PhaseSchema();
    await example4_ValidationAndCompleteness();
    await example5_CustomSchema();
    await example6_SchemaMetadata();
    await example7_MultipleSchemas();

    console.log('\n=== All Examples Completed Successfully ===\n');
  } catch (err) {
    console.error('Error running examples:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  example1_DirectSchemaUsage,
  example2_SchemaRegistry,
  example3_PhaseSchema,
  example4_ValidationAndCompleteness,
  example5_CustomSchema,
  example6_SchemaMetadata,
  example7_MultipleSchemas
};
