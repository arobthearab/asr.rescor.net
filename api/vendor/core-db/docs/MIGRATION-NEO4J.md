# DB2 to Neo4j Migration Guide

Comprehensive comparison and migration guidance for moving from IBM DB2 to Neo4j graph database.

## Table of Contents

- [Overview](#overview)
- [When to Use Each Database](#when-to-use-each-database)
- [Concept Mapping](#concept-mapping)
- [Data Model Comparison](#data-model-comparison)
- [Query Language Comparison](#query-language-comparison)
- [API Comparison](#api-comparison)
- [Migration Strategies](#migration-strategies)
- [Hybrid Approach](#hybrid-approach)

## Overview

### DB2 (Relational)
- **Type**: Relational Database Management System (RDBMS)
- **Query Language**: SQL
- **Data Model**: Tables with rows and columns
- **Relationships**: Foreign keys with JOIN operations
- **Best For**: Transactional data, structured records, ACID compliance

### Neo4j (Graph)
- **Type**: Graph Database Management System (GDBMS)
- **Query Language**: Cypher
- **Data Model**: Nodes and relationships
- **Relationships**: First-class entities with properties
- **Best For**: Connected data, relationship-heavy queries, graph traversals

## When to Use Each Database

### Use DB2 When:
- ✅ Data is naturally tabular (users, orders, transactions)
- ✅ Need strong ACID guarantees for financial transactions
- ✅ Queries are primarily record-based (SELECT, INSERT, UPDATE, DELETE)
- ✅ Relationships are simple (one-to-many, many-to-many via junction tables)
- ✅ Reporting and aggregations are primary use cases
- ✅ Legacy system compatibility required

### Use Neo4j When:
- ✅ Data is highly connected (social networks, dependencies, hierarchies)
- ✅ Relationship traversal is performance-critical
- ✅ Schema evolves frequently
- ✅ Queries involve "friends of friends" or multi-hop patterns
- ✅ Path finding is a core requirement
- ✅ Modeling complex relationships with properties

### RESCOR Use Cases

| Use Case | Recommended Database | Reason |
|----------|---------------------|---------|
| **Vulnerability Management** | Neo4j | Hosts → Findings → Sources (graph traversal) |
| **User Authentication** | DB2 | Simple user records, ACID requirements |
| **Test Results** | DB2 | Tabular test data, reporting, aggregations |
| **Dependency Graphs** | Neo4j | Software dependencies, impact analysis |
| **Audit Logs** | DB2 | Sequential records, time-series queries |
| **Attack Paths** | Neo4j | Multi-hop traversal, shortest path |
| **Configuration Settings** | DB2 | Simple key-value storage |
| **Knowledge Graphs** | Neo4j | Complex interconnected entities |

## Concept Mapping

### DB2 → Neo4j Equivalents

| DB2 Concept | Neo4j Equivalent | Notes |
|-------------|------------------|-------|
| **Schema** | Database | DB2: `TCDEV`, Neo4j: `tcdev` (lowercase) |
| **Table** | Node Label | DB2: `USER` table, Neo4j: `:User` label |
| **Row** | Node | DB2: record, Neo4j: node with properties |
| **Column** | Property | Both support typed properties |
| **Primary Key (ID)** | Node ID | DB2: `ID INTEGER`, Neo4j: internal ID + custom property |
| **Foreign Key** | Relationship | DB2: `USER_ID`, Neo4j: `()-[:BELONGS_TO]->()` |
| **JOIN** | Relationship Match | DB2: `INNER JOIN`, Neo4j: `MATCH (a)-[r]->(b)` |
| **Index** | Index | Both support property indexes |
| **Constraint** | Constraint | Both support unique constraints |
| **Transaction** | Transaction | Both support ACID transactions |
| **Stored Procedure** | User-Defined Function | Neo4j: APOC procedures |

## Data Model Comparison

### Example: User and Group

**DB2 Schema:**
```sql
CREATE TABLE USER (
  ID INTEGER NOT NULL PRIMARY KEY,
  USERNAME VARCHAR(50) NOT NULL,
  EMAIL VARCHAR(100),
  CREATED TIMESTAMP
);

CREATE TABLE USER_GROUP (
  ID INTEGER NOT NULL PRIMARY KEY,
  NAME VARCHAR(50) NOT NULL
);

CREATE TABLE USER_GROUP_MEMBERSHIP (
  USER_ID INTEGER NOT NULL,
  GROUP_ID INTEGER NOT NULL,
  ROLE VARCHAR(20),
  PRIMARY KEY (USER_ID, GROUP_ID),
  FOREIGN KEY (USER_ID) REFERENCES USER(ID),
  FOREIGN KEY (GROUP_ID) REFERENCES USER_GROUP(ID)
);
```

**Neo4j Schema:**
```cypher
// Nodes (implicit schema via labels and properties)
CREATE (u:User {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  created: datetime()
})

CREATE (g:Group {
  id: 1,
  name: 'Developers'
})

// Relationship (junction table becomes first-class relationship)
CREATE (u)-[:MEMBER_OF {role: 'Lead'}]->(g)
```

### Key Differences:
1. **No Junction Tables**: Neo4j relationships replace many-to-many junction tables
2. **Relationship Properties**: Relationships can have properties (e.g., `role`)
3. **Flexible Schema**: No need to define schema upfront in Neo4j
4. **Bidirectional Queries**: Traverse relationships in any direction without JOINs

## Query Language Comparison

### Query 1: Find All Users

**DB2 (SQL):**
```sql
SELECT ID, USERNAME, EMAIL
FROM USER
WHERE EMAIL IS NOT NULL
ORDER BY USERNAME;
```

**Neo4j (Cypher):**
```cypher
MATCH (u:User)
WHERE u.email IS NOT NULL
RETURN u.id AS id, u.username AS username, u.email AS email
ORDER BY u.username
```

### Query 2: Find Users in a Group

**DB2 (SQL):**
```sql
SELECT u.USERNAME, m.ROLE
FROM USER u
JOIN USER_GROUP_MEMBERSHIP m ON u.ID = m.USER_ID
JOIN USER_GROUP g ON m.GROUP_ID = g.ID
WHERE g.NAME = 'Developers';
```

**Neo4j (Cypher):**
```cypher
MATCH (u:User)-[m:MEMBER_OF]->(g:Group {name: 'Developers'})
RETURN u.username AS username, m.role AS role
```

### Query 3: Find Friends of Friends (2-hop)

**DB2 (SQL - Complex):**
```sql
-- Requires self-join and careful handling
SELECT DISTINCT u3.USERNAME AS friend_of_friend
FROM FRIENDSHIPS f1
JOIN USER u2 ON f1.FRIEND_ID = u2.ID
JOIN FRIENDSHIPS f2 ON u2.ID = f2.USER_ID
JOIN USER u3 ON f2.FRIEND_ID = u3.ID
WHERE f1.USER_ID = 1  -- Alice's ID
  AND u3.ID != 1      -- Exclude Alice
  AND u3.ID NOT IN (  -- Exclude direct friends
    SELECT FRIEND_ID FROM FRIENDSHIPS WHERE USER_ID = 1
  );
```

**Neo4j (Cypher - Simple):**
```cypher
MATCH (alice:User {id: 1})-[:FRIENDS_WITH*2]-(friend_of_friend:User)
WHERE friend_of_friend <> alice
RETURN DISTINCT friend_of_friend.username
```

### Query 4: Shortest Path

**DB2**: Requires complex recursive CTEs or application logic

**Neo4j (Cypher - Built-in):**
```cypher
MATCH (start:User {id: 1}),
      (end:User {id: 100})
MATCH path = shortestPath((start)-[:FRIENDS_WITH*]-(end))
RETURN [node IN nodes(path) | node.username] AS route
```

## API Comparison

### DB2Operations (DB2)

```javascript
import { DB2Operations } from '@rescor/core-db';

const ops = new DB2Operations({
  schema: 'TCDEV',  // DB2 schema
  hostname: 'localhost',
  port: 50000,
  database: 'TESTDB',
  user: 'devuser',
  password: 'password'
});

await ops.connect();

// SQL query with positional parameters
const users = await ops.query(`
  SELECT * FROM TCDEV.USER WHERE STATUS = ?
`, ['active']);

await ops.disconnect();
```

### Neo4jOperations (Neo4j)

```javascript
import { Neo4jOperations } from '@rescor/core-db';

const ops = new Neo4jOperations({
  schema: 'neo4j',  // Neo4j database (CE: always 'neo4j')
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password'
});

await ops.connect();

// Cypher query with named parameters
const users = await ops.query(`
  MATCH (u:User {status: $status}) RETURN u
`, { status: 'active' });

await ops.disconnect();
```

### Key API Differences:

| Feature | DB2Operations | Neo4jOperations |
|---------|---------------|-----------------|
| **Connection** | hostname, port, database | uri (bolt://) |
| **Schema** | DB2 schema name (TCDEV) | Neo4j database (neo4j) |
| **Parameters** | Positional (?, ?) | Named ($name, $status) |
| **Results** | Array of row objects | Array of record objects |
| **Transforms** | Transforms (uppercase → lowercase) | Neo4jTransforms (Node → object) |
| **Transactions** | `beginTransaction()`, `commit()`, `rollback()` | `transaction(callback)` |

## Migration Strategies

### Strategy 1: Full Migration (Replace DB2 with Neo4j)

**Best For**: New projects, relationship-heavy data models

**Steps:**
1. Analyze DB2 schema and identify entities and relationships
2. Design Neo4j graph model (nodes, labels, relationships)
3. Create Cypher scripts to load data from DB2
4. Migrate queries from SQL to Cypher
5. Update application code to use Neo4jOperations
6. Test thoroughly with real data
7. Deploy and monitor performance

**Example Migration:**
```javascript
// 1. Export from DB2
const db2Ops = new DB2Operations({ schema: 'TC' });
await db2Ops.connect();
const users = await db2Ops.query('SELECT * FROM TC.USER');

// 2. Import into Neo4j
const neoOps = new Neo4jOperations({ schema: 'neo4j' });
await neoOps.connect();

for (const user of users) {
  await neoOps.query(`
    CREATE (u:User {
      id: $id,
      username: $username,
      email: $email,
      created: datetime($created)
    })
  `, user);
}

// 3. Create relationships
const memberships = await db2Ops.query('SELECT * FROM TC.USER_GROUP_MEMBERSHIP');
for (const membership of memberships) {
  await neoOps.query(`
    MATCH (u:User {id: $userId})
    MATCH (g:Group {id: $groupId})
    CREATE (u)-[:MEMBER_OF {role: $role}]->(g)
  `, membership);
}
```

### Strategy 2: Partial Migration (Specific Use Cases)

**Best For**: Existing DB2 systems, adding graph capabilities

**Approach**: Keep DB2 for transactional data, use Neo4j for graph queries

**Example**:
- DB2: User authentication, orders, transactions
- Neo4j: Social network, recommendations, dependency graphs

```javascript
// Hybrid approach
const db2Ops = new DB2Operations({ schema: 'TC' });
const neoOps = new Neo4jOperations({ schema: 'neo4j' });

// Use DB2 for user authentication
const user = await db2Ops.query(
  'SELECT * FROM TC.USER WHERE USERNAME = ?',
  [username]
);

// Use Neo4j for friend recommendations
const recommendations = await neoOps.query(`
  MATCH (user:User {id: $userId})-[:FRIENDS_WITH]-(friend)-[:FRIENDS_WITH]-(recommendation)
  WHERE NOT (user)-[:FRIENDS_WITH]-(recommendation)
    AND recommendation <> user
  RETURN recommendation.username, count(*) AS mutualFriends
  ORDER BY mutualFriends DESC
  LIMIT 10
`, { userId: user.ID });
```

### Strategy 3: Data Synchronization

**Best For**: Gradual migration, testing in parallel

**Approach**: Sync data from DB2 to Neo4j periodically

```javascript
// Sync job (run daily/hourly)
async function syncDB2ToNeo4j() {
  const db2Ops = new DB2Operations({ schema: 'TC' });
  const neoOps = new Neo4jOperations({ schema: 'neo4j' });

  await db2Ops.connect();
  await neoOps.connect();

  // 1. Get changes since last sync
  const changes = await db2Ops.query(`
    SELECT * FROM TC.USER
    WHERE UPDATED > ?
  `, [lastSyncTime]);

  // 2. Update Neo4j
  for (const change of changes) {
    await neoOps.query(`
      MERGE (u:User {id: $id})
      SET u.username = $username,
          u.email = $email,
          u.updated = datetime($updated)
    `, change);
  }

  // 3. Update last sync time
  lastSyncTime = new Date();
}
```

## Hybrid Approach

Use both databases for their strengths:

```javascript
import { DB2Operations, Neo4jOperations } from '@rescor/core-db';

class HybridDataStore {
  constructor() {
    this.db2 = new DB2Operations({ schema: 'TC' });
    this.neo4j = new Neo4jOperations({ schema: 'neo4j' });
  }

  async connect() {
    await this.db2.connect();
    await this.neo4j.connect();
  }

  // Use DB2 for structured data
  async getUser(username) {
    return await this.db2.query(
      'SELECT * FROM TC.USER WHERE USERNAME = ?',
      [username]
    );
  }

  // Use Neo4j for graph queries
  async getFriends(userId) {
    return await this.neo4j.query(`
      MATCH (u:User {id: $userId})-[:FRIENDS_WITH]-(friend:User)
      RETURN friend
    `, { userId });
  }

  // Use Neo4j for complex traversals
  async getInfluencePath(fromUser, toUser) {
    return await this.neo4j.query(`
      MATCH (from:User {id: $fromId}),
            (to:User {id: $toId})
      MATCH path = shortestPath((from)-[:INFLUENCES*]-(to))
      RETURN [node IN nodes(path) | node.username] AS path
    `, { fromId: fromUser, toId: toUser });
  }

  async disconnect() {
    await this.db2.disconnect();
    await this.neo4j.disconnect();
  }
}
```

## Summary

| Aspect | DB2 | Neo4j | Winner |
|--------|-----|-------|--------|
| **Structured Data** | ✅ | ⚠️ | DB2 |
| **Connected Data** | ⚠️ | ✅ | Neo4j |
| **ACID Transactions** | ✅ | ✅ | Tie |
| **Complex Joins** | ⚠️ | ✅ | Neo4j |
| **Aggregations** | ✅ | ⚠️ | DB2 |
| **Path Finding** | ❌ | ✅ | Neo4j |
| **Schema Flexibility** | ⚠️ | ✅ | Neo4j |
| **Reporting** | ✅ | ⚠️ | DB2 |
| **Graph Traversal** | ❌ | ✅ | Neo4j |
| **Learning Curve** | Lower | Higher | DB2 |

**Recommendation**: Use both! DB2 for transactional/tabular data, Neo4j for graph/relationship data.
