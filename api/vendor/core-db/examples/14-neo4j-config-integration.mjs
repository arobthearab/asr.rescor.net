/**
 * Example 14: Neo4j Configuration Integration
 *
 * Demonstrates:
 * - Using @rescor-llc/core-config for credential management
 * - DatabaseSchema for Neo4j configuration
 * - Environment variable loading
 * - Secure credential storage patterns
 * - Multi-tier credential strategies
 * - Best practices for production deployments
 *
 * NOTE: This example demonstrates configuration patterns.
 * It may require @rescor-llc/core-config package to be available.
 */

import { Neo4jOperations } from '../src/Neo4jOperations.mjs';

async function neo4jConfigIntegrationExample() {
  console.log('=== Example 14: Neo4j Configuration Integration ===\n');

  // Example 1: Basic configuration from environment
  console.log('1. Basic configuration from environment variables\n');

  console.log('   Set these environment variables:');
  console.log('   - NEO4J_URI (default: bolt://localhost:7687)');
  console.log('   - NEO4J_USERNAME (default: neo4j)');
  console.log('   - NEO4J_PASSWORD (required)');
  console.log('   - NEO4J_DATABASE (default: neo4j)\n');

  console.log('   Example code:');
  console.log('   ```javascript');
  console.log('   const ops = new Neo4jOperations({');
  console.log('     schema: process.env.NEO4J_DATABASE || \'neo4j\',');
  console.log('     uri: process.env.NEO4J_URI || \'bolt://localhost:7687\',');
  console.log('     username: process.env.NEO4J_USERNAME || \'neo4j\',');
  console.log('     password: process.env.NEO4J_PASSWORD');
  console.log('   });');
  console.log('   ```\n');

  // Example 2: Configuration object pattern
  console.log('2. Configuration object pattern\n');

  const config = {
    neo4j: {
      development: {
        uri: 'bolt://localhost:7687',
        database: 'neo4j',
        username: 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'devpass123'
      },
      production: {
        uri: process.env.NEO4J_URI,
        database: process.env.NEO4J_DATABASE || 'neo4j',
        username: process.env.NEO4J_USERNAME,
        password: process.env.NEO4J_PASSWORD
      }
    }
  };

  const environment = process.env.NODE_ENV || 'development';
  const dbConfig = config.neo4j[environment];

  console.log('   Using configuration for environment:', environment);
  console.log('   ```javascript');
  console.log('   const ops = new Neo4jOperations({');
  console.log('     schema: dbConfig.database,');
  console.log('     uri: dbConfig.uri,');
  console.log('     username: dbConfig.username,');
  console.log('     password: dbConfig.password');
  console.log('   });');
  console.log('   ```\n');

  // Example 3: Three-tier credential loading
  console.log('3. Three-tier credential loading strategy\n');

  console.log('   Neo4jOperations automatically uses three-tier loading:');
  console.log('   Tier 1: Constructor parameters');
  console.log('   Tier 2: Configuration instance (via _getCredentials)');
  console.log('   Tier 3: Environment variables\n');

  console.log('   Example with partial config:');
  console.log('   ```javascript');
  console.log('   // URI from constructor, credentials from environment');
  console.log('   const ops = new Neo4jOperations({');
  console.log('     schema: \'neo4j\',');
  console.log('     uri: \'bolt://production-server:7687\'');
  console.log('     // username and password loaded from ENV automatically');
  console.log('   });');
  console.log('   ```\n');

  // Example 4: DatabaseSchema pattern (from @rescor-llc/core-config)
  console.log('4. DatabaseSchema pattern (with @rescor-llc/core-config)\n');

  console.log('   Using DatabaseSchema for typed configuration:');
  console.log('   ```javascript');
  console.log('   import { DatabaseSchema } from \'@rescor-llc/core-config\';');
  console.log('   import { Configuration } from \'@rescor-llc/core-config\';');
  console.log();
  console.log('   const config = new Configuration();');
  console.log('   const dbSchema = new DatabaseSchema();');
  console.log();
  console.log('   // Load Neo4j configuration');
  console.log('   const neo4jConfig = await dbSchema.load(config, {');
  console.log('     prefix: \'neo4j\'');
  console.log('   });');
  console.log();
  console.log('   const ops = new Neo4jOperations({');
  console.log('     schema: neo4jConfig.database || \'neo4j\',');
  console.log('     uri: `bolt://${neo4jConfig.hostname}:${neo4jConfig.port}`,');
  console.log('     username: neo4jConfig.user,');
  console.log('     password: neo4jConfig.password');
  console.log('   });');
  console.log('   ```\n');

  // Example 5: Production best practices
  console.log('5. Production deployment best practices\n');

  console.log('   Security recommendations:');
  console.log('   ✓ Never hardcode credentials in source code');
  console.log('   ✓ Use environment variables or secret management (Infisical, Vault)');
  console.log('   ✓ Rotate credentials regularly');
  console.log('   ✓ Use TLS/SSL for production connections (neo4j+s://)');
  console.log('   ✓ Limit database user permissions (principle of least privilege)');
  console.log('   ✓ Enable Neo4j authentication and authorization');
  console.log('   ✓ Monitor connection pooling and timeouts\n');

  console.log('   Example production configuration:');
  console.log('   ```javascript');
  console.log('   const ops = new Neo4jOperations({');
  console.log('     schema: process.env.NEO4J_DATABASE,  // \'tc\' for production');
  console.log('     uri: process.env.NEO4J_URI,           // neo4j+s://prod.example.com:7687');
  console.log('     username: process.env.NEO4J_USERNAME,');
  console.log('     password: process.env.NEO4J_PASSWORD,');
  console.log('     maxConnectionPoolSize: 50,             // Production pool size');
  console.log('     connectionTimeout: 30000,              // 30 second timeout');
  console.log('     encrypted: true                        // Force encryption');
  console.log('   });');
  console.log('   ```\n');

  // Example 6: Recorder integration
  console.log('6. Recorder integration for logging\n');

  console.log('   Adding audit logging with Recorder:');
  console.log('   ```javascript');
  console.log('   import { Recorder } from \'@rescor-llc/core-utils\';');
  console.log();
  console.log('   const recorder = new Recorder({');
  console.log('     logLevel: \'info\',');
  console.log('     logFile: \'/var/log/neo4j-operations.log\'');
  console.log('   });');
  console.log();
  console.log('   const ops = new Neo4jOperations({');
  console.log('     schema: \'neo4j\',');
  console.log('     uri: process.env.NEO4J_URI,');
  console.log('     username: process.env.NEO4J_USERNAME,');
  console.log('     password: process.env.NEO4J_PASSWORD,');
  console.log('     recorder  // Enables query logging');
  console.log('   });');
  console.log('   ```\n');

  // Example 7: Connection string formats
  console.log('7. Neo4j connection string formats\n');

  console.log('   Supported URI schemes:');
  console.log('   - bolt://host:7687        - Unencrypted Bolt protocol');
  console.log('   - bolt+s://host:7687      - Encrypted Bolt with TLS');
  console.log('   - bolt+ssc://host:7687    - Encrypted Bolt, self-signed cert');
  console.log('   - neo4j://host:7687       - Neo4j protocol (routing)');
  console.log('   - neo4j+s://host:7687     - Neo4j protocol with TLS');
  console.log('   - neo4j+ssc://host:7687   - Neo4j protocol, self-signed cert\n');

  console.log('   Example URIs:');
  console.log('   ```javascript');
  console.log('   // Local development');
  console.log('   uri: \'bolt://localhost:7687\'');
  console.log();
  console.log('   // Production cluster with encryption');
  console.log('   uri: \'neo4j+s://cluster.example.com:7687\'');
  console.log();
  console.log('   // Docker container');
  console.log('   uri: \'bolt://neo4j-container:7687\'');
  console.log('   ```\n');

  // Example 8: Demonstrating actual connection (if credentials available)
  if (process.env.NEO4J_PASSWORD) {
    console.log('8. Testing actual connection with current environment\n');

    const testOps = new Neo4jOperations({
      schema: process.env.NEO4J_DATABASE || 'neo4j',
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD
    });

    try {
      console.log('   Connecting to Neo4j...');
      await testOps.connect();
      console.log('   ✓ Connection successful\n');

      const metadata = testOps.getMetadata();
      console.log('   Connection metadata:');
      console.log('     Type:', metadata.type);
      console.log('     Database:', metadata.database);
      console.log('     URI:', metadata.uri);  // Password masked
      console.log('     Connected:', metadata.connected);
      console.log();

      // Test query
      console.log('   Executing test query...');
      const result = await testOps.query('RETURN "Configuration successful!" AS message');
      console.log('   ✓', result[0].message);
      console.log();

      await testOps.disconnect();
      console.log('   ✓ Disconnected\n');

    } catch (err) {
      console.error('   ✗ Connection failed:', err.message);
      console.error('   Check your environment variables\n');
    }
  } else {
    console.log('8. Skipping connection test (NEO4J_PASSWORD not set)\n');
    console.log('   Set NEO4J_PASSWORD environment variable to test connection\n');
  }

  // Summary
  console.log('Summary\n');
  console.log('Key takeaways for Neo4j configuration:');
  console.log('1. Use environment variables for credentials');
  console.log('2. Leverage three-tier credential loading');
  console.log('3. Enable TLS/SSL for production');
  console.log('4. Integrate Recorder for audit logging');
  console.log('5. Use DatabaseSchema for typed configuration');
  console.log('6. Follow security best practices');
  console.log('7. Monitor and tune connection pooling\n');
}

// Run example
neo4jConfigIntegrationExample().catch(console.error);
