# Configuration Template System Guide

**Phase 3 #2: Configuration Templates**

## Overview

The Template system provides pre-configured, reusable configuration patterns that make it easy to set up common configurations with sensible defaults.

### Benefits

- **Quick Setup**: Bootstrap configurations in seconds
- **Best Practices**: Templates encode recommended settings
- **Consistency**: Same configs across environments
- **Customizable**: Easy to override specific values
- **Self-Documenting**: Templates serve as examples
- **Error Prevention**: Pre-validated configurations

---

## Quick Start

```javascript
import { LocalDatabaseTemplate, Configuration } from '@rescor/core-config';

const config = new Configuration();
await config.initialize();

// Apply template
const template = new LocalDatabaseTemplate();
await template.apply(config);

// Done! Database is configured with sensible defaults
```

---

## Core Concepts

### Template vs Schema

**Schema**: Defines *structure* (what fields exist)
**Template**: Provides *values* (pre-filled defaults)

```javascript
// Schema: Structure only
const schema = new DatabaseSchema();
await schema.load(config);  // May fail if values not set

// Template: Structure + Values
const template = new LocalDatabaseTemplate();
await template.apply(config);  // Sets values, then you can load
const db = await template.schema.load(config);  // Guaranteed to work
```

---

## Built-in Templates

### Database Templates

#### LocalDatabaseTemplate

**Purpose**: Local development database

**Defaults**:
```javascript
{
  hostname: 'localhost',
  port: '50000',
  database: 'DEVDB',
  protocol: 'TCPIP',
  user: 'devuser',
  password: 'devpass123'
}
```

**Usage**:
```javascript
const template = new LocalDatabaseTemplate({
  database: 'MYAPP',
  user: 'myuser',
  password: 'mypass'
});
await template.apply(config);
```

#### TestDatabaseTemplate

**Purpose**: Isolated test database

**Usage**:
```javascript
const template = new TestDatabaseTemplate({ database: 'TESTDB' });
await template.apply(config);
```

#### UATDatabaseTemplate

**Purpose**: UAT environment database

**Note**: Requires password override for security

```javascript
const template = new UATDatabaseTemplate({
  hostname: 'uat-db.rescor.net',
  database: 'UATDB'
});

await template.apply(config, {
  overrides: {
    database: { password: process.env.UAT_DB_PASSWORD }
  }
});
```

#### ProductionDatabaseTemplate

**Purpose**: Production database with security best practices

**Note**: Requires secure password setup

```javascript
const template = new ProductionDatabaseTemplate({
  hostname: 'prod-db.rescor.net',
  database: 'PRODDB'
});

await template.apply(config, {
  overrides: {
    database: {
      user: process.env.PROD_DB_USER,
      password: process.env.PROD_DB_PASSWORD
    }
  }
});
```

#### DockerDatabaseTemplate

**Purpose**: Database in Docker container

**Usage**:
```javascript
const template = new DockerDatabaseTemplate({
  containerName: 'db2-dev',
  database: 'DOCKERDB'
});
await template.apply(config);
```

---

### API Templates

#### SecurityApiTemplate

**Purpose**: Security vulnerability databases (NVD)

**Usage**:
```javascript
const template = new SecurityApiTemplate({ nvdKey: 'your-nvd-api-key' });
await template.apply(config);
```

#### DevelopmentApiTemplate

**Purpose**: Development tools (GitHub)

**Usage**:
```javascript
const template = new DevelopmentApiTemplate({ githubKey: 'ghp_your_token' });
await template.apply(config);
```

#### AIApiTemplate

**Purpose**: AI/ML services (OpenAI, Anthropic)

**Usage**:
```javascript
const template = new AIApiTemplate({
  apis: ['openai', 'anthropic'],
  openaiKey: 'sk-...',
  anthropicKey: 'sk-ant-...'
});
await template.apply(config);
```

#### CommunicationApiTemplate

**Purpose**: Communication services (SendGrid, Twilio, Slack)

**Usage**:
```javascript
const template = new CommunicationApiTemplate({
  apis: ['sendgrid', 'slack'],
  sendgridKey: 'SG....',
  slackKey: 'xoxb-...'
});
await template.apply(config);
```

#### CompleteApiTemplate

**Purpose**: All common APIs configured

**Usage**:
```javascript
const template = new CompleteApiTemplate({
  nvdKey: '...',
  githubKey: '...',
  openaiKey: '...',
  // ... etc
});
await template.apply(config);
```

---

### Phase Templates

#### Project-Specific Templates

**Test Center (TC)**:
```javascript
// Development
const template = new TCDevelopmentTemplate();
await template.apply(config);
// Sets: phase=DEV, prefix=TC, log_level=debug, schema=TCDEV

// UAT
const template = new TCUATTemplate();
await template.apply(config);
// Sets: phase=UAT, prefix=TC, log_level=info, schema=TCUAT

// Production
const template = new TCProductionTemplate();
await template.apply(config);
// Sets: phase=PROD, prefix=TC, log_level=warn, schema=TC
```

**SPM**:
```javascript
const template = new SPMDevelopmentTemplate();
const template = new SPMUATTemplate();
const template = new SPMProductionTemplate();
```

#### Generic Templates

```javascript
// Generic development (any project)
const template = new DevelopmentPhaseTemplate('MYPROJECT');
await template.apply(config);
```

---

## Template Registry

The `defaultTemplateRegistry` provides centralized access to all templates.

### List Templates

```javascript
import { defaultTemplateRegistry } from '@rescor/core-config';

// List all templates
console.log(defaultTemplateRegistry.list());
// ['database:local', 'database:test', 'api:security', ...]

// List by category
console.log(defaultTemplateRegistry.getCategory('database'));
// ['database:local', 'database:test', 'database:uat', ...]

// List categories
console.log(defaultTemplateRegistry.listCategories());
// ['database', 'api', 'phase']
```

### Apply by Name

```javascript
// Apply template by name
await defaultTemplateRegistry.apply('database:local', config);

// Apply with options
await defaultTemplateRegistry.apply('database:test', config, {
  templateOptions: { database: 'MYTEST' },
  overrides: { database: { hostname: 'test.local' } }
});
```

### Search Templates

```javascript
// Search by tag
const devTemplates = defaultTemplateRegistry.searchByTag('development');
// ['database:local', 'database:test', 'api:development', 'phase:tc:dev', ...]

const prodTemplates = defaultTemplateRegistry.searchByTag('production');
// ['database:prod', 'phase:tc:prod', ...]
```

---

## Advanced Usage

### Template with Overrides

Override specific values while keeping defaults:

```javascript
const template = new LocalDatabaseTemplate();

await template.apply(config, {
  overrides: {
    database: {
      hostname: 'custom-db.local',
      database: 'CUSTOMDB'
      // port, user, password use defaults
    }
  }
});
```

### Template Preview

See what values would be applied without applying:

```javascript
const template = new UATDatabaseTemplate();

const preview = await template.preview(config, {
  overrides: {
    database: { password: 'secret' }
  }
});

console.log(preview);
// { database: { hostname: 'uat-db.rescor.net', ..., password: 'secret' } }
```

### Template Merging

Merge with existing configuration:

```javascript
// Existing config has hostname='old.local'
const template = new LocalDatabaseTemplate();

// Merge: keeps existing values, adds missing ones
await template.apply(config, {
  merge: true  // Existing values take precedence
});

// Force: overwrites existing values
await template.apply(config, {
  merge: true,
  force: true  // Template values take precedence
});
```

### Template Validation

Validate template before applying:

```javascript
const template = new ProductionDatabaseTemplate();

const validation = await template.validate(config);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
} else {
  await template.apply(config);
}
```

### Template Cloning

Clone and modify templates:

```javascript
const original = new LocalDatabaseTemplate();

const modified = original.clone({
  database: {
    hostname: 'cloned.local',
    database: 'CLONEDDB'
  }
});

await modified.apply(config);
```

---

## Factory Functions

Convenient factory functions for creating templates:

### createDatabaseTemplate

```javascript
import { createDatabaseTemplate } from '@rescor/core-config';

// Create by environment name
const devTemplate = createDatabaseTemplate('local');
const testTemplate = createDatabaseTemplate('test');
const uatTemplate = createDatabaseTemplate('uat');
const prodTemplate = createDatabaseTemplate('prod');

// With options
const dockerTemplate = createDatabaseTemplate('docker', {
  containerName: 'my-db',
  database: 'DOCKERDB'
});
```

**Available environments**: local, dev, test, uat, prod, production, docker

### createApiTemplate

```javascript
import { createApiTemplate } from '@rescor/core-config';

const securityTemplate = createApiTemplate('security');
const devTemplate = createApiTemplate('development');
const aiTemplate = createApiTemplate('ai');
const commTemplate = createApiTemplate('communication');
const completeTemplate = createApiTemplate('complete');
```

**Available categories**: security, development, ai, ml, communication, payment, complete

### createPhaseTemplate

```javascript
import { createPhaseTemplate } from '@rescor/core-config';

// Project + phase
const tcDevTemplate = createPhaseTemplate('TC', 'dev');
const tcUatTemplate = createPhaseTemplate('TC', 'uat');
const spmProdTemplate = createPhaseTemplate('SPM', 'prod');

// Generic
const customDevTemplate = createPhaseTemplate('MYPROJECT', 'dev');
```

---

## Creating Custom Templates

### Basic Custom Template

```javascript
import { Template, DatabaseSchema } from '@rescor/core-config';

class MyDatabaseTemplate extends Template {
  constructor() {
    super(
      new DatabaseSchema(),  // Schema to use
      {                      // Default values
        database: {
          hostname: 'my-db.local',
          port: '50000',
          database: 'MYDB',
          protocol: 'TCPIP',
          user: 'myuser',
          password: 'mypass'
        }
      },
      {                      // Metadata
        name: 'MyDatabaseTemplate',
        description: 'My custom database template',
        tags: ['custom', 'development']
      }
    );
  }
}

// Use it
const template = new MyDatabaseTemplate();
await template.apply(config);
```

### Custom Template with Options

```javascript
class ConfigurableDatabaseTemplate extends Template {
  constructor(environment, options = {}) {
    const envDefaults = {
      dev: { hostname: 'dev-db.local', database: 'DEVDB' },
      uat: { hostname: 'uat-db.local', database: 'UATDB' },
      prod: { hostname: 'prod-db.local', database: 'PRODDB' }
    };

    const defaults = envDefaults[environment];

    super(
      new DatabaseSchema(),
      {
        database: {
          ...defaults,
          port: options.port || '50000',
          protocol: 'TCPIP',
          user: options.user || 'dbuser',
          password: options.password || ''
        }
      },
      {
        name: `ConfigurableDatabaseTemplate-${environment}`,
        description: `Configurable database for ${environment}`,
        tags: [environment, 'custom'],
        environment
      }
    );
  }
}

// Use it
const template = new ConfigurableDatabaseTemplate('dev', {
  user: 'developer',
  password: 'devpass123'
});
await template.apply(config);
```

### Register Custom Template

```javascript
import { defaultTemplateRegistry } from '@rescor/core-config';

// Register
defaultTemplateRegistry.register('database:custom', MyDatabaseTemplate, 'database');

// Use via registry
await defaultTemplateRegistry.apply('database:custom', config);
```

---

## Complete Environment Setup

Set up entire environments quickly:

### Test Center Development

```javascript
import { defaultTemplateRegistry, Configuration } from '@rescor/core-config';

const config = new Configuration();
await config.initialize();

// Apply templates in sequence
await defaultTemplateRegistry.apply('database:local', config, {
  templateOptions: { database: 'TCDEV' }
});

await defaultTemplateRegistry.apply('phase:tc:dev', config);

await defaultTemplateRegistry.apply('api:security', config, {
  templateOptions: { nvdKey: process.env.NVD_API_KEY }
});

console.log('TC Development environment ready!');
```

### Production Deployment

```javascript
// Production requires secure credentials
await defaultTemplateRegistry.apply('database:prod', config, {
  templateOptions: {
    hostname: 'prod-db.rescor.net',
    database: 'TC'
  },
  overrides: {
    database: {
      user: process.env.PROD_DB_USER,
      password: process.env.PROD_DB_PASSWORD
    }
  }
});

await defaultTemplateRegistry.apply('phase:tc:prod', config);

await defaultTemplateRegistry.apply('api:complete', config, {
  templateOptions: {
    nvdKey: process.env.NVD_API_KEY,
    // ... other secure keys from environment
  }
});

console.log('Production environment configured securely!');
```

---

## Best Practices

### 1. Use Templates for Standard Configs

```javascript
// Good: Use template for standard setup
const template = new LocalDatabaseTemplate();
await template.apply(config);

// Avoid: Manually setting each value
await config.set(ClassifiedDatum.setting('database', 'hostname').with('localhost'));
// ... 5 more lines
```

### 2. Override Sensitive Values

```javascript
// Good: Override passwords from environment
const template = new UATDatabaseTemplate();
await template.apply(config, {
  overrides: {
    database: { password: process.env.DB_PASSWORD }
  }
});

// Avoid: Hardcoding passwords
const template = new UATDatabaseTemplate({ password: 'hardcoded123' });
```

### 3. Preview Before Applying

```javascript
// Good: Preview in production
const template = new ProductionDatabaseTemplate();
const preview = await template.preview(config);
console.log('Will apply:', preview);
const confirmed = await askUserConfirmation();
if (confirmed) {
  await template.apply(config);
}

// Risky: Apply directly to production
await template.apply(config);  // No preview!
```

### 4. Use Factory Functions

```javascript
// Good: Concise factory function
const template = createDatabaseTemplate('uat', { database: 'MYAPP' });

// Verbose: Direct instantiation
const template = new UATDatabaseTemplate({ database: 'MYAPP' });
```

### 5. Tag Custom Templates

```javascript
// Good: Descriptive tags
class MyTemplate extends Template {
  constructor() {
    super(schema, defaults, {
      tags: ['custom', 'myproject', 'development']
    });
  }
}

// Find later:
const myTemplates = defaultTemplateRegistry.searchByTag('myproject');
```

---

## Troubleshooting

### "Template 'xyz' not registered"

**Solution**: Register the template first:
```javascript
defaultTemplateRegistry.register('xyz', XyzTemplate, 'category');
```

### Template validation fails

**Solution**: Check required fields:
```javascript
const validation = await template.validate(config);
console.log('Errors:', validation.errors);
```

### Override not working

**Solution**: Ensure correct nesting:
```javascript
// Correct
overrides: {
  database: { hostname: 'new.local' }
}

// Incorrect
overrides: {
  hostname: 'new.local'  // Missing 'database' key
}
```

---

## Examples

See `examples/template-example.mjs` for comprehensive examples:
1. Direct template usage
2. Template with overrides
3. Registry usage
4. Template preview
5. Factory functions
6. Validation
7. Template cloning
8. Metadata and search
9. Complete environment setup

**Run examples**:
```bash
cd packages/core-config
node examples/template-example.mjs
```

---

## See Also

- [Schema Guide](./SCHEMA-GUIDE.md) - Configuration schemas
- [ClassifiedDatum API](./PHASE1-SUMMARY.md) - Data classification
- [Examples](./examples/) - Code examples
