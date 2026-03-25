#!/usr/bin/env node
/**
 * bench-insert — DB2 insert throughput measurement tool
 *
 * Creates a session-scoped global temporary table that mirrors a base table,
 * inserts a specified number of randomized rows, and reports throughput.
 *
 * Usage:
 *   node bench-insert.mjs --table TABLENAME --schema SCHEMANAME [--rows N] [--batch]
 *
 * Options:
 *   --table,  -t   Base table name (required)
 *   --schema, -s   Schema name (required)
 *   --rows,   -r   Number of rows to insert (default: 1000)
 *   --batch,  -b   Use multi-row INSERT (500 rows/chunk) instead of a prepared-statement loop
 *
 * The temporary table (SESSION.BENCH_<TABLE>) is automatically dropped when
 * the connection closes. No data is written to the base table.
 */

import { performance } from 'perf_hooks';
import { DB2Operations } from '../src/DB2Operations.mjs';
import { Operations } from '../src/Operations.mjs';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArguments(argv) {
  let table = null;
  let schema = null;
  let rowCount = 1000;
  let batch = false;

  const args = argv.slice(2);

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--table' || arg === '-t') {
      table = args[++index]?.toUpperCase() ?? null;
    } else if (arg === '--schema' || arg === '-s') {
      schema = args[++index]?.toUpperCase() ?? null;
    } else if (arg === '--rows' || arg === '-r') {
      rowCount = parseInt(args[++index], 10) || 1000;
    } else if (arg === '--batch' || arg === '-b') {
      batch = true;
    }
  }

  return { table, schema, rowCount, batch };
}

// ---------------------------------------------------------------------------
// Random value generators — one per DB2 type family
// ---------------------------------------------------------------------------

const RANDOM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';

function randomString(maxLength) {
  const length = Math.max(1, Math.floor(Math.random() * Math.min(maxLength, 40)));
  let result = '';
  for (let index = 0; index < length; index++) {
    result += RANDOM_CHARS.charAt(Math.floor(Math.random() * RANDOM_CHARS.length));
  }
  return result;
}

function randomFixedString(length) {
  let result = '';
  for (let index = 0; index < length; index++) {
    result += RANDOM_CHARS.charAt(Math.floor(Math.random() * RANDOM_CHARS.length));
  }
  return result;
}

function randomDate() {
  const year  = 2000 + Math.floor(Math.random() * 25);
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day   = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function randomTime() {
  const hour   = String(Math.floor(Math.random() * 24)).padStart(2, '0');
  const minute = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  const second = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  return `${hour}:${minute}:${second}`;
}

function randomTimestamp() {
  return `${randomDate()}-${randomTime()}.000000`;
}

function generateValue(column) {
  const type   = column.type.toUpperCase().trim();
  const length = column.length || 10;
  const scale  = column.scale  || 0;

  let answer = null;

  if (type === 'INTEGER' || type === 'INT') {
    answer = Math.floor(Math.random() * 2000000) - 1000000;
  } else if (type === 'SMALLINT') {
    answer = Math.floor(Math.random() * 60000) - 30000;
  } else if (type === 'BIGINT') {
    answer = Math.floor(Math.random() * 1000000000);
  } else if (type === 'DECIMAL' || type === 'NUMERIC') {
    const max = Math.pow(10, length - scale) - 1;
    answer = parseFloat((Math.random() * max).toFixed(scale));
  } else if (type === 'FLOAT' || type === 'DOUBLE' || type === 'REAL') {
    answer = Math.random() * 10000;
  } else if (type === 'CHARACTER' || type === 'CHAR') {
    answer = randomFixedString(length);
  } else if (type === 'VARCHAR') {
    answer = randomString(length);
  } else if (type === 'DATE') {
    answer = randomDate();
  } else if (type === 'TIME') {
    answer = randomTime();
  } else if (type === 'TIMESTAMP') {
    answer = randomTimestamp();
  } else if (type === 'BOOLEAN') {
    answer = Math.random() > 0.5 ? 1 : 0;
  } else if (type === 'CLOB' || type === 'DBCLOB') {
    answer = `bench-data-${Math.floor(Math.random() * 1000000)}`;
  } else {
    answer = String(Math.floor(Math.random() * 999999));
  }

  return answer;
}

// ---------------------------------------------------------------------------
// Result formatter
// ---------------------------------------------------------------------------

function formatElapsed(milliseconds) {
  const totalSeconds = milliseconds / 1000;
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = seconds.toFixed(4).padStart(7, '0');

  return `${hh}:${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

async function runBenchmark({ table, schema, rowCount, batch }) {
  let result = { success: false };
  let operations = null;

  try {
    const config = await Operations.getGlobalConfiguration();
    operations = new DB2Operations({ config, schema });
    await operations.connect();

    // Introspect the base table
    const columnRows = await operations.query(
      `SELECT COLNAME, TYPENAME, LENGTH, SCALE
       FROM SYSCAT.COLUMNS
       WHERE TABSCHEMA = ? AND TABNAME = ?
       ORDER BY COLNO`,
      [schema, table]
    );

    if (!columnRows || columnRows.length === 0) {
      throw new Error(`Table ${schema}.${table} not found or has no columns in SYSCAT.COLUMNS`);
    }

    const columns = columnRows.map(row => ({
      name:   row.COLNAME   ?? row.colname,
      type:   row.TYPENAME  ?? row.typename,
      length: row.LENGTH    ?? row.length,
      scale:  row.SCALE     ?? row.scale,
    }));

    console.log(`\nBase table:     ${schema}.${table}`);
    console.log(`Columns:        ${columns.length}`);
    console.log(`Temp table:     SESSION.BENCH_${table}`);
    console.log(`Rows to insert: ${rowCount.toLocaleString()}`);
    console.log(`Mode:           ${batch ? 'batch (multi-row INSERT, 500 rows/chunk)' : 'loop (prepared statement)'}\n`);

    // Create the session-scoped temporary table (no identity generation — all columns writable)
    await operations.query(
      `DECLARE GLOBAL TEMPORARY TABLE SESSION.BENCH_${table}
         LIKE ${schema}.${table}
         INCLUDING DEFAULTS
         WITH REPLACE
         ON COMMIT PRESERVE ROWS
         NOT LOGGED`
    );

    const columnNames = columns.map(col => col.name);
    const columnList  = columnNames.join(', ');
    const insertSql   = `INSERT INTO SESSION.BENCH_${table} (${columnList}) VALUES (${columnNames.map(() => '?').join(', ')})`;

    let start, finish;

    if (batch) {
      const allRows = [];
      for (let row = 0; row < rowCount; row++) {
        allRows.push(columns.map(col => generateValue(col)));
      }
      start = performance.now();
      await operations.insertMany(`SESSION.BENCH_${table}`, columnNames, allRows);
      finish = performance.now();
    } else {
      const statement = await operations.handle.prepare(insertSql);
      start = performance.now();
      for (let row = 0; row < rowCount; row++) {
        const params = columns.map(col => generateValue(col));
        await statement.execute(params);
      }
      finish = performance.now();
      await statement.close();
    }

    const elapsedMs      = finish - start;
    const elapsed        = formatElapsed(elapsedMs);
    const rowsPerSecond  = Math.round((rowCount / elapsedMs) * 1000);

    console.log('Results');
    console.log('-------');
    console.log(`Rows inserted:  ${rowCount.toLocaleString()}`);
    console.log(`Elapsed:        ${elapsed}`);
    console.log(`Throughput:     ${rowsPerSecond.toLocaleString()} rows/sec`);

    result = { success: true, rowCount, elapsedMs, rowsPerSecond };

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    result = { success: false, error: error.message };
  } finally {
    if (operations) {
      await operations.disconnect();
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const { table, schema, rowCount, batch } = parseArguments(process.argv);

if (!table || !schema) {
  console.error('Usage: node bench-insert.mjs --table TABLENAME --schema SCHEMANAME [--rows N] [--batch]');
  process.exit(1);
}

const outcome = await runBenchmark({ table, schema, rowCount, batch });
process.exit(outcome.success ? 0 : 1);
