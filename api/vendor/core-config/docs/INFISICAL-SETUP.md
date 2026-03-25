# Infisical Two-Tier Configuration Setup Guide

This guide explains how to configure and use the two-tier Infisical resolution system for @rescor projects.

## Table of Contents

- [Overview](#overview)
- [Two-Tier Resolution](#two-tier-resolution)
- [Environment Variables](#environment-variables)
- [Infisical Project Setup](#infisical-project-setup)
- [Key Naming Conventions](#key-naming-conventions)
- [Key Aliasing](#key-aliasing)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Overview

The @rescor/core-config package implements **two-tier Infisical resolution**:

1. **Project-Specific** (e.g., `spm.rescor.net`, `testingcenter.rescor.net`)
   - Project-specific credentials and configuration
   - Overrides core configuration when present

2. **Core** (`core.rescor.net`)
   - Shared/common configuration (DB2, Neo4j, APIs, etc.)
   - Fallback when project-specific not found

**Benefits:**
- ✅ Centralized common configuration (no duplication)
- ✅ Project-specific overrides when needed
- ✅ Automatic fallback to core
- ✅ Reduced configuration maintenance

---

## Two-Tier Resolution

### How It Works

When your application requests a credential (e.g., `database.user`):

```
1. Try project-specific Infisical project
   └─ Look for DATABASE_USER in spm.rescor.net
   └─ If found → USE IT (project override)

2. Fall back to core Infisical project
   └─ Look for DATABASE_USER in core.rescor.net
   └─ If found → USE IT (shared config)

3. Fall back to environment variables
   └─ Look for DATABASE_USER env var
   └─ If found → USE IT (local override)
```

### Resolution Priority

**For each tier**, keys are tried in this order:

1. **Primary key** (e.g., `DATABASE_USER`)
2. **Aliases** (e.g., `DATABASE_UID`) - for backward compatibility

---

## Environment Variables

Set these in your shell profile (`~/.zshrc`, `~/.bashrc`) or `.env` file:

```bash
# Infisical Connection (required)
export INFISICAL_CLIENT_ID="your-universal-auth-client-id"
export INFISICAL_CLIENT_SECRET="your-universal-auth-client-secret"

# Core Project ID (required for two-tier resolution)
export INFISICAL_CORE_PROJECT_ID="core-project-id-from-infisical"

# Project-Specific Project ID (optional, auto-detected from cwd)
export INFISICAL_PROJECT_ID="spm-project-id-from-infisical"

# Infisical Mode (optional, default: local)
export INFISICAL_MODE="local"  # or "external" for cloud

# Infisical Host (optional, default: http://localhost:8080)
export INFISICAL_HOST="http://localhost:8080"

# Environment (optional, default: dev)
export INFISICAL_ENVIRONMENT="dev"  # or "staging", "production"
```

### Finding Project IDs

1. Open Infisical UI: http://localhost:8080
2. Navigate to Project Settings
3. Copy the **Project ID** (UUID format)

**Example:**
```
core.rescor.net     → 12345678-1234-1234-1234-123456789abc
spm.rescor.net      → 87654321-4321-4321-4321-cba987654321
testingcenter.rescor.net → abcdef12-3456-7890-abcd-ef1234567890
```

---

## Infisical Project Setup

### 1. Create Projects in Infisical

Create these projects in your Infisical instance:

- `core.rescor.net` - Shared configuration
- `spm.rescor.net` - SPM-specific configuration
- `testingcenter.rescor.net` - Testing Center-specific configuration

### 2. Populate `core.rescor.net` with Common Configuration

#### Database Configuration (DB2)

```
DATABASE_HOSTNAME = thorium.rescor.net
DATABASE_PORT = 50000
DATABASE_DATABASE = NMIV01
DATABASE_UID = queue          # or DATABASE_USER
DATABASE_PWD = MicroFails1    # or DATABASE_PASSWORD
DATABASE_PROTOCOL = TCPIP
```

#### Neo4j Configuration

```
NEO4J_URI = bolt://localhost:7687
NEO4J_USERNAME = neo4j        # or NEO4J_USER
NEO4J_PASSWORD = rescordev123 # or NEO4J_PWD
NEO4J_DATABASE = neo4j
```

### 3. Populate Project-Specific Configuration (Optional)

If a project needs different credentials, add them to the project-specific Infisical project:

**Example: `spm.rescor.net` with different DB2 credentials**

```
DATABASE_HOSTNAME = spm-db.rescor.net  # Overrides core
DATABASE_PORT = 50000                   # Inherited from core if not set
DATABASE_DATABASE = SPMDB               # Overrides core
DATABASE_UID = spmuser                  # Overrides core
DATABASE_PWD = SpmPassword123           # Overrides core
```

---

## Key Naming Conventions

### Standard Format

**Pattern:** `{DOMAIN}_{KEY}`

**Examples:**
```
database.hostname  → DATABASE_HOSTNAME
database.port      → DATABASE_PORT
database.user      → DATABASE_USER
database.password  → DATABASE_PASSWORD

neo4j.username     → NEO4J_USERNAME
neo4j.password     → NEO4J_PASSWORD
neo4j.uri          → NEO4J_URI

api.nvd.key        → API_NVD_KEY
api.nvd.endpoint   → API_NVD_ENDPOINT
```

### Conversion Rules

1. Domain and key are **joined with underscore** (`_`)
2. Result is **uppercased**
3. Dots (`.`) in keys become **underscores**

**Implementation:**
```javascript
_buildSecretPath(domain, key) {
  return `${domain}_${key}`.toUpperCase();
}

// Examples:
_buildSecretPath('database', 'hostname')  // → "DATABASE_HOSTNAME"
_buildSecretPath('neo4j', 'password')     // → "NEO4J_PASSWORD"
_buildSecretPath('api.nvd', 'key')        // → "API_NVD_KEY"
```

---

## Key Aliasing

For backward compatibility with existing Infisical data, **key aliases** are supported:

### Supported Aliases

```javascript
'database.user'     → ['uid']        // DATABASE_USER ← DATABASE_UID
'database.password' → ['pwd']        // DATABASE_PASSWORD ← DATABASE_PWD
'neo4j.user'        → ['username']   // NEO4J_USER ← NEO4J_USERNAME
'neo4j.password'    → ['pwd']        // NEO4J_PASSWORD ← NEO4J_PWD
```

### How Aliases Work

When retrieving `database.user`:

1. **Try primary**: `DATABASE_USER`
2. **Try alias**: `DATABASE_UID`
3. **Return** first found value

This means you can use **either** `DATABASE_USER` **or** `DATABASE_UID` in Infisical - both work!

### Why Aliases?

- Legacy Infisical data uses `UID`/`PWD` (DB2 convention)
- New code expects `USER`/`PASSWORD` (standard convention)
- Aliases provide seamless backward compatibility

---

## Testing

### 1. Verify Infisical Connection

```bash
curl http://localhost:8080/api/status
# Should return: {"status":"ok"}
```

### 2. Test Two-Tier Resolution

Create a test script:

```javascript
// test-infisical.mjs
import { Configuration } from '@rescor/core-config';

const config = new Configuration({
  enableInfisical: true,
  infisicalOptions: {
    projectId: process.env.INFISICAL_PROJECT_ID,
    coreProjectId: process.env.INFISICAL_CORE_PROJECT_ID,
    clientId: process.env.INFISICAL_CLIENT_ID,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET
  }
});

await config.initialize();

// Test database credentials
const hostname = await config.get('database', 'hostname');
const user = await config.get('database', 'user');  // Tries USER, then UID
const password = await config.get('database', 'password');  // Tries PASSWORD, then PWD

console.log('Database Config:');
console.log('  Hostname:', hostname);
console.log('  User:', user);
console.log('  Password:', password ? '***' : '(not found)');

// Test Neo4j credentials
const neo4jUser = await config.get('neo4j', 'username');
const neo4jPwd = await config.get('neo4j', 'password');

console.log('\nNeo4j Config:');
console.log('  Username:', neo4jUser);
console.log('  Password:', neo4jPwd ? '***' : '(not found)');
```

**Run:**
```bash
node test-infisical.mjs
```

**Expected Output:**
```
Database Config:
  Hostname: thorium.rescor.net
  User: queue
  Password: ***

Neo4j Config:
  Username: neo4j
  Password: ***
```

### 3. Test Database Connection

Using the credentials:

```javascript
import { DB2Operations } from '@rescor/core-db';

const ops = new DB2Operations({
  schema: 'TCDEV'
  // Credentials loaded automatically from Infisical!
});

await ops.connect();
console.log('✅ DB2 connection successful!');
await ops.disconnect();
```

---

## Troubleshooting

### Problem: "Infisical unavailable, using fallback credentials"

**Cause:** Infisical service not running or misconfigured.

**Solution:**
```bash
# 1. Check if Infisical is running
docker ps | grep infisical

# 2. Start Infisical
cd /path/to/core.rescor.net
docker-compose up -d infisical

# 3. Verify status
curl http://localhost:8080/api/status

# 4. Check environment variables
echo $INFISICAL_CLIENT_ID
echo $INFISICAL_CLIENT_SECRET
echo $INFISICAL_CORE_PROJECT_ID
```

### Problem: "Secret not found" for DATABASE_USER

**Cause:** Using old key naming or alias mismatch.

**Solution:**

Check what keys exist in Infisical:

```bash
# Use Infisical CLI or UI to list secrets
infisical secrets list --project-id $INFISICAL_CORE_PROJECT_ID

# If you see DATABASE_UID instead of DATABASE_USER:
# → That's OK! The alias system handles it automatically
```

Verify aliases are working:

```javascript
// Both should work:
await config.get('database', 'user');  // Tries DATABASE_USER, DATABASE_UID
await config.get('database', 'uid');   // Directly requests DATABASE_UID
```

### Problem: Project-specific not overriding core

**Cause:** `INFISICAL_PROJECT_ID` not set or incorrect.

**Solution:**

```bash
# 1. Verify INFISICAL_PROJECT_ID is set
echo $INFISICAL_PROJECT_ID

# 2. Check if auto-detection works
cd /path/to/spm.rescor.net
# Should auto-detect "spm" as project name

# 3. Set explicitly if needed
export INFISICAL_PROJECT_ID="your-spm-project-id"
```

### Problem: "get() requires ClassifiedDatum or ClassifiedData"

**Cause:** Using legacy API instead of ClassifiedDatum.

**Solution:**

```javascript
// ❌ OLD (won't work with Infisical)
await config.getCredential('database', 'password');

// ✅ NEW (works with Infisical)
await config.get('database', 'password');
```

### Problem: Authentication failed

**Cause:** Invalid `INFISICAL_CLIENT_ID` or `INFISICAL_CLIENT_SECRET`.

**Solution:**

1. Create a Universal Auth credential in Infisical UI
2. Copy the Client ID and Client Secret
3. Update environment variables:
   ```bash
   export INFISICAL_CLIENT_ID="your-client-id"
   export INFISICAL_CLIENT_SECRET="your-client-secret"
   ```

---

## Log Event Codes

Monitor credential resolution with event codes:

- **10210**: Retrieved from Infisical (success)
- **10211**: Not found in project-specific, trying core
- **10212**: Failed to retrieve from project-specific (error)
- **10213**: Retrieved from core (fallback success)
- **10214**: Not found in core either
- **10215**: No projectId configured

**View logs:**
```bash
tail -f /tmp/rescor/logs/configuration.log | grep -E '1021[0-5]'
```

---

## Summary

### Quick Reference

**Environment Setup:**
```bash
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
export INFISICAL_CORE_PROJECT_ID="..."  # core.rescor.net
export INFISICAL_PROJECT_ID="..."       # Optional (auto-detected)
```

**Infisical Projects:**
- `core.rescor.net` - Common configuration (DB2, Neo4j, APIs)
- `[project].rescor.net` - Project-specific overrides

**Key Naming:**
- `{DOMAIN}_{KEY}` (uppercase)
- Aliases supported: `USER`↔`UID`, `PASSWORD`↔`PWD`

**Resolution Order:**
1. Project-specific Infisical (with aliases)
2. Core Infisical (with aliases)
3. Environment variables

---

**Last Updated**: February 19, 2026
**Version**: 1.0.0
