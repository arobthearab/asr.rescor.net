# ASR Deployment Guide

Self-hosted deployment guide for third-party organizations.

## Prerequisites

- Docker and Docker Compose
- Microsoft Entra ID (Azure AD) app registration
- Node.js 20+ (for YAML questionnaire imports only)

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url> asr && cd asr

# 2. Configure
cp .env.example .env
# Edit .env — see Configuration Reference below

# 3. Start services
docker compose -f docker-compose.distributable.yml up -d

# 4. Initialize database
docker compose -f docker-compose.distributable.yml exec api node src/setupDatabase.mjs

# 5. Open browser
# http://localhost (or your configured domain)
```

## Configuration Reference

All configuration is via environment variables in `.env`. See `.env.example` for the full template.

### Required

| Variable | Description |
|----------|-------------|
| `NEO4J_PASSWORD` | Neo4j database password |
| `ENTRA_TENANTID` | Azure AD tenant GUID |
| `ENTRA_CLIENTID` | Entra ID app registration client ID |
| `VITE_MSAL_CLIENT_ID` | Same as `ENTRA_CLIENTID` (used at frontend build time) |

### Seed Data

Set these before running `setupDatabase.mjs` to provision your organization:

| Variable | Default | Description |
|----------|---------|-------------|
| `SEED_TENANT_ID` | `default` | Unique tenant identifier |
| `SEED_TENANT_NAME` | `My Organization` | Display name |
| `SEED_TENANT_DOMAIN` | `example.com` | Email domain for tenant matching |
| `SEED_ADMIN_EMAIL` | `admin@example.com` | Pre-provisioned admin user email |

The admin user will have full admin rights on first login via Entra ID.

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `ENTRA_ALLOWEDTENANTS` | _(empty = all)_ | Comma-separated Azure tenant GUIDs to accept |
| `SERVER_CORSALLOWEDORIGINS` | _(empty = all)_ | Comma-separated allowed CORS origins |
| `PORT` | `3100` | API listen port |
| `STORM_ENABLED` | `false` | Enable STORM scoring service integration |
| `CSP_CONNECT_EXTRA` | _(empty)_ | Additional CSP connect-src domains (space-separated) |
| `VITE_MSAL_TENANT_ID` | _(common)_ | Restrict MSAL to a specific Azure tenant |
| `VITE_MSAL_REDIRECT_URI` | `window.location.origin` | OAuth redirect URI |

## Entra ID Setup

1. Go to **Azure Portal** > **App registrations** > **New registration**
2. Set name (e.g., "ASR")
3. Under **Authentication**:
   - Add platform: **Single-page application**
   - Redirect URI: your frontend URL (e.g., `https://asr.example.com`)
4. Copy the **Application (client) ID** → set as `ENTRA_CLIENTID` and `VITE_MSAL_CLIENT_ID`
5. Copy the **Directory (tenant) ID** → set as `ENTRA_TENANTID`
6. Optionally restrict to specific tenants via `ENTRA_ALLOWEDTENANTS`

## Custom Questionnaires

ASR questionnaires are defined in YAML and loaded via the configure pipeline:

```bash
# From the host (with Node.js installed)
cd api
npm run cypher:setup:standalone     # seed database first
node --env-file-if-exists=.env src/configureFromYaml.mjs /path/to/questions.yaml
```

Or via Docker:

```bash
# Copy YAML into the container
docker cp questions.yaml asr-api:/app/

# Run configure
docker compose -f docker-compose.distributable.yml exec api \
  node src/configureFromYaml.mjs /app/questions.yaml
```

See the YAML schema documentation for question format details.

## Scoring

ASR uses the RSK scoring model by default (local computation, no external dependencies).

**STORM integration** (optional): Set `STORM_ENABLED=true` and configure the STORM/Keycloak environment variables. STORM provides an external scoring service with additional risk analysis capabilities.

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌─────────┐
│  Frontend    │────>│  API     │────>│  Neo4j  │
│  (nginx)    │     │  (Node)  │     │  (graph)│
│  :80        │     │  :3100   │     │  :7687  │
└─────────────┘     └──────────┘     └─────────┘
```

- **Frontend**: React SPA served by nginx, proxies `/api/` to the API container
- **API**: Express server with Entra ID JWT validation, RBAC, multi-tenant isolation
- **Neo4j**: Graph database storing questionnaires, reviews, scores, tenants, users

## Backup & Restore

### Neo4j Data

```bash
# Stop the API to prevent writes
docker compose -f docker-compose.distributable.yml stop api

# Dump (from Neo4j container)
docker compose -f docker-compose.distributable.yml exec neo4j \
  neo4j-admin database dump neo4j --to-path=/data/backups/

# Copy backup out
docker cp asr-neo4j:/data/backups/ ./backups/

# Restore
docker cp ./backups/ asr-neo4j:/data/backups/
docker compose -f docker-compose.distributable.yml exec neo4j \
  neo4j-admin database load neo4j --from-path=/data/backups/ --overwrite-destination

# Restart
docker compose -f docker-compose.distributable.yml up -d
```

## Upgrading

```bash
# Pull latest code
git pull

# Re-sync vendored packages (if core packages updated)
./scripts/vendor-sync.sh

# Rebuild and restart
docker compose -f docker-compose.distributable.yml up -d --build

# Run any new migrations
docker compose -f docker-compose.distributable.yml exec api node src/setupDatabase.mjs
```

## Reverting to a Known-Good State

If an upgrade introduces problems, revert to the previous working version:

### Application Rollback

```bash
# 1. Identify the last known-good commit
git log --oneline -10

# 2. Check out the known-good version
git checkout <commit-hash>

# 3. Rebuild containers from that version
docker compose -f docker-compose.distributable.yml up -d --build

# 4. Verify health
docker compose -f docker-compose.distributable.yml ps
curl -f http://localhost:3100/api/health
```

### Database Rollback

Cypher migrations are idempotent (MERGE-based), so rolling back the application code is usually sufficient. If seed data changed:

```bash
# 1. Stop API to prevent writes
docker compose -f docker-compose.distributable.yml stop api

# 2. Restore from backup (see Backup & Restore above)
docker cp ./backups/ asr-neo4j:/data/backups/
docker compose -f docker-compose.distributable.yml exec neo4j \
  neo4j-admin database load neo4j --from-path=/data/backups/ --overwrite-destination

# 3. Restart Neo4j to pick up restored data
docker compose -f docker-compose.distributable.yml restart neo4j

# 4. Start API against restored database
docker compose -f docker-compose.distributable.yml start api
```

### Full Reset (Destructive)

To start completely fresh — destroys all data:

```bash
# Tear down everything including volumes
docker compose -f docker-compose.distributable.yml down -v

# Rebuild and re-seed
docker compose -f docker-compose.distributable.yml up -d --build
docker compose -f docker-compose.distributable.yml exec api node src/setupDatabase.mjs
```

### RESCOR Internal Deployments

RESCOR internal deployments use the standard Dockerfiles (not `.distributable`) and Infisical. To revert:

```bash
# Revert to pre-distributable state (commit before distributable changes)
git checkout fe7dc7b

# Restore .npmrc registry auth and rebuild with NODE_AUTH_TOKEN
docker build --build-arg NODE_AUTH_TOKEN=$NODE_AUTH_TOKEN -f Dockerfile.api -t asr-api .
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "MSAL error" on login | Missing/wrong Entra config | Verify `ENTRA_CLIENTID` and redirect URI match Azure app registration |
| API returns 500 | Neo4j not connected | Check `docker logs asr-neo4j`; verify `NEO4J_PASSWORD` matches |
| Blank page after login | Frontend build missing MSAL vars | Rebuild with correct `VITE_MSAL_CLIENT_ID` |
| "No tenant found" | Seed data not loaded | Run `setupDatabase.mjs` with `SEED_*` vars set |
