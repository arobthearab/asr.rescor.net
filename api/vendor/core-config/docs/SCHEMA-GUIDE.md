# Configuration Schema System Guide

**Phase 3 Feature: Structured Configuration Schemas**

## Overview

The Schema system provides reusable, typed configuration patterns that eliminate repetitive code and standardize configuration across RESCOR projects.

### Benefits

- **DRY Principle**: Define configuration structure once, use everywhere
- **Type Safety**: Automatic type conversion (strings → numbers, booleans)
- **Validation**: Built-in required field checking
- **Self-Documenting**: Schemas serve as living documentation
- **Computed Properties**: Add derived values automatically
- **Reusability**: Same schemas across TC, SPM, and other projects
- **Standardization**: Enforces consistent configuration structure

---

## Quick Start

```javascript
import { DatabaseSchema, Configuration } from '@rescor/core-config';

const config = new Configuration();
await config.initialize();

// Create schema instance
const dbSchema = new DatabaseSchema();

// Save configuration
await dbSchema.save(config, {
  database: {
    hostname: 'localhost',
    port: '50000',
    database: 'TESTDB',
    user: 'admin',
    password: 'secret123'
  }
});

// Load as typed object
const db = await dbSchema.load(config);

console.log(db.port);              // 50000 (number, not string!)
console.log(db.connectionString);  // Full DB2 connection string
```

---

## Built-in Schemas

### DatabaseSchema

**Purpose**: Database connection configuration

**Fields**:
- `hostname` (SETTING) - Database server hostname
- `port` (SETTING) - Database server port
- `database` (SETTING) - Database name
- `protocol` (SETTING) - Connection protocol
- `user` (CREDENTIAL) - Database user
- `password` (CREDENTIAL) - Database password

**Returns**:
```javascript
{
  hostname: string,
  port: number,           // Automatically converted!
  database: string,
  protocol: string,
  user: string,
  password: string,
  connectionString: string  // Computed property
}
```

**Example**:
```javascript
const dbSchema = new DatabaseSchema();
const db = await dbSchema.load(config);

// Use with ibm_db
const conn = await ibmdb.open(db.connectionString);

// Test connection
const canConnect = await dbSchema.testConnection();
```

**Options**:
```javascript
// Custom domain
const dbSchema = new DatabaseSchema({ domain: 'primary_db' });

// Custom defaults
const dbSchema = new DatabaseSchema({
  defaultHostname: 'db.example.com',
  defaultPort: '60000'
});
```

---

### ApiSchema

**Purpose**: API endpoint and key configuration

**Fields** (per API):
- `{api}_base_url` (SETTING) - API base URL
- `{api}_key` (CREDENTIAL) - API key/token

**Returns**:
```javascript
{
  [apiName]: {
    baseUrl: string,
    key: string
  },
  ...
}
```

**Example**:
```javascript
const apiSchema = new ApiSchema({ apis: ['nvd', 'github', 'openai'] });
const apis = await apiSchema.load(config);

// Use with fetch
const response = await fetch(`${apis.nvd.baseUrl}/cves/2.0`, {
  headers: { 'apiKey': apis.nvd.key }
});

// Check if configured
if (apiSchema.hasApi('github')) {
  console.log('GitHub API configured');
}

// Get safe config for logging
console.log(apiSchema.getSafeConfig());
// { nvd: { baseUrl: '...', key: 'test-nvd...***MASKED***', configured: true } }
```

**Options**:
```javascript
// Custom APIs
const apiSchema = new ApiSchema({
  apis: ['stripe', 'sendgrid'],
  keyRotationDays: 90  // Rotate keys every 90 days
});
```

---

### PhaseSchema

**Purpose**: Deployment phase/environment configuration

**Fields**:
- `phase` (SETTING) - Current phase (DEV, UAT, PROD)
- `project_prefix` (SETTING) - Project prefix for schema naming
- `log_level` (SETTING) - Logging level

**Returns**:
```javascript
{
  phase: string,
  projectPrefix: string,
  logLevel: string,
  schema: string,         // Computed: TCDEV, TCUAT, or TC
  isDevelopment: boolean, // Computed: true if DEV
  isUAT: boolean,        // Computed: true if UAT
  isProduction: boolean, // Computed: true if PROD
  isNonProduction: boolean
}
```

**Example**:
```javascript
const phaseSchema = new PhaseSchema({ projectPrefix: 'TC' });
const phase = await phaseSchema.load(config);

console.log(phase.schema);  // 'TCDEV' in dev, 'TC' in prod

// Use for conditional logic
if (phase.isDevelopment) {
  console.log('Running in development mode');
}

// Get environment-specific settings
const settings = phaseSchema.getEnvironmentSettings();
// { debugMode: true, cacheTimeout: 300000, ... }

// Detect phase from environment
const detected = PhaseSchema.detectPhaseFromEnv();
console.log('Detected phase:', detected);
```

---

## Schema Registry

The `SchemaRegistry` provides centralized schema management.

### Using the Default Registry

```javascript
import { defaultRegistry } from '@rescor/core-config';

// List available schemas
console.log(defaultRegistry.list());
// ['database', 'api', 'phase']

// Load by name
const db = await defaultRegistry.load('database', config);
const apis = await defaultRegistry.load('api', config, { apis: ['nvd'] });

// Check if complete
if (await defaultRegistry.isComplete('database', config)) {
  const db = await defaultRegistry.load('database', config);
}

// Get schema definition
const definition = defaultRegistry.getDefinition('database');
console.log(definition.fields);
```

### Creating Custom Registry

```javascript
import { SchemaRegistry } from '@rescor/core-config';

const customRegistry = new SchemaRegistry();
customRegistry.register('database', DatabaseSchema);
customRegistry.register('email', EmailSchema);

const email = await customRegistry.load('email', config);
```

---

## Creating Custom Schemas

### Step 1: Extend Schema Class

```javascript
import { Schema, ClassifiedDatum } from '@rescor/core-config';

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
      })
    ]);
  }

  toTypedObject() {
    return {
      host: this.getValue('email', 'smtp_host') || 'smtp.gmail.com',
      port: parseInt(this.getValue('email', 'smtp_port') || '587'),
      user: this.getValue('email', 'smtp_user'),
      password: this.getValue('email', 'smtp_password'),

      // Computed property
      auth: {
        user: this.getValue('email', 'smtp_user'),
        pass: this.getValue('email', 'smtp_password')
      }
    };
  }
}
```

### Step 2: Use Your Schema

```javascript
const emailSchema = new EmailSchema();

// Save
await emailSchema.save(config, {
  email: {
    smtp_host: 'smtp.gmail.com',
    smtp_port: '587',
    smtp_user: 'noreply@rescor.net',
    smtp_password: 'secret123'
  }
});

// Load
const email = await emailSchema.load(config);

// Use with nodemailer
const transporter = nodemailer.createTransport({
  host: email.host,
  port: email.port,
  auth: email.auth
});
```

### Step 3: Register (Optional)

```javascript
import { defaultRegistry } from '@rescor/core-config';

defaultRegistry.register('email', EmailSchema);

// Now available via registry
const email = await defaultRegistry.load('email', config);
```

---

## Advanced Features

### Schema Validation

```javascript
const dbSchema = new DatabaseSchema();

// Check completeness
const isComplete = await dbSchema.isComplete(config);

if (!isComplete) {
  console.log('Missing fields:', dbSchema.getRequiredFields());
  throw new Error('Database configuration incomplete');
}

// Load will automatically validate
try {
  const db = await dbSchema.load(config);
} catch (err) {
  console.error('Validation failed:', err.message);
  // Error: Missing required configuration: database:user, database:password
}
```

### Schema Metadata

```javascript
const metadata = dbSchema.getMetadata();
console.log(metadata);
// {
//   name: 'DatabaseSchema',
//   itemCount: 6,
//   domains: ['database'],
//   credentials: 2,
//   settings: 4
// }

const fields = dbSchema.getRequiredFields();
fields.forEach(field => {
  console.log(`${field.fullKey} (${field.classification}): ${field.description}`);
});

// Export as JSON
const json = dbSchema.toJSON();
fs.writeFileSync('db-schema.json', JSON.stringify(json, null, 2));
```

### Custom Defaults

```javascript
class ConfigurableSchema extends Schema {
  constructor(options = {}) {
    const domain = options.domain || 'default';
    const timeout = options.timeout || 5000;

    super([
      ClassifiedDatum.setting(domain, 'timeout', {
        description: 'Request timeout',
        default: timeout.toString()
      })
    ]);

    this.domain = domain;
    this.defaultTimeout = timeout;
  }

  toTypedObject() {
    return {
      timeout: parseInt(this.getValue(this.domain, 'timeout')) || this.defaultTimeout
    };
  }
}
```

### Computed Properties

```javascript
class SmartSchema extends Schema {
  toTypedObject() {
    const port = parseInt(this.getValue('app', 'port'));
    const host = this.getValue('app', 'host');

    return {
      port,
      host,

      // Computed
      url: `http://${host}:${port}`,
      isSecure: port === 443,
      isLocalhost: host === 'localhost'
    };
  }
}
```

---

## Best Practices

### 1. Use Type Conversion

```javascript
toTypedObject() {
  return {
    port: parseInt(this.getValue('app', 'port')),      // String → Number
    enabled: this.getValue('app', 'enabled') === 'true', // String → Boolean
    timeout: parseFloat(this.getValue('app', 'timeout')) // String → Float
  };
}
```

### 2. Provide Defaults

```javascript
constructor() {
  super([
    ClassifiedDatum.setting('app', 'port', {
      default: '8080'  // Always provide sensible defaults
    })
  ]);
}
```

### 3. Use Descriptive Names

```javascript
// Good
ClassifiedDatum.setting('database', 'connection_timeout', {
  description: 'Database connection timeout in milliseconds'
})

// Bad
ClassifiedDatum.setting('db', 'to', { description: 'timeout' })
```

### 4. Classify Appropriately

```javascript
// Credentials - never log, short cache
ClassifiedDatum.credential('api', 'api_key', { rotation: 90 })

// Settings - can log (masked), longer cache
ClassifiedDatum.setting('api', 'base_url')

// Personal - PII, GDPR implications
ClassifiedDatum.personal('user', 'email')
```

### 5. Add Computed Properties

```javascript
toTypedObject() {
  return {
    user: this.getValue('db', 'user'),
    password: this.getValue('db', 'password'),

    // Computed: connection string
    connectionString: this.buildConnectionString()
  };
}
```

### 6. Handle Missing Values

```javascript
toTypedObject() {
  return {
    // Fallback to default
    port: parseInt(this.getValue('app', 'port')) || 8080,

    // Optional field
    description: this.getValue('app', 'description') || null
  };
}
```

---

## Migration from Manual Configuration

### Before (Manual)

```javascript
const dbConfig = new ClassifiedData([
  ClassifiedDatum.setting('database', 'hostname'),
  ClassifiedDatum.setting('database', 'port'),
  ClassifiedDatum.setting('database', 'database'),
  ClassifiedDatum.credential('database', 'user'),
  ClassifiedDatum.credential('database', 'password')
]);

await config.get(dbConfig);
dbConfig.validate();

const db = {
  hostname: dbConfig.getValue('database', 'hostname'),
  port: parseInt(dbConfig.getValue('database', 'port')),
  database: dbConfig.getValue('database', 'database'),
  user: dbConfig.getValue('database', 'user'),
  password: dbConfig.getValue('database', 'password'),
  connectionString: `DATABASE=${dbConfig.getValue('database', 'database')};...`
};
```

### After (Schema)

```javascript
const dbSchema = new DatabaseSchema();
const db = await dbSchema.load(config);
// Done! All fields typed and validated, connection string computed.
```

**Reduction**: ~60% less code, fully typed, self-documenting.

---

## Testing Schemas

```javascript
import { describe, it, expect } from 'vitest';
import { DatabaseSchema, Configuration, MemoryStore } from '@rescor/core-config';

describe('DatabaseSchema', () => {
  it('should load complete configuration', async () => {
    const config = new Configuration({ store: new MemoryStore() });
    const schema = new DatabaseSchema();

    await schema.save(config, {
      database: {
        hostname: 'localhost',
        port: '50000',
        database: 'TEST',
        user: 'admin',
        password: 'pass'
      }
    });

    const db = await schema.load(config);

    expect(db.port).toBe(50000);
    expect(typeof db.port).toBe('number');
    expect(db.connectionString).toContain('DATABASE=TEST');
  });

  it('should detect incomplete configuration', async () => {
    const config = new Configuration({ store: new MemoryStore() });
    const schema = new DatabaseSchema();

    const isComplete = await schema.isComplete(config);
    expect(isComplete).toBe(false);
  });
});
```

---

## Examples Directory

See `examples/schema-example.mjs` for comprehensive examples:

1. Direct schema usage
2. Schema registry usage
3. Phase schema with computed properties
4. Validation and completeness checking
5. Custom schema creation
6. Schema metadata and introspection
7. Multiple schemas together

Run examples:
```bash
node examples/schema-example.mjs
```

---

## Troubleshooting

### "Schema 'xyz' not registered"

**Solution**: Register the schema first:
```javascript
defaultRegistry.register('xyz', XyzSchema);
```

### "Missing required configuration"

**Solution**: Check which fields are missing:
```javascript
const fields = schema.getRequiredFields();
console.log('Required:', fields.map(f => f.fullKey));

const isComplete = await schema.isComplete(config);
console.log('Complete?', isComplete);
```

### Type conversion not working

**Solution**: Ensure `toTypedObject()` performs conversion:
```javascript
toTypedObject() {
  return {
    port: parseInt(this.getValue('app', 'port')), // ← Add parseInt
    enabled: this.getValue('app', 'enabled') === 'true' // ← String to boolean
  };
}
```

---

## Next Steps

- [x] Phase 1: ClassifiedDatum API (Complete)
- [x] Phase 3 #1: Structured Schemas (Complete)
- [ ] Phase 2: Infisical Integration
- [ ] Phase 3 #2: Configuration Templates
- [ ] Phase 3 #3: Configuration Profiles

---

## See Also

- [ClassifiedDatum API](./PHASE1-SUMMARY.md)
- [Configuration Guide](./README.md)
- [Examples](./examples/)
