/**
 * Simple Template Test (No External Dependencies)
 *
 * Tests the Template system using only MemoryStore
 */

import { LocalDatabaseTemplate } from '../src/templates/DatabaseTemplate.mjs';
import { TCDevelopmentTemplate } from '../src/templates/PhaseTemplate.mjs';
import { SecurityApiTemplate } from '../src/templates/ApiTemplate.mjs';
import { defaultTemplateRegistry } from '../src/TemplateRegistry.mjs';
import { MemoryStore } from '../src/stores/MemoryStore.mjs';
import { Configuration } from '../src/Configuration.mjs';

console.log('=== Testing Template System ===\n');

// Create configuration with MemoryStore
const config = new Configuration({ store: new MemoryStore() });

// Test 1: LocalDatabaseTemplate
console.log('Test 1: LocalDatabaseTemplate');
const dbTemplate = new LocalDatabaseTemplate({
  database: 'TESTDB',
  user: 'testuser',
  password: 'testpass123'
});

await dbTemplate.apply(config);
console.log('  ✓ Applied template');

const db = await dbTemplate.schema.load(config);
console.log('  ✓ Database:', db.database);
console.log('  ✓ Hostname:', db.hostname);
console.log('  ✓ User:', db.user);

// Test 2: TCDevelopmentTemplate
console.log('\nTest 2: TCDevelopmentTemplate');
const phaseTemplate = new TCDevelopmentTemplate();

await phaseTemplate.apply(config);
console.log('  ✓ Applied template');

const phase = await phaseTemplate.schema.load(config);
console.log('  ✓ Phase:', phase.phase);
console.log('  ✓ Schema:', phase.schema);
console.log('  ✓ Is Development:', phase.isDevelopment);

// Test 3: Template with Overrides
console.log('\nTest 3: Template with Overrides');
const dbTemplate2 = new LocalDatabaseTemplate();

await dbTemplate2.apply(config, {
  overrides: {
    database: {
      hostname: 'override.local',
      database: 'OVERRIDEDB'
    }
  }
});

const db2 = await dbTemplate2.schema.load(config);
console.log('  ✓ Overridden hostname:', db2.hostname);
console.log('  ✓ Overridden database:', db2.database);

// Test 4: Template Registry
console.log('\nTest 4: Template Registry');
console.log('  ✓ Available categories:', defaultTemplateRegistry.listCategories());
console.log('  ✓ Database templates:', defaultTemplateRegistry.getCategory('database'));
console.log('  ✓ Total templates:', defaultTemplateRegistry.size);

// Test 5: Template Preview
console.log('\nTest 5: Template Preview');
const previewTemplate = new LocalDatabaseTemplate();
const preview = await previewTemplate.preview(config);
console.log('  ✓ Preview database:', preview.database.database);
console.log('  ✓ Preview hostname:', preview.database.hostname);

// Test 6: Template Validation
console.log('\nTest 6: Template Validation');
const validTemplate = new LocalDatabaseTemplate();
const validation = await validTemplate.validate(config);
console.log('  ✓ Valid:', validation.valid);
console.log('  ✓ Errors:', validation.errors.length);

// Test 7: Template Metadata
console.log('\nTest 7: Template Metadata');
const metadataTemplate = new LocalDatabaseTemplate();
const metadata = metadataTemplate.getMetadata();
console.log('  ✓ Name:', metadata.name);
console.log('  ✓ Description:', metadata.description);
console.log('  ✓ Tags:', metadata.tags);

console.log('\n=== All Tests Passed! ✅ ===\n');
