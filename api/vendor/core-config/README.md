# @rescor/core-config

Unified credential and configuration management for RESCOR projects.

## Features

- **Multiple Storage Backends**: Infisical, Environment Variables, In-Memory Cache
- **Cascading Fallback**: Automatic fallback through storage tiers
- **Secure by Default**: Abandons unreliable OS keychain in favor of Infisical
- **Pluggable Architecture**: SecureStore abstraction supports any vault/parameter store
- **Local + External**: Support for both local and external Infisical instances
- **Caching**: Optional in-memory cache with TTL
- **Domain-Based Organization**: Separate domains for database, api, service, app, idp

## Architecture

```
Configuration (High-level API)
    ↓
CascadingStore (Orchestrator)
    ├── MemoryStore (Cache - Tier 0)
    ├── InfisicalStore (Primary - Tier 1)
    └── EnvironmentStore (Fallback - Tier 2)
```

### Storage Tiers

| Tier | Store | Read | Write | Use Case |
|------|-------|------|-------|----------|
| 0 | MemoryStore | ✓ | ✓ | Caching, testing |
| 1 | InfisicalStore | ✓ | ✓ | Primary secret storage |
| 2 | EnvironmentStore | ✓ | ✗ | Fallback, CI/CD |

**Read Strategy**: Try cache → Infisical → environment, return first success

**Write Strategy**: Write to Infisical (primary), update cache

## Installation

```bash
npm install @rescor/core-config
```

## Usage

### Basic Configuration

```javascript
import { Configuration } from '@rescor/core-config';

const config = new Configuration({
  enableCache: true,
  cacheTTL: 3600000, // 1 hour
  enableInfisical: true,
  infisicalOptions: {
    mode: 'local', // or 'external'
    projectId: 'your-project-id',
    environment: 'dev'
  },
  envPrefix: 'RESCOR'
});

await config.initialize();

// Get configuration
const dbPassword = await config.getConfig('database', 'password');
const apiKey = await config.getConfig('api', 'nvd_key');

// Set configuration (writes to Infisical)
await config.setConfig('database', 'password', 'new-password');

// Delete configuration
await config.deleteConfig('api', 'old_key');

// List all configuration in a domain
const dbConfig = await config.listConfig('database');
```

### Database Configuration Helpers

```javascript
const user = await config.getDb2User();
const password = await config.getDb2Password();
const connectionString = await config.getDb2ConnectionString();
```

### Phase Management

```javascript
const phase = await config.getCurrentPhase(); // 'DEV', 'UAT', 'PROD'
await config.setCurrentPhase('UAT');
```

### Direct Store Usage

```javascript
import { InfisicalStore } from '@rescor/core-config/stores/InfisicalStore';

const store = new InfisicalStore({
  mode: 'local',
  host: 'http://localhost:8080',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  projectId: 'your-project-id',
  environment: 'dev'
});

await store.initialize();

await store.storeConfiguration('database', 'password', 'secret');
const value = await store.getConfiguration('database', 'password');
```

### Custom Store Implementation

```javascript
import { SecureStore } from '@rescor/core-config';

class MyCustomStore extends SecureStore {
  get isInitialized() {
    return this._initialized;
  }

  async _initialize() {
    // Initialize your store
    return true;
  }

  async getConfiguration(domain, key) {
    // Retrieve from your store
    return value;
  }

  async storeConfiguration(domain, key, value) {
    // Store in your store
    return this;
  }

  // Implement other required methods...
}
```

### Cascading Store with Custom Backends

```javascript
import { CascadingStore } from '@rescor/core-config/stores/CascadingStore';
import { InfisicalStore } from '@rescor/core-config/stores/InfisicalStore';
import { MemoryStore } from '@rescor/core-config/stores/MemoryStore';

const cache = new MemoryStore({ ttl: 3600000 });
const primary = new InfisicalStore({ /* options */ });
const fallback = new MyCustomStore();

const store = new CascadingStore({
  stores: [primary, fallback],
  cacheStore: cache,
  primaryStore: primary,
  writeThrough: true
});

await store.initialize();
```

## Configuration Domains

### database
Database connection settings
- `user`, `password`, `database`, `hostname`, `port`, `protocol`

### api
API keys and tokens
- `nvd_key`, `github_token`, `openai_key`

### service
External service configuration
- `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`

### app
Application secrets
- `jwt_secret`, `session_secret`, `encryption_key`, `phase`

### idp
Identity Provider (Keycloak) configuration
- `provider`, `base_url`, `realm`, `client_id`, `client_secret`

## Environment Variables

### Infisical Configuration

**Local Mode:**
```bash
INFISICAL_MODE=local
INFISICAL_HOST=http://localhost:8080
INFISICAL_CLIENT_ID=your-client-id
INFISICAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=dev
```

**External Mode:**
```bash
INFISICAL_MODE=external
INFISICAL_EXTERNAL_HOST=https://app.infisical.com
INFISICAL_EXTERNAL_CLIENT_ID=your-client-id
INFISICAL_EXTERNAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=prod
```

### Environment Variable Fallback

Configuration values can be provided via environment variables:

```bash
RESCOR_DATABASE_USER=myuser
RESCOR_DATABASE_PASSWORD=mypassword
RESCOR_API_NVD_KEY=my-api-key
```

Pattern: `{PREFIX}_{DOMAIN}_{KEY}` (all uppercase)

## Local Development Setup

### Docker Compose

```yaml
services:
  infisical:
    image: infisical/infisical:latest
    ports:
      - "8080:8080"
    environment:
      - MONGO_URL=mongodb://mongo:27017/infisical
      - REDIS_URL=redis://redis:6379
```

See `deployment/docker-compose.yml` for complete setup.

### Initial Configuration

1. Start local Infisical:
```bash
docker-compose up -d infisical
```

2. Create project and get credentials:
   - Visit http://localhost:8080
   - Create new project
   - Generate Universal Auth credentials
   - Copy Client ID and Client Secret

3. Configure environment:
```bash
export INFISICAL_MODE=local
export INFISICAL_HOST=http://localhost:8080
export INFISICAL_CLIENT_ID=your-client-id
export INFISICAL_CLIENT_SECRET=your-client-secret
export INFISICAL_PROJECT_ID=your-project-id
export INFISICAL_ENVIRONMENT=dev
```

4. Initialize configuration:
```javascript
const config = new Configuration();
await config.initialize();
await config.setConfig('database', 'password', 'your-db-password');
```

## Testing

```javascript
import { MemoryStore } from '@rescor/core-config/stores/MemoryStore';

// Use MemoryStore for testing
const testStore = new MemoryStore({ enableTTL: false });
await testStore.storeConfiguration('test', 'key', 'value');
const value = await testStore.getConfiguration('test', 'key');
```

## Migration from CredentialManager

**Old API:**
```javascript
const creds = await CredentialManager.getCredentials();
```

**New API:**
```javascript
const config = new Configuration();
await config.initialize();
const password = await config.getDb2Password();
const user = await config.getDb2User();
```

**Migration Script:**
```bash
# Export from old keychain
stcm credentials list --domain database > credentials.json

# Import to Infisical
rescor-cm credentials import credentials.json
```

## API Reference

### Configuration

- `constructor(options)` - Create configuration instance
- `async initialize()` - Initialize storage backends
- `async getConfig(domain, key, options)` - Get configuration value
- `async setConfig(domain, key, value)` - Set configuration value
- `async deleteConfig(domain, key)` - Delete configuration value
- `async listConfig(domain)` - List configuration in domain
- `getInfo()` - Get system information
- `async invalidateCache()` - Clear cache
- `async pruneCache()` - Remove expired cache entries

### SecureStore (Abstract)

- `get isInitialized` - Check if store is initialized
- `async initialize(force)` - Initialize store
- `async getConfiguration(domain, key)` - Get value
- `async storeConfiguration(domain, key, value)` - Store value
- `async clearConfiguration(domain, key)` - Clear value
- `async listConfiguration(domain)` - List values
- `async access()` - Gain access to store

## Event Codes

- 6000-6099: Configuration operations
- 10001-10099: SecureStore base operations
- 10100-10199: InfisicalStore operations
- 10200-10299: InfisicalStore CRUD operations
- 10300-10399: EnvironmentStore operations
- 10400-10499: MemoryStore operations
- 10500-10599: CascadingStore operations
- 10600-10699: CascadingStore cascading operations

## License

Proprietary - RESCOR LLC
