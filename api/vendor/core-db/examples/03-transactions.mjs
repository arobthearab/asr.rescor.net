/**
 * Example 3: Transactions
 *
 * Demonstrates:
 * - Manual transaction control (begin, commit, rollback)
 * - Automatic transaction management via transaction()
 * - Error handling and auto-rollback
 * - Complex multi-table operations
 */

import { DB2Operations } from '../src/DB2Operations.mjs';

async function transactionExample() {
  console.log('=== Example 3: Transactions ===\n');

  const ops = new DB2Operations({
    schema: 'TCDEV',
    hostname: 'localhost',
    port: 50000,
    database: 'TESTDB',
    user: 'devuser',
    password: 'devpass123'
  });

  try {
    await ops.connect();
    console.log('1. Connected to database\n');

    // Example 1: Manual transaction control
    console.log('2. Manual transaction control:');
    try {
      await ops.beginTransaction();
      console.log('   ✓ Transaction started');

      // Insert test record
      const insertSql = `
        INSERT INTO TCDEV.TEST (TEST_NAME, CREATED_DATE, IS_ACTIVE)
        VALUES (?, CURRENT_TIMESTAMP, 1)
      `;
      await ops.query(insertSql, ['Manual Transaction Test']);
      console.log('   ✓ Record inserted');

      // Commit transaction
      await ops.commit();
      console.log('   ✓ Transaction committed\n');

    } catch (err) {
      console.error('   ✗ Error:', err.message);
      await ops.rollback();
      console.log('   ↩ Transaction rolled back\n');
    }

    // Example 2: Automatic transaction management
    console.log('3. Automatic transaction (success case):');
    try {
      const result = await ops.transaction(async () => {
        // Insert test record
        const insertSql = `
          INSERT INTO TCDEV.TEST (TEST_NAME, CREATED_DATE, IS_ACTIVE)
          VALUES (?, CURRENT_TIMESTAMP, 1)
        `;
        await ops.query(insertSql, ['Auto Transaction Test']);
        console.log('   ✓ Record inserted');

        // Update related records
        const updateSql = `
          UPDATE TCDEV.TEST
          SET IS_ACTIVE = 1
          WHERE TEST_NAME LIKE ?
        `;
        await ops.query(updateSql, ['%Transaction%']);
        console.log('   ✓ Related records updated');

        return 'SUCCESS';
      });

      console.log('   ✓ Transaction committed automatically');
      console.log('   ✓ Result:', result);
      console.log();

    } catch (err) {
      console.error('   ✗ Transaction failed:', err.message);
      console.log();
    }

    // Example 3: Automatic rollback on error
    console.log('4. Automatic transaction (error case):');
    try {
      await ops.transaction(async () => {
        // Insert valid record
        const insertSql = `
          INSERT INTO TCDEV.TEST (TEST_NAME, CREATED_DATE, IS_ACTIVE)
          VALUES (?, CURRENT_TIMESTAMP, 1)
        `;
        await ops.query(insertSql, ['Will Be Rolled Back']);
        console.log('   ✓ Record inserted');

        // Intentionally cause an error
        const badSql = 'SELECT * FROM NONEXISTENT_TABLE';
        await ops.query(badSql);

        // This won't execute
        console.log('   (This should not print)');
      });

    } catch (err) {
      console.log('   ✗ Error occurred:', err.message);
      console.log('   ↩ Transaction automatically rolled back');
      console.log('   ✓ First insert was undone');
      console.log();
    }

    // Example 4: Complex multi-step transaction
    console.log('5. Complex multi-step transaction:');
    const testId = await ops.transaction(async () => {
      // Step 1: Insert test
      const testSql = `
        INSERT INTO TCDEV.TEST (TEST_NAME, CREATED_DATE, IS_ACTIVE)
        VALUES (?, CURRENT_TIMESTAMP, 1)
      `;
      await ops.query(testSql, ['Complex Transaction Test']);
      console.log('   ✓ Step 1: Test created');

      // Step 2: Get the test ID (simulated - in real code, use IDENTITY_VAL_LOCAL())
      const getSql = `
        SELECT TEST_ID FROM TCDEV.TEST
        WHERE TEST_NAME = ?
        ORDER BY TEST_ID DESC
        FETCH FIRST 1 ROW ONLY
      `;
      const results = await ops.query(getSql, ['Complex Transaction Test']);
      const testId = results[0]?.TEST_ID;
      console.log('   ✓ Step 2: Retrieved test ID:', testId);

      // Step 3: Insert related finding
      const findingSql = `
        INSERT INTO TCDEV.FINDING (TEST_ID, SEVERITY, DESCRIPTION)
        VALUES (?, ?, ?)
      `;
      await ops.query(findingSql, [testId, 'HIGH', 'Test finding']);
      console.log('   ✓ Step 3: Finding created');

      // Step 4: Update test status
      const updateSql = `
        UPDATE TCDEV.TEST
        SET IS_ACTIVE = 1
        WHERE TEST_ID = ?
      `;
      await ops.query(updateSql, [testId]);
      console.log('   ✓ Step 4: Test status updated');

      return testId;
    });

    console.log('   ✓ All steps committed as atomic unit');
    console.log('   ✓ Test ID:', testId);
    console.log();

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await ops.disconnect();
    console.log('6. Disconnected\n');
  }
}

// Run example
transactionExample().catch(console.error);
