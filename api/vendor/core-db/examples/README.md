# @rescor/core-db Examples

This directory contains comprehensive examples demonstrating how to use the `@rescor/core-db` package.

## Prerequisites

1. **IBM DB2 Database**: You need access to an IBM DB2 database instance
2. **Connection Details**: Update connection parameters in each example:
   - `hostname`: Database host (default: localhost)
   - `port`: Database port (default: 50000)
   - `database`: Database name (default: TESTDB)
   - `user`: Database user
   - `password`: Database password
   - `schema`: Database schema (e.g., TCDEV, SPMDEV)

3. **Test Tables**: Some examples require test tables. See [Database Setup](#database-setup) below.

## Examples

### 01-basic-usage.mjs

**Demonstrates**:
- Creating a DB2Operations instance
- Connecting to database
- Executing queries
- Disconnecting properly

**Run**:
```bash
node examples/01-basic-usage.mjs
```

**Key Concepts**:
- Connection management
- Query execution
- Metadata inspection
- Error handling basics

---

### 02-transforms.mjs

**Demonstrates**:
- Creating transform configurations
- Type conversions (int, date, bool, json)
- Value transformations
- Applying transforms to results
- Built-in MassageResults() method
- Composing multiple transforms

**Run**:
```bash
node examples/02-transforms.mjs
```

**Key Concepts**:
- Transform system architecture
- Type safety through transforms
- Custom value transformations
- Transform composition

---

### 03-transactions.mjs

**Demonstrates**:
- Manual transaction control (begin, commit, rollback)
- Automatic transaction management via transaction()
- Error handling and auto-rollback
- Complex multi-table operations

**Run**:
```bash
node examples/03-transactions.mjs
```

**Key Concepts**:
- ACID guarantees
- Automatic rollback on error
- Multi-step operations
- Transaction best practices

---

### 04-error-handling.mjs

**Demonstrates**:
- ErrorHandler with DB2 error code mapping
- Development vs. production error modes
- Typed errors (NoResults, DuplicateRecord, etc.)
- Retryable error detection
- Recommended actions for common errors
- Sensitive data masking

**Run**:
```bash
node examples/04-error-handling.mjs
```

**Key Concepts**:
- DB2 error code mapping
- User-friendly error messages
- Error classification
- Security (data masking)
- Retry strategies

---

### 05-custom-operations.mjs

**Demonstrates**:
- Creating a project-specific Operations subclass
- Using transforms with custom operations
- Adding domain-specific methods
- Schema-qualified table references
- Complete CRUD operations (Create, Read, Update, Delete)

**Run**:
```bash
node examples/05-custom-operations.mjs
```

**Key Concepts**:
- Subclassing DB2Operations
- Domain-specific business logic
- Full CRUD lifecycle
- Best practices for custom operations

---

## Database Setup

To run these examples, you'll need test tables in your DB2 database:

### TEST Table

```sql
CREATE TABLE TCDEV.TEST (
  TEST_ID INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  TEST_NAME VARCHAR(255) NOT NULL,
  CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  IS_ACTIVE SMALLINT DEFAULT 1,
  METADATA CLOB
);

-- Create some test data
INSERT INTO TCDEV.TEST (TEST_NAME, IS_ACTIVE, METADATA) VALUES
  ('Example Test 1', 1, '{"priority": "high"}'),
  ('Example Test 2', 1, '{"priority": "medium"}'),
  ('Example Test 3', 0, '{"priority": "low"}');
```

### FINDING Table (for transaction example)

```sql
CREATE TABLE TCDEV.FINDING (
  FINDING_ID INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  TEST_ID INTEGER,
  SEVERITY VARCHAR(20),
  DESCRIPTION CLOB,
  FOREIGN KEY (TEST_ID) REFERENCES TCDEV.TEST(TEST_ID)
);
```

## Running All Examples

To run all examples in sequence:

```bash
# Run each example individually
node examples/01-basic-usage.mjs
node examples/02-transforms.mjs
node examples/03-transactions.mjs
node examples/04-error-handling.mjs
node examples/05-custom-operations.mjs
```

Or create a test script:

```bash
#!/bin/bash
# run-all-examples.sh

echo "Running all core-db examples..."
echo "================================"

for example in examples/*.mjs; do
  echo ""
  echo "Running: $example"
  node "$example"
  echo "--------------------------------"
done

echo ""
echo "All examples completed!"
```

## Common Issues

### Connection Errors

**Problem**: `SQL1024N: Database connection lost` or `SQL30080N: Communication error`

**Solution**: Verify connection details:
- Database is running and accessible
- Hostname, port, database name are correct
- User has CONNECT privilege
- Network allows connection to DB2 port

### Table Not Found

**Problem**: `SQL0204N: <table> is an undefined name`

**Solution**:
- Run the [Database Setup](#database-setup) SQL scripts
- Verify schema name matches your environment (TCDEV, SPMDEV, etc.)
- Check user has SELECT privilege on the tables

### Permission Errors

**Problem**: `SQL0551N: <user> does not have the required authorization`

**Solution**: Grant necessary privileges:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TCDEV.TEST TO USER devuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON TCDEV.FINDING TO USER devuser;
```

## Example Output

Here's what you should see when running `01-basic-usage.mjs`:

```
=== Example 1: Basic Usage ===

1. Connecting to database...
   ✓ Connected

2. Executing query...
   ✓ Query returned 3 rows

3. First result (raw):
    { TEST_ID: 1, TEST_NAME: 'Example Test 1      ', CREATED_DATE: 2024-01-15T..., ... }

4. Operations metadata:
   Schema: TCDEV
   Connected: true

5. Disconnecting...
   ✓ Disconnected
```

## Next Steps

After running these examples:

1. **Read the Migration Guides**:
   - [TestingCenter Migration Guide](../docs/MIGRATION-TESTINGCENTER.md)
   - [SPM Migration Guide](../docs/MIGRATION-SPM.md)

2. **Review Architecture Documentation**:
   - [Architecture Overview](../docs/ARCHITECTURE.md) (coming soon)
   - [Migration Progress](../docs/MIGRATION-PROGRESS.md)

3. **Create Your Own Operations Subclass**:
   - Use `05-custom-operations.mjs` as a template
   - Add domain-specific methods for your project
   - Leverage transforms for data normalization

4. **Integrate with Your Project**:
   - Install `@rescor/core-db` in your project
   - Replace existing database code
   - Follow migration guide checklist

## Support

For questions or issues:
- **GitHub Issues**: https://github.com/rescor/core.rescor.net/issues
- **Documentation**: See `/docs` directory
- **Email**: core-support@rescor.net

## License

UNLICENSED - Internal RESCOR use only
