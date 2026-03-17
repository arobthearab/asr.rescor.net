import fs from 'node:fs';
import path from 'node:path';
import { Recorder } from '@rescor-llc/core-utils';
import { createOperations, getActiveAdapter } from '../src/db/createOperations.mjs';

const adapter = getActiveAdapter();
const adapterMigrationsDir = path.resolve(process.cwd(), 'migrations', adapter);
const fallbackMigrationsDir = path.resolve(process.cwd(), 'migrations');
const migrationsDir = fs.existsSync(adapterMigrationsDir) ? adapterMigrationsDir : fallbackMigrationsDir;

const recorder = new Recorder(process.env.ASR_API_LOG_FILE || 'asr-api.log', 'asr-migrations');
const operations = createOperations({ recorder });

await operations.connect();

if (adapter === 'db2') {
  await operations.query(`
    CREATE TABLE asr_schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL
    )
  `).catch(() => {
    // Table may already exist in DB2; ignore in bootstrap path.
  });
} else {
  await operations.query(`
    CREATE TABLE IF NOT EXISTS asr_schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort((left, right) => left.localeCompare(right));

recorder.emit(7413, 'i', 'Applying migrations', { adapter, count: files.length });

for (const fileName of files) {
  const existing = await operations.query(
    'SELECT 1 AS applied FROM asr_schema_migrations WHERE name = ?',
    [fileName]
  );

  if (existing.length > 0) {
    recorder.emit(7412, 'i', 'Skipped migration (already applied)', { fileName });
    process.stdout.write(`skip ${fileName}\n`);
    continue;
  }

  const fullPath = path.join(migrationsDir, fileName);
  const sql = fs.readFileSync(fullPath, 'utf8');

  await operations.transaction(async (tx) => {
    await tx.query(sql);
    await tx.query(
      'INSERT INTO asr_schema_migrations (name, applied_at) VALUES (?, ?)',
      [fileName, new Date().toISOString()]
    );
  });

  recorder.emit(7411, 'i', 'Applied migration', { fileName });
  process.stdout.write(`apply ${fileName}\n`);
}

await operations.disconnect();
recorder.emit(7410, 'i', 'Migrations complete', { adapter, count: files.length });
process.stdout.write('migrations complete\n');
