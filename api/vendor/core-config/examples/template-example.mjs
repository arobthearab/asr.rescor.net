/**
 * Template System Examples
 *
 * Demonstrates Phase 3 #2: Configuration Templates
 */

// Import specific modules to avoid Infisical dependency
import { LocalDatabaseTemplate, createDatabaseTemplate } from '../src/templates/DatabaseTemplate.mjs';
import { SecurityApiTemplate } from '../src/templates/ApiTemplate.mjs';
import { TCDevelopmentTemplate, createPhaseTemplate } from '../src/templates/PhaseTemplate.mjs';
import { defaultTemplateRegistry } from '../src/TemplateRegistry.mjs';
import { MemoryStore } from '../src/stores/MemoryStore.mjs';
import { Configuration } from '../src/Configuration.mjs';

console.log('=== Template System Examples ===\n');

// Create configuration with MemoryStore
const config = new Configuration({ store: new MemoryStore() });

// ============================================================================
// Example 1: Direct Template Usage
// ============================================================================

async function example1_DirectTemplateUsage() {
  console.log('Example 1: Direct Template Usage\n');

  const template = new LocalDatabaseTemplate({
    database: 'MYAPP',
    user: 'myuser',
    password: 'mypass123'
  });

  // Apply template to configuration
  await template.apply(config);

  console.log('  ✓ Applied LocalDatabaseTemplate');
  console.log('  ✓ Template metadata:', JSON.stringify(template.getMetadata(), null, 2));

  // Load the configuration
  const db = await template.schema.load(config);
  console.log('  ✓ Database:', db.database);
  console.log('  ✓ Hostname:', db.hostname);
  console.log('  ✓ Port:', db.port);
}

// ============================================================================
// Example 2: Template with Overrides
// ============================================================================

async function example2_TemplateWithOverrides() {
  console.log('\nExample 2: Template with Overrides\n');

  const template = new LocalDatabaseTemplate();

  // Apply with overrides
  await template.apply(config, {
    overrides: {
      database: {
        hostname: 'custom-db.local',
        database: 'CUSTOMDB'
      }
    }
  });

  const db = await template.schema.load(config);
  console.log('  ✓ Overridden hostname:', db.hostname);
  console.log('  ✓ Overridden database:', db.database);
  console.log('  ✓ Default port kept:', db.port);
}

// ============================================================================
// Example 3: Template Registry Usage
// ============================================================================

async function example3_TemplateRegistry() {
  console.log('\nExample 3: Template Registry Usage\n');

  // List available templates
  console.log('  Available templates:');
  console.log('    Database:', defaultTemplateRegistry.getCategory('database'));
  console.log('    API:', defaultTemplateRegistry.getCategory('api'));
  console.log('    Phase:', defaultTemplateRegistry.getCategory('phase').slice(0, 5), '...');

  // Apply template by name
  await defaultTemplateRegistry.apply('database:test', config, {
    templateOptions: {
      database: 'TESTDB'
    }
  });

  console.log('  ✓ Applied database:test template');

  // Apply phase template
  await defaultTemplateRegistry.apply('phase:tc:dev', config);
  console.log('  ✓ Applied phase:tc:dev template');
}

// ============================================================================
// Example 4: Template Preview
// ============================================================================

async function example4_TemplatePreview() {
  console.log('\nExample 4: Template Preview\n');

  const template = new TCDevelopmentTemplate();

  // Preview without applying
  const preview = await template.preview(config);
  console.log('  Preview of TC Development template:');
  console.log('    Phase:', preview.app.phase);
  console.log('    Project Prefix:', preview.app.project_prefix);
  console.log('    Log Level:', preview.app.log_level);

  // Preview with overrides
  const previewWithOverrides = await template.preview(config, {
    overrides: {
      app: {
        log_level: 'info'
      }
    }
  });
  console.log('  Preview with overrides:');
  console.log('    Log Level:', previewWithOverrides.app.log_level);
}

// ============================================================================
// Example 5: Template Factory Functions
// ============================================================================

async function example5_FactoryFunctions() {
  console.log('\nExample 5: Template Factory Functions\n');

  // Create database template by environment
  const devDbTemplate = createDatabaseTemplate('local', { database: 'DEVDB' });
  await devDbTemplate.apply(config);
  console.log('  ✓ Created and applied local database template');

  const testDbTemplate = createDatabaseTemplate('test', { database: 'TESTDB' });
  await testDbTemplate.apply(config);
  console.log('  ✓ Created and applied test database template');

  // Create phase template by project and phase
  const tcDevTemplate = createPhaseTemplate('TC', 'dev');
  await tcDevTemplate.apply(config);
  console.log('  ✓ Created and applied TC development phase template');

  const spmUatTemplate = createPhaseTemplate('SPM', 'uat');
  await spmUatTemplate.apply(config);
  console.log('  ✓ Created and applied SPM UAT phase template');
}

// ============================================================================
// Example 6: Template Validation
// ============================================================================

async function example6_TemplateValidation() {
  console.log('\nExample 6: Template Validation\n');

  const template = new LocalDatabaseTemplate({
    database: 'VALIDDB',
    user: 'validuser',
    password: 'validpass'
  });

  const validation = await template.validate(config);
  console.log('  Validation result:');
  console.log('    Valid:', validation.valid);
  console.log('    Errors:', validation.errors.length === 0 ? 'None' : validation.errors);
}

// ============================================================================
// Example 7: Template Cloning
// ============================================================================

async function example7_TemplateCloning() {
  console.log('\nExample 7: Template Cloning\n');

  const originalTemplate = new LocalDatabaseTemplate();

  // Clone with modifications
  const clonedTemplate = originalTemplate.clone({
    database: {
      hostname: 'cloned-db.local',
      database: 'CLONEDDB'
    }
  });

  console.log('  Original template database:', originalTemplate.defaults.database.database);
  console.log('  Cloned template database:', clonedTemplate.defaults.database.database);
  console.log('  ✓ Template cloned with modifications');
}

// ============================================================================
// Example 8: Template Metadata and Search
// ============================================================================

async function example8_MetadataAndSearch() {
  console.log('\nExample 8: Template Metadata and Search\n');

  // Get all metadata
  const allMetadata = defaultTemplateRegistry.getAllMetadata();
  console.log('  Total templates:', Object.keys(allMetadata).length);

  // Search by tag
  const devTemplates = defaultTemplateRegistry.searchByTag('development');
  console.log('  Development templates:', devTemplates);

  const prodTemplates = defaultTemplateRegistry.searchByTag('production');
  console.log('  Production templates:', prodTemplates);

  // Get template metadata
  const template = new LocalDatabaseTemplate();
  const metadata = template.getMetadata();
  console.log('  LocalDatabaseTemplate metadata:');
  console.log('    Name:', metadata.name);
  console.log('    Description:', metadata.description);
  console.log('    Tags:', metadata.tags);
}

// ============================================================================
// Example 9: Complete Environment Setup
// ============================================================================

async function example9_CompleteEnvironmentSetup() {
  console.log('\nExample 9: Complete Environment Setup\n');

  // Set up complete TC development environment
  await defaultTemplateRegistry.apply('database:local', config, {
    templateOptions: { database: 'TCDEV' }
  });
  console.log('  ✓ Applied database template');

  await defaultTemplateRegistry.apply('phase:tc:dev', config);
  console.log('  ✓ Applied phase template');

  await defaultTemplateRegistry.apply('api:security', config, {
    templateOptions: { nvdKey: 'test-key-123' }
  });
  console.log('  ✓ Applied API template');

  console.log('  ✅ Complete TC development environment configured!');
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
  try {
    await example1_DirectTemplateUsage();
    await example2_TemplateWithOverrides();
    await example3_TemplateRegistry();
    await example4_TemplatePreview();
    await example5_FactoryFunctions();
    await example6_TemplateValidation();
    await example7_TemplateCloning();
    await example8_MetadataAndSearch();
    await example9_CompleteEnvironmentSetup();

    console.log('\n=== All Template Examples Completed Successfully ===\n');
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
  example1_DirectTemplateUsage,
  example2_TemplateWithOverrides,
  example3_TemplateRegistry,
  example4_TemplatePreview,
  example5_FactoryFunctions,
  example6_TemplateValidation,
  example7_TemplateCloning,
  example8_MetadataAndSearch,
  example9_CompleteEnvironmentSetup
};
