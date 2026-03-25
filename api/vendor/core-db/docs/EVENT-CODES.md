# @rescor/core-db Event Codes

This document lists all event codes emitted by @rescor/core-db Operations classes.

## Event Code Ranges

- **8500-8505**: Database operations (query logging, connections)
- **8506-8509**: Credential loading (Infisical-first strategy)

---

## Database Operations (8500-8505)

### 8500: Query Execution Started
**Level**: Info
**Message**: "Executing query"
**Metadata**: `{ sql, parameters, schema }`

Emitted when a database query begins execution.

### 8501: Connection Established
**Level**: Info
**Message**: "Connecting to [Database]"
**Metadata**: `{ uri, hostname, database, schema }`

Emitted when a database connection is being established.

### 8502: Connection Successful
**Level**: Info
**Message**: "[Database] connection established"
**Metadata**: `{ database, schema }`

Emitted when a database connection succeeds.

### 8503: Connection Failed
**Level**: Error
**Message**: "Failed to connect to [Database]"
**Metadata**: `{ error, uri, database }`

Emitted when a database connection fails.

### 8504: Query Completed
**Level**: Info
**Message**: "Query completed"
**Metadata**: `{ rows, duration }`

Emitted when a database query completes successfully.

### 8505: Query Failed
**Level**: Error
**Message**: "Query failed"
**Metadata**: `{ error, sql }`

Emitted when a database query fails.

---

## Credential Loading (8506-8509)

### Overview

As of February 2026, @rescor/core-db implements **Infisical-first credential loading** by default. This ensures consistent, centralized credential management across all projects.

**Priority order:**
1. **Infisical** (via Configuration) - PRIMARY source (8506)
2. **Constructor** parameters - OVERRIDE for special cases (8508)
3. **Environment** variables - FALLBACK when Infisical unavailable (8509)

When Infisical is unavailable, event 8507 is emitted as a warning before falling back to constructor or environment credentials.

---

### 8506: Credentials Loaded from Infisical (PRIMARY)
**Level**: Info
**Message**: "Loaded [Database] credentials from Infisical"
**Metadata**: `{ username: "ne***" }` (masked)

Emitted when credentials are successfully loaded from Infisical (the **default** and **preferred** source).

**What this means:**
- Infisical is running and accessible
- Credentials are stored centrally in Infisical
- Configuration is using the global singleton pattern
- **This is the expected normal case**

**Example:**
```javascript
import { Neo4jOperations } from '@rescor/core-db';
import { Recorder } from '@rescor/core-utils';

const recorder = new Recorder();
recorder.on('event', (evt) => {
  if (evt.code === 8506) {
    console.log('✅ Using Infisical credentials (preferred)');
  }
});

const ops = new Neo4jOperations({
  uri: 'bolt://localhost:7687',
  recorder
  // useInfisicalFirst: true is DEFAULT
});

await ops.connect();  // Emits 8506
```

---

### 8507: Infisical Unavailable, Using Fallback (WARNING)
**Level**: Warning
**Message**: "Infisical unavailable, using fallback credentials"
**Metadata**: `{ error: "..." }`

Emitted when Infisical cannot be reached or fails to load credentials. The system will automatically fall back to constructor or environment credentials.

**What this means:**
- Infisical is not running, or
- Infisical credentials are not configured, or
- Network/authentication issue with Infisical

**What to do:**
1. Check if Infisical is running: `docker-compose ps infisical`
2. Start Infisical: `docker-compose up -d infisical`
3. Verify credentials are configured in Infisical
4. For local development, fallback to environment is acceptable

**Example:**
```javascript
// Infisical down, falls back to environment
const ops = new Neo4jOperations({
  uri: 'bolt://localhost:7687',
  recorder
});

await ops.connect();
// Emits 8507 (warning) + 8509 (environment fallback)
```

---

### 8508: Using Constructor Credentials (OVERRIDE)
**Level**: Info
**Message**: "Using [Database] credentials from constructor"
**Metadata**: `{ username: "ne***" }` (masked)

Emitted when credentials are provided directly in the constructor. This **overrides** Infisical (intentional for special cases).

**What this means:**
- Developer explicitly provided credentials in code
- This is an **override** of the Infisical-first default
- Useful for: testing, CI/CD, isolated environments

**Example:**
```javascript
const ops = new Neo4jOperations({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'testpassword',  // Explicit override
  recorder
});

await ops.connect();  // Emits 8508 (constructor override)
```

**Note:** Constructor credentials still respect the `useInfisicalFirst` flag. To ensure constructor credentials are used, set `useInfisicalFirst: false`.

---

### 8509: Using Environment Credentials (FALLBACK)
**Level**: Info
**Message**: "Using [Database] credentials from environment"
**Metadata**: `{ hostname, database, username: "ne***" }` (masked)

Emitted when credentials are loaded from environment variables (final fallback).

**What this means:**
- Infisical unavailable (8507 emitted first)
- No constructor credentials provided
- Using environment variables: `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `DB2_*`

**What to do:**
- For production: Ensure Infisical is configured to avoid reliance on environment
- For local development: This is acceptable

**Example:**
```bash
# Set environment variables
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=rescordev123

node examples/08-neo4j-basic.mjs
# Emits 8507 (Infisical unavailable) + 8509 (environment fallback)
```

---

## Credential Loading Examples

### Example 1: Normal Case (Infisical Running)
```javascript
import { Neo4jOperations } from '@rescor/core-db';
import { createInfisicalVitalSign, Recorder } from '@rescor/core-utils';

const recorder = new Recorder();
const ops = new Neo4jOperations({ uri: 'bolt://localhost:7687', recorder });

await ops.connect();
// Emits: 8506 (Infisical credentials)
// ✅ Preferred path
```

### Example 2: Infisical Down (Environment Fallback)
```javascript
// Infisical not running
const ops = new Neo4jOperations({ uri: 'bolt://localhost:7687', recorder });

await ops.connect();
// Emits: 8507 (warning) + 8509 (environment)
// ⚠️  Fallback path (acceptable for development)
```

### Example 3: Constructor Override
```javascript
const ops = new Neo4jOperations({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'testpassword',
  recorder
});

await ops.connect();
// Emits: 8508 (constructor)
// 🔧 Intentional override
```

### Example 4: Opt-Out (Force Constructor/Environment)
```javascript
const ops = new Neo4jOperations({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'testpassword',
  useInfisicalFirst: false,  // Opt-out
  recorder
});

await ops.connect();
// Emits: 8508 (constructor)
// 🔧 Infisical bypassed
```

---

## Migration Notes

### Before (Old Behavior)
```javascript
// Priority: Constructor → Config → Environment
const ops = new Neo4jOperations({
  uri: 'bolt://localhost:7687',
  config: myConfig  // Only used if constructor missing
});
```

### After (New Behavior - February 2026)
```javascript
// Priority: Infisical → Constructor → Environment
const ops = new Neo4jOperations({
  uri: 'bolt://localhost:7687'
  // Automatically uses global Configuration singleton with Infisical
});
```

**Breaking Changes:** None. The new behavior is backward compatible:
- Constructor credentials still work (now an override)
- Environment variables still work (now a fallback)
- Custom config via `config` option still supported

**Recommended Migration:**
1. Store credentials in Infisical
2. Remove hardcoded constructor credentials
3. Remove environment-specific configuration
4. Let Operations use the global Configuration singleton

---

## Debugging Credential Issues

### Problem: "Neo4j credentials not found"

**Solution:**
1. Check Infisical status:
   ```bash
   docker-compose ps infisical
   curl http://localhost:8080/api/status
   ```

2. Check environment variables:
   ```bash
   echo $NEO4J_USERNAME
   echo $NEO4J_PASSWORD
   ```

3. Enable event logging:
   ```javascript
   const recorder = new Recorder();
   recorder.on('event', (evt) => {
     if (evt.code >= 8506 && evt.code <= 8509) {
       console.log(evt);
     }
   });
   ```

4. Look for event codes:
   - **8506**: ✅ Working correctly (Infisical)
   - **8507 + 8509**: ⚠️  Infisical down, using environment
   - **8508**: 🔧 Using constructor override

### Problem: Always getting 8507 (Infisical unavailable)

**Solutions:**
1. Start Infisical:
   ```bash
   cd /Volumes/Additional\ Storage/Repositories/core.rescor.net
   docker-compose up -d infisical
   ```

2. Configure Infisical credentials (see @rescor/core-config docs)

3. Verify VitalSign helper:
   ```javascript
   import { createInfisicalVitalSign } from '@rescor/core-utils';

   const sign = createInfisicalVitalSign({
     cwd: '/path/to/core.rescor.net'
   });

   const status = await sign.check();
   console.log(status);  // Should be 'success'
   ```

---

## See Also

- [NEO4J-QUICKSTART.md](NEO4J-QUICKSTART.md) - Neo4j setup and usage
- [NEO4J-ARCHITECTURE.md](NEO4J-ARCHITECTURE.md) - Neo4j architecture details
- [@rescor/core-config](../../core-config/README.md) - Configuration and Infisical setup
- [@rescor/core-utils](../../core-utils/README.md) - VitalSign helpers

---

**Last Updated**: February 19, 2026
**Version**: 1.1.0 (Infisical-first architecture)
