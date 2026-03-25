# Neo4j Quick Start Guide

Quick reference for getting started with Neo4j in @rescor/core-db.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Starting Neo4j](#starting-neo4j)
- [Basic Usage](#basic-usage)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js**: ≥ 18.0.0
- **Neo4j**: Community Edition 5.15+ or Enterprise Edition
- **Docker** (recommended): For local development

## Installation

### Option 1: Docker (Recommended)

```bash
# Start Neo4j using docker-compose
cd /path/to/core.rescor.net
docker-compose -f docker-compose.neo4j.yml up -d

# Verify container is running
docker ps | grep neo4j

# View logs
docker logs rescor-neo4j
```

### Option 2: Local Installation

Download from [neo4j.com/download](https://neo4j.com/download/) and follow platform-specific instructions.

## Starting Neo4j

### Using Docker Compose

The provided `docker-compose.neo4j.yml` configures:
- **Port 7474**: HTTP Browser interface
- **Port 7687**: Bolt protocol (for applications)
- **Default credentials**: neo4j / rescordev123
- **Community Edition**: Single 'neo4j' database

```bash
# Start
docker-compose -f docker-compose.neo4j.yml up -d

# Stop
docker-compose -f docker-compose.neo4j.yml down

# Stop and remove data
docker-compose -f docker-compose.neo4j.yml down -v
```

### Verify Connection

Open browser to http://localhost:7474 and log in with:
- **Username**: neo4j
- **Password**: rescordev123

## Basic Usage

### 1. Connect to Neo4j

```javascript
import { Neo4jOperations } from '@rescor/core-db';

const ops = new Neo4jOperations({
  schema: 'neo4j',  // Database name
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'rescordev123'
});

await ops.connect();
console.log('Connected to Neo4j');
```

### 2. Create Your First Node

```javascript
// Create a node with properties
const result = await ops.query(`
  CREATE (h:Host {
    hostname: 'web-server',
    ip: '192.168.1.10',
    status: 'active'
  })
  RETURN h
`);

console.log('Created:', result[0].h.properties.hostname);
```

### 3. Query Nodes

```javascript
// Find all hosts
const hosts = await ops.query('MATCH (h:Host) RETURN h');

// Find specific host
const webServer = await ops.query(
  'MATCH (h:Host {hostname: $hostname}) RETURN h',
  { hostname: 'web-server' }
);
```

### 4. Create Relationships

```javascript
// Create two nodes and a relationship
await ops.query(`
  CREATE (h1:Host {hostname: 'web-server'})
  CREATE (h2:Host {hostname: 'db-server'})
  CREATE (h1)-[:CONNECTS_TO {port: 5432}]->(h2)
`);

// Query relationships
const connections = await ops.query(`
  MATCH (h1:Host)-[r:CONNECTS_TO]->(h2:Host)
  RETURN h1.hostname AS from, h2.hostname AS to, r.port AS port
`);
```

### 5. Update Data

```javascript
// Update node properties
await ops.query(`
  MATCH (h:Host {hostname: $hostname})
  SET h.status = $newStatus, h.updated = datetime()
`, {
  hostname: 'web-server',
  newStatus: 'inactive'
});
```

### 6. Delete Data

```javascript
// Delete specific node
await ops.query(`
  MATCH (h:Host {hostname: $hostname})
  DELETE h
`, { hostname: 'web-server' });

// Delete node and its relationships
await ops.query(`
  MATCH (h:Host {hostname: $hostname})
  DETACH DELETE h
`, { hostname: 'web-server' });

// Clear all test data
await ops.query('MATCH (n:Host) DETACH DELETE n');
```

### 7. Always Disconnect

```javascript
await ops.disconnect();
console.log('Disconnected');
```

## Common Patterns

### Pattern 1: Transactions

```javascript
// Wrap multiple operations in a transaction
await ops.transaction(async (tx) => {
  await tx.query('CREATE (h:Host {hostname: $hostname})', { hostname: 'server1' });
  await tx.query('CREATE (h:Host {hostname: $hostname})', { hostname: 'server2' });

  // If error occurs, transaction automatically rolls back
  // If successful, transaction automatically commits
});
```

### Pattern 2: Graph Transforms

```javascript
import { Neo4jTransforms } from '@rescor/core-db';

// Define transforms
const transforms = new Neo4jTransforms()
  .add('host', { type: 'node' })
  .add('finding', { type: 'node' });

// Query with transforms
const results = await ops.query(
  'MATCH (h:Host)-->(f:Finding) RETURN h AS host, f AS finding',
  {},
  transforms
);

// Results are plain JavaScript objects
console.log(results[0].host.hostname);
console.log(results[0].finding.cve);
```

### Pattern 3: Path Queries

```javascript
// Find shortest path
const path = await ops.query(`
  MATCH (start:Host {hostname: $start}),
        (end:Host {hostname: $end})
  MATCH path = shortestPath((start)-[:CONNECTS_TO*]-(end))
  RETURN [node IN nodes(path) | node.hostname] AS route
`, { start: 'web-server', end: 'db-server' });

console.log('Route:', path[0].route.join(' → '));
```

### Pattern 4: Environment Variables

```javascript
// Load credentials from environment
const ops = new Neo4jOperations({
  schema: process.env.NEO4J_DATABASE || 'neo4j',
  uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  password: process.env.NEO4J_PASSWORD  // Required
});
```

### Pattern 5: Error Handling

```javascript
import { Neo4jErrorHandler } from '@rescor/core-db';

try {
  await ops.query('INVALID CYPHER');
} catch (err) {
  const handled = Neo4jErrorHandler.handle(err);
  console.error(handled.userMessage);  // "Cypher syntax error"

  // In development, show technical details
  if (process.env.NODE_ENV !== 'production') {
    console.error(handled.technicalMessage);
  }
}
```

## Troubleshooting

### Problem: "ServiceUnavailable: Connection failed"

**Solution**: Ensure Neo4j is running and accessible.

```bash
# Check if container is running
docker ps | grep neo4j

# Check container logs
docker logs rescor-neo4j

# Verify port 7687 is listening
nc -zv localhost 7687
```

### Problem: "Unauthorized: Invalid credentials"

**Solution**: Check username/password.

```javascript
// Default Docker credentials
username: 'neo4j'
password: 'rescordev123'  // From docker-compose.neo4j.yml
```

### Problem: "Database 'tcdev' does not exist"

**Cause**: Neo4j Community Edition only supports the 'neo4j' database.

**Solution**: Use schema: 'neo4j' or upgrade to Enterprise Edition.

```javascript
// Community Edition
const ops = new Neo4jOperations({ schema: 'neo4j' });

// Enterprise Edition (if available)
const ops = new Neo4jOperations({ schema: 'tcdev' });
```

### Problem: Query returns empty results

**Debug**: Check if data exists.

```cypher
// In Neo4j Browser (http://localhost:7474)
MATCH (n) RETURN count(n) AS totalNodes;
MATCH ()-[r]->() RETURN count(r) AS totalRelationships;
```

### Problem: Memory issues with large result sets

**Solution**: Use LIMIT clause or pagination.

```javascript
// Limit results
const results = await ops.query('MATCH (h:Host) RETURN h LIMIT 100');

// Pagination
const page1 = await ops.query('MATCH (h:Host) RETURN h SKIP 0 LIMIT 100');
const page2 = await ops.query('MATCH (h:Host) RETURN h SKIP 100 LIMIT 100');
```

## Next Steps

- **Examples**: See `packages/core-db/examples/08-neo4j-basic.mjs` through `14-neo4j-config-integration.mjs`
- **Architecture**: Read `docs/NEO4J-ARCHITECTURE.md` for detailed design
- **Migration**: Read `docs/MIGRATION-NEO4J.md` for DB2 → Neo4j comparison
- **Tests**: Run integration tests with `INTEGRATION_TESTS=true npm test`

## Quick Reference

### Connection String Formats

```
bolt://localhost:7687         # Unencrypted (development)
bolt+s://localhost:7687       # Encrypted with TLS (production)
neo4j://localhost:7687        # Neo4j routing protocol
neo4j+s://prod.example.com    # Production cluster with TLS
```

### Common Cypher Patterns

```cypher
-- Create node
CREATE (n:Label {property: 'value'}) RETURN n

-- Match node
MATCH (n:Label {property: 'value'}) RETURN n

-- Create relationship
CREATE (a)-[:REL_TYPE {prop: 'value'}]->(b)

-- Match relationship
MATCH (a)-[r:REL_TYPE]->(b) RETURN a, r, b

-- Update properties
MATCH (n:Label {id: 1})
SET n.property = 'new value'

-- Delete node (with relationships)
MATCH (n:Label {id: 1})
DETACH DELETE n

-- Count nodes
MATCH (n:Label) RETURN count(n)

-- List all labels
CALL db.labels()

-- List all relationship types
CALL db.relationshipTypes()
```

### Environment Variables

```bash
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USERNAME="neo4j"
export NEO4J_PASSWORD="rescordev123"
export NEO4J_DATABASE="neo4j"
export INTEGRATION_TESTS="true"  # For running integration tests
```

## Resources

- **Neo4j Documentation**: https://neo4j.com/docs/
- **Cypher Manual**: https://neo4j.com/docs/cypher-manual/current/
- **Graph Data Modeling**: https://neo4j.com/developer/data-modeling/
- **Neo4j Browser Guide**: http://localhost:7474/browser/
