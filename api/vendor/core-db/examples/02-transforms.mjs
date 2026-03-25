/**
 * Example 2: Transform System
 *
 * Demonstrates:
 * - Creating transform configurations
 * - Type conversions (int, date, bool, json)
 * - Value transformations
 * - Applying transforms to results
 */

import { DB2Operations } from '../src/DB2Operations.mjs';
import { Transforms, TransformColumn } from '../src/Transforms.mjs';

async function transformExample() {
  console.log('=== Example 2: Transform System ===\n');

  // Define transforms for TEST table
  const testTransforms = new Transforms([
    // Convert TEST_ID to integer
    new TransformColumn('test_id', { type: 'int' }),

    // Trim and lowercase test name
    new TransformColumn('test_name', {
      valueTransform: (val) => val?.trim().toLowerCase()
    }),

    // Convert created date to Date object
    new TransformColumn('created_date', { type: 'date' }),

    // Convert IS_ACTIVE to boolean
    new TransformColumn('is_active', { type: 'bool' }),

    // Parse JSON metadata
    new TransformColumn('metadata', { type: 'json' }),

    // Custom transformation: calculate age in days
    new TransformColumn('age_days', {
      valueTransform: (val, row) => {
        if (row.CREATED_DATE) {
          const created = new Date(row.CREATED_DATE);
          const now = new Date();
          const diffTime = Math.abs(now - created);
          return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        return null;
      }
    })
  ]);

  const ops = new DB2Operations({
    schema: 'TCDEV',
    hostname: 'localhost',
    port: 50000,
    database: 'TESTDB',
    user: 'devuser',
    password: 'devpass123',
    transforms: testTransforms
  });

  try {
    await ops.connect();
    console.log('1. Connected to database\n');

    // Query without transforms
    console.log('2. Raw results (no transforms):');
    const rawSql = 'SELECT * FROM TCDEV.TEST WHERE TEST_ID = ?';
    const rawResults = await ops.query(rawSql, [1]);
    if (rawResults.length > 0) {
      console.log('   TEST_ID type:', typeof rawResults[0].TEST_ID);
      console.log('   TEST_NAME:', rawResults[0].TEST_NAME);
      console.log('   CREATED_DATE type:', typeof rawResults[0].CREATED_DATE);
      console.log('   IS_ACTIVE type:', typeof rawResults[0].IS_ACTIVE);
      console.log();
    }

    // Query with transforms
    console.log('3. Transformed results:');
    const transformedResults = testTransforms.apply(rawResults);
    if (transformedResults.length > 0) {
      const row = transformedResults[0];
      console.log('   test_id type:', typeof row.test_id, '→', row.test_id);
      console.log('   test_name:', row.test_name);
      console.log('   created_date type:', typeof row.created_date, '→', row.created_date instanceof Date ? 'Date object' : row.created_date);
      console.log('   is_active type:', typeof row.is_active, '→', row.is_active);
      console.log('   age_days:', row.age_days, 'days old');
      console.log();
    }

    // Demonstrate Operations.MassageResults (built-in transform)
    console.log('4. Built-in MassageResults (lowercase keys, trim):');
    const massagedResults = ops.constructor.MassageResults(rawResults);
    if (massagedResults.length > 0) {
      console.log('   Keys:', Object.keys(massagedResults[0]));
      console.log();
    }

    // Demonstrate composition: MassageResults + custom transforms
    console.log('5. Composed transforms (MassageResults + custom):');
    const massaged = ops.constructor.MassageResults(rawResults);
    const composed = testTransforms.apply(massaged);
    if (composed.length > 0) {
      console.log('   Final result:', composed[0]);
      console.log();
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await ops.disconnect();
    console.log('6. Disconnected\n');
  }
}

// Run example
transformExample().catch(console.error);
