import { ConnectString, DB2Operations, ConnectionError, withAudit } from '@rescor-llc/core-db';
import { SqliteCoreDbOperations } from './SqliteCoreDbOperations.mjs';

function getDbAdapter() {
  return (process.env.ASR_DB_ADAPTER || 'sqlite').toLowerCase();
}

function getDb2ConnectionString() {
  if (process.env.ASR_DB2_CONNECTION_STRING) {
    return process.env.ASR_DB2_CONNECTION_STRING;
  }

  const hostname = process.env.ASR_DB2_HOST || process.env.DB2_HOST || 'localhost';
  const port = Number(process.env.ASR_DB2_PORT || process.env.DB2_PORT || 50000);
  const database = process.env.ASR_DB2_DATABASE || process.env.DB2_DATABASE;
  const user = process.env.ASR_DB2_USER || process.env.DB2_USER;
  const password = process.env.ASR_DB2_PASSWORD || process.env.DB2_PASSWORD;

  if (!database || !user || !password) {
    throw new ConnectionError(
      'DB2 adapter selected but DB2 credentials are incomplete. Set ASR_DB2_CONNECTION_STRING or ASR_DB2_DATABASE/ASR_DB2_USER/ASR_DB2_PASSWORD.',
      'ASR_DB2_CONFIG_MISSING'
    );
  }

  const connectString = new ConnectString({
    hostname,
    port,
    database
  });

  return connectString.buildDirect(user, password);
}

export function createOperations({ recorder }) {
  const adapter = getDbAdapter();

  if (adapter === 'db2') {
    const operations = new DB2Operations({
      schema: process.env.ASR_DB2_SCHEMA || 'ASRDEV',
      connectionString: getDb2ConnectionString(),
      recorder
    });

    operations.driver = 'db2';

    return withAudit(operations, {
      recorder,
      isDevelopment: process.env.NODE_ENV !== 'production'
    });
  }

  const operations = new SqliteCoreDbOperations({
    schema: 'ASR',
    databasePath: process.env.ASR_SQLITE_PATH || './asr.db',
    recorder
  });

  operations.driver = 'sqlite';

  return withAudit(operations, {
    recorder,
    isDevelopment: process.env.NODE_ENV !== 'production'
  });
}

export function getActiveAdapter() {
  return getDbAdapter();
}
