/**
 * DatabaseTemplate - Pre-configured database templates
 *
 * Provides common database configuration templates for different environments
 */

import { Template } from '../Template.mjs';
import { DatabaseSchema } from '../schemas/DatabaseSchema.mjs';

/**
 * Local development database template
 *
 * Configured for localhost with development credentials
 */
export class LocalDatabaseTemplate extends Template {
  constructor(options = {}) {
    const database = options.database || 'DEVDB';
    const user = options.user || 'devuser';
    const password = options.password || 'devpass123';

    super(
      new DatabaseSchema(options),
      {
        database: {
          hostname: 'localhost',
          port: '50000',
          database,
          protocol: 'TCPIP',
          user,
          password
        }
      },
      {
        name: 'LocalDatabaseTemplate',
        description: 'Local development database configuration',
        tags: ['development', 'local', 'db2']
      }
    );
  }
}

/**
 * Test database template
 *
 * Configured for testing with isolated test database
 */
export class TestDatabaseTemplate extends Template {
  constructor(options = {}) {
    const database = options.database || 'TESTDB';

    super(
      new DatabaseSchema(options),
      {
        database: {
          hostname: 'localhost',
          port: '50000',
          database,
          protocol: 'TCPIP',
          user: 'testuser',
          password: 'testpass123'
        }
      },
      {
        name: 'TestDatabaseTemplate',
        description: 'Test database configuration with isolated schema',
        tags: ['testing', 'ci', 'db2']
      }
    );
  }
}

/**
 * UAT database template
 *
 * Configured for User Acceptance Testing environment
 */
export class UATDatabaseTemplate extends Template {
  constructor(options = {}) {
    const hostname = options.hostname || 'uat-db.rescor.net';
    const database = options.database || 'UATDB';

    super(
      new DatabaseSchema(options),
      {
        database: {
          hostname,
          port: '50000',
          database,
          protocol: 'TCPIP',
          user: 'uatuser',
          password: '' // Should be provided via override
        }
      },
      {
        name: 'UATDatabaseTemplate',
        description: 'UAT environment database configuration',
        tags: ['uat', 'staging', 'db2'],
        requiresPassword: true
      }
    );
  }
}

/**
 * Production database template
 *
 * Configured for production with security best practices
 */
export class ProductionDatabaseTemplate extends Template {
  constructor(options = {}) {
    const hostname = options.hostname || 'prod-db.rescor.net';
    const database = options.database || 'PRODDB';

    super(
      new DatabaseSchema(options),
      {
        database: {
          hostname,
          port: '50000',
          database,
          protocol: 'TCPIP',
          user: 'produser',
          password: '' // Must be provided securely
        }
      },
      {
        name: 'ProductionDatabaseTemplate',
        description: 'Production database configuration',
        tags: ['production', 'db2', 'secure'],
        requiresPassword: true,
        requiresSecureSetup: true
      }
    );
  }
}

/**
 * Remote database template
 *
 * Template for connecting to remote database servers
 */
export class RemoteDatabaseTemplate extends Template {
  constructor(hostname, database, options = {}) {
    const port = options.port || '50000';
    const protocol = options.protocol || 'TCPIP';

    super(
      new DatabaseSchema(options),
      {
        database: {
          hostname,
          port,
          database,
          protocol,
          user: options.user || '',
          password: options.password || ''
        }
      },
      {
        name: 'RemoteDatabaseTemplate',
        description: `Remote database: ${hostname}/${database}`,
        tags: ['remote', 'db2'],
        hostname,
        database
      }
    );
  }
}

/**
 * Docker database template
 *
 * Configured for database running in Docker container
 */
export class DockerDatabaseTemplate extends Template {
  constructor(options = {}) {
    const containerName = options.containerName || 'db2-container';
    const database = options.database || 'DOCKERDB';

    super(
      new DatabaseSchema(options),
      {
        database: {
          hostname: 'localhost',
          port: '50000',
          database,
          protocol: 'TCPIP',
          user: 'db2inst1',
          password: 'password'
        }
      },
      {
        name: 'DockerDatabaseTemplate',
        description: `Docker container database: ${containerName}`,
        tags: ['docker', 'container', 'development'],
        containerName
      }
    );
  }
}

/**
 * Helper function to create database template by environment
 *
 * @param {string} env - Environment name (local, test, uat, prod)
 * @param {Object} options - Template options
 * @returns {Template} - Database template instance
 */
export function createDatabaseTemplate(env, options = {}) {
  const templates = {
    local: LocalDatabaseTemplate,
    dev: LocalDatabaseTemplate,
    test: TestDatabaseTemplate,
    uat: UATDatabaseTemplate,
    prod: ProductionDatabaseTemplate,
    production: ProductionDatabaseTemplate,
    docker: DockerDatabaseTemplate
  };

  const TemplateClass = templates[env.toLowerCase()];
  if (!TemplateClass) {
    throw new Error(`Unknown database template environment: ${env}. Available: ${Object.keys(templates).join(', ')}`);
  }

  return new TemplateClass(options);
}
