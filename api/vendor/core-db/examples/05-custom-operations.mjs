/**
 * Example 5: Custom Operations Subclass
 *
 * Demonstrates:
 * - Creating a project-specific Operations subclass
 * - Using transforms with custom operations
 * - Adding domain-specific methods
 * - Schema-qualified table references
 * - Complete CRUD operations
 */

import { DB2Operations, NoResults } from '../src/DB2Operations.mjs';
import { Transforms, TransformColumn } from '../src/Transforms.mjs';

/**
 * Define transforms for TEST table
 */
const TestTransforms = new Transforms([
  new TransformColumn('test_id', { type: 'int' }),
  new TransformColumn('test_name', {
    valueTransform: (val) => val?.trim()
  }),
  new TransformColumn('created_date', { type: 'date' }),
  new TransformColumn('is_active', { type: 'bool' }),
  new TransformColumn('metadata', { type: 'json' })
]);

/**
 * TestOperations - Custom operations for TEST table
 *
 * This is a complete example of how to create a project-specific
 * Operations subclass for TestingCenter, SPM, or any other project.
 */
class TestOperations extends DB2Operations {
  constructor(options = {}) {
    super({
      ...options,
      transforms: TestTransforms
    });
    this.testTransforms = TestTransforms;
  }

  /**
   * Get qualified TEST table name
   */
  get testTable() {
    return this.qualifyTable('TEST');
  }

  /**
   * Get all tests
   *
   * @returns {Promise<Array>} - All tests
   */
  async getAllTests() {
    const sql = `SELECT * FROM ${this.testTable} ORDER BY TEST_NAME`;
    const results = await this.query(sql);
    return this.testTransforms.apply(results);
  }

  /**
   * Get test by ID
   *
   * @param {number} testId - Test ID
   * @returns {Promise<Object>} - Test details
   * @throws {NoResults} - If test not found
   */
  async getTestById(testId) {
    const sql = `SELECT * FROM ${this.testTable} WHERE TEST_ID = ?`;
    const results = await this.query(sql, [testId]);

    if (!results || results.length === 0) {
      throw new NoResults(`Test ${testId} not found`);
    }

    const transformed = this.testTransforms.apply(results);
    return transformed[0];
  }

  /**
   * Get active tests
   *
   * @returns {Promise<Array>} - Active tests
   */
  async getActiveTests() {
    const sql = `
      SELECT * FROM ${this.testTable}
      WHERE IS_ACTIVE = 1
      ORDER BY TEST_NAME
    `;
    const results = await this.query(sql);
    return this.testTransforms.apply(results);
  }

  /**
   * Search tests by name
   *
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} - Matching tests
   */
  async searchTests(searchTerm) {
    const sql = `
      SELECT * FROM ${this.testTable}
      WHERE UPPER(TEST_NAME) LIKE ?
      ORDER BY TEST_NAME
    `;
    const results = await this.query(sql, [`%${searchTerm.toUpperCase()}%`]);
    return this.testTransforms.apply(results);
  }

  /**
   * Create new test
   *
   * @param {Object} testData - Test details
   * @returns {Promise<Object>} - Created test
   */
  async createTest(testData) {
    const sql = `
      INSERT INTO ${this.testTable} (
        TEST_NAME, CREATED_DATE, IS_ACTIVE, METADATA
      ) VALUES (?, CURRENT_TIMESTAMP, ?, ?)
    `;

    const params = [
      testData.test_name,
      testData.is_active ? 1 : 0,
      testData.metadata ? JSON.stringify(testData.metadata) : null
    ];

    await this.query(sql, params);

    // Return created test (in real code, use IDENTITY_VAL_LOCAL())
    const getResults = await this.query(
      `SELECT * FROM ${this.testTable} WHERE TEST_NAME = ? ORDER BY TEST_ID DESC FETCH FIRST 1 ROW ONLY`,
      [testData.test_name]
    );

    const transformed = this.testTransforms.apply(getResults);
    return transformed[0];
  }

  /**
   * Update test
   *
   * @param {number} testId - Test ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated test
   */
  async updateTest(testId, updates) {
    const fields = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      const upperKey = key.toUpperCase();
      if (upperKey !== 'TEST_ID') {
        fields.push(`${upperKey} = ?`);

        if (upperKey === 'METADATA') {
          params.push(JSON.stringify(value));
        } else if (upperKey === 'IS_ACTIVE') {
          params.push(value ? 1 : 0);
        } else {
          params.push(value);
        }
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    params.push(testId);

    const sql = `
      UPDATE ${this.testTable}
      SET ${fields.join(', ')}
      WHERE TEST_ID = ?
    `;

    await this.query(sql, params);
    return this.getTestById(testId);
  }

  /**
   * Delete test
   *
   * @param {number} testId - Test ID
   * @returns {Promise<void>}
   */
  async deleteTest(testId) {
    const sql = `DELETE FROM ${this.testTable} WHERE TEST_ID = ?`;
    await this.query(sql, [testId]);
  }

  /**
   * Activate/deactivate test
   *
   * @param {number} testId - Test ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object>} - Updated test
   */
  async setTestActive(testId, isActive) {
    return this.updateTest(testId, { is_active: isActive });
  }

  /**
   * Get test count
   *
   * @param {Object} options - Filter options
   * @returns {Promise<number>} - Test count
   */
  async getTestCount(options = {}) {
    let sql = `SELECT COUNT(*) as count FROM ${this.testTable}`;
    const params = [];

    if (options.activeOnly) {
      sql += ' WHERE IS_ACTIVE = 1';
    }

    const results = await this.query(sql, params);
    return results[0]?.COUNT || 0;
  }
}

/**
 * Run the example
 */
async function customOperationsExample() {
  console.log('=== Example 5: Custom Operations Subclass ===\n');

  const ops = new TestOperations({
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

    // Create a test
    console.log('2. Creating test:');
    const newTest = await ops.createTest({
      test_name: 'Custom Operations Example',
      is_active: true,
      metadata: {
        category: 'example',
        priority: 'high',
        tags: ['demo', 'custom-ops']
      }
    });
    console.log('   ✓ Created test:', newTest.test_id);
    console.log('   → Name:', newTest.test_name);
    console.log('   → Active:', newTest.is_active);
    console.log('   → Metadata:', newTest.metadata);
    console.log();

    // Get by ID
    console.log('3. Getting test by ID:');
    const retrieved = await ops.getTestById(newTest.test_id);
    console.log('   ✓ Retrieved test:', retrieved.test_id);
    console.log('   → Created date:', retrieved.created_date);
    console.log();

    // Update test
    console.log('4. Updating test:');
    const updated = await ops.updateTest(newTest.test_id, {
      test_name: 'Updated Custom Operations Example',
      metadata: {
        ...newTest.metadata,
        updated: true
      }
    });
    console.log('   ✓ Updated test:', updated.test_id);
    console.log('   → New name:', updated.test_name);
    console.log('   → Updated metadata:', updated.metadata);
    console.log();

    // Search tests
    console.log('5. Searching tests:');
    const searchResults = await ops.searchTests('custom');
    console.log(`   ✓ Found ${searchResults.length} test(s) matching "custom"`);
    searchResults.forEach(test => {
      console.log(`   → ${test.test_id}: ${test.test_name}`);
    });
    console.log();

    // Get active tests
    console.log('6. Getting active tests:');
    const activeTests = await ops.getActiveTests();
    console.log(`   ✓ Found ${activeTests.length} active test(s)`);
    console.log();

    // Get test count
    console.log('7. Getting test count:');
    const totalCount = await ops.getTestCount();
    const activeCount = await ops.getTestCount({ activeOnly: true });
    console.log(`   ✓ Total tests: ${totalCount}`);
    console.log(`   ✓ Active tests: ${activeCount}`);
    console.log();

    // Deactivate test
    console.log('8. Deactivating test:');
    const deactivated = await ops.setTestActive(newTest.test_id, false);
    console.log('   ✓ Test deactivated');
    console.log('   → Active status:', deactivated.is_active);
    console.log();

    // Delete test
    console.log('9. Deleting test:');
    await ops.deleteTest(newTest.test_id);
    console.log('   ✓ Test deleted');
    console.log();

    // Verify deletion
    console.log('10. Verifying deletion:');
    try {
      await ops.getTestById(newTest.test_id);
      console.log('   ✗ Test still exists (should have been deleted)');
    } catch (err) {
      if (err instanceof NoResults) {
        console.log('   ✓ Test successfully deleted (NoResults thrown)');
      } else {
        throw err;
      }
    }
    console.log();

  } catch (err) {
    console.error('Error:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
  } finally {
    await ops.disconnect();
    console.log('11. Disconnected\n');
  }
}

// Run example
customOperationsExample().catch(console.error);
