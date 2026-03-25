/**
 * Example 4: Error Handling
 *
 * Demonstrates:
 * - ErrorHandler with DB2 error code mapping
 * - Development vs. production error modes
 * - Typed errors (NoResults, DuplicateRecord, etc.)
 * - Retryable error detection
 * - Recommended actions
 */

import { DB2Operations } from '../src/DB2Operations.mjs';
import {
  ErrorHandler,
  DatabaseError,
  NoResults,
  DuplicateRecord,
  ConnectionError
} from '../src/index.mjs';

async function errorHandlingExample() {
  console.log('=== Example 4: Error Handling ===\n');

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

    // Example 1: No results error
    console.log('2. Handling NoResults error:');
    try {
      const sql = 'SELECT * FROM TCDEV.TEST WHERE TEST_ID = ?';
      const results = await ops.query(sql, [999999]);

      if (!results || results.length === 0) {
        throw new NoResults('Test 999999 not found');
      }

    } catch (err) {
      if (err instanceof NoResults) {
        console.log('   ✓ NoResults error caught:', err.message);
        console.log('   → Use case: Return 404 to user\n');
      } else {
        throw err;
      }
    }

    // Example 2: Duplicate record error
    console.log('3. Handling DuplicateRecord error:');
    try {
      // First insert
      const insertSql = `
        INSERT INTO TCDEV.TEST (TEST_ID, TEST_NAME, CREATED_DATE, IS_ACTIVE)
        VALUES (12345, 'Unique Test', CURRENT_TIMESTAMP, 1)
      `;
      await ops.query(insertSql);
      console.log('   ✓ First insert succeeded');

      // Duplicate insert (should fail)
      await ops.query(insertSql);

    } catch (err) {
      const handled = ErrorHandler.handle(err, { isDevelopment: true });

      if (handled.error instanceof DuplicateRecord) {
        console.log('   ✓ DuplicateRecord error caught');
        console.log('   → User message:', handled.userMessage);
        console.log('   → Technical message:', handled.technicalMessage);
        console.log('   → Recommended action:', ErrorHandler.getRecommendedAction(err));
        console.log();

        // Cleanup
        await ops.query('DELETE FROM TCDEV.TEST WHERE TEST_ID = 12345');
      } else {
        throw err;
      }
    }

    // Example 3: Development vs. Production error modes
    console.log('4. Development vs. Production error modes:');
    try {
      const badSql = 'SELECT * FROM NONEXISTENT_TABLE';
      await ops.query(badSql);

    } catch (err) {
      // Development mode (show technical details)
      const devHandled = ErrorHandler.handle(err, {
        isDevelopment: true,
        includeStack: true
      });

      console.log('   Development mode:');
      console.log('   → User message:', devHandled.userMessage);
      console.log('   → Technical message:', devHandled.technicalMessage);
      console.log('   → Error type:', devHandled.type);
      console.log('   → SQL code:', devHandled.code);
      console.log();

      // Production mode (hide technical details)
      const prodHandled = ErrorHandler.handle(err, {
        isDevelopment: false
      });

      console.log('   Production mode:');
      console.log('   → User message:', prodHandled.userMessage);
      console.log('   → Technical message:', prodHandled.technicalMessage);
      console.log('   → Stack trace:', prodHandled.stack ? 'Included' : 'Hidden');
      console.log();
    }

    // Example 4: Retryable errors
    console.log('5. Detecting retryable errors:');
    const retryableErrors = [
      { code: 'SQL0911N', description: 'Deadlock detected' },
      { code: 'SQL0913N', description: 'Timeout occurred' },
      { code: 'SQL1024N', description: 'Connection lost' },
      { code: 'SQL0954N', description: 'Resource limit' }
    ];

    for (const { code, description } of retryableErrors) {
      const mockError = { code, message: description };
      const isRetryable = ErrorHandler.isRetryable(mockError);
      console.log(`   ${code} (${description}): ${isRetryable ? '✓ Retryable' : '✗ Not retryable'}`);
    }
    console.log();

    // Example 5: Sensitive data masking
    console.log('6. Sensitive data masking:');
    const errorWithSensitiveData = new Error(
      'Connection failed: password=\'secretpass123\', api_key=\'abc123xyz\''
    );

    const masked = ErrorHandler.handle(errorWithSensitiveData, {
      isDevelopment: true,
      sensitiveFields: ['password', 'api_key', 'token', 'secret']
    });

    console.log('   Original message:', errorWithSensitiveData.message);
    console.log('   Masked message:', masked.userMessage);
    console.log();

    // Example 6: Error classification
    console.log('7. Error classification:');
    const errorCodes = [
      'SQL1024N',  // Connection
      'SQL0551N',  // Permission
      'SQL0104N',  // Syntax
      'SQL0803N',  // Data (duplicate)
      'SQL0902N'   // Resource
    ];

    for (const code of errorCodes) {
      const mockError = { code };
      const handled = ErrorHandler.handle(mockError);
      console.log(`   ${code} → Type: ${handled.type}`);
    }
    console.log();

    // Example 7: Recommended actions
    console.log('8. Recommended actions:');
    const actionErrors = [
      { code: 'SQL0803N', message: 'Duplicate key' },
      { code: 'SQL0530N', message: 'Foreign key violation' },
      { code: 'SQL0551N', message: 'Insufficient permissions' },
      { code: 'SQL0911N', message: 'Deadlock' }
    ];

    for (const { code, message } of actionErrors) {
      const mockError = { code, message };
      const action = ErrorHandler.getRecommendedAction(mockError);
      console.log(`   ${code}:`);
      console.log(`   → ${action}`);
      console.log();
    }

  } catch (err) {
    console.error('Unexpected error:', err.message);
  } finally {
    await ops.disconnect();
    console.log('9. Disconnected\n');
  }
}

// Run example
errorHandlingExample().catch(console.error);
