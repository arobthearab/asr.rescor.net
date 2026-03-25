# Resilience Utilities

**Package**: `@rescor/core-utils`
**Date**: 2026-02-17
**Status**: Production Ready

---

## Overview

The resilience utilities provide battle-tested patterns for building reliable distributed systems:

- **Circuit Breaker**: Prevent cascade failures by stopping requests to failing services
- **Health Check**: Standardized health monitoring with aggregation
- **Retry & Timeout**: Built into all health check functions

---

## Circuit Breaker

### What is a Circuit Breaker?

A circuit breaker monitors failures and stops calling a failing service to:
- Prevent cascade failures
- Allow time for recovery
- Provide fast failure instead of slow timeouts

### States

```
CLOSED (Normal Operation)
  ↓ (5 failures in 60s)
OPEN (Blocking Requests)
  ↓ (wait 30s)
HALF_OPEN (Testing Recovery)
  ↓ (2 successes)
CLOSED (Back to Normal)
```

### Basic Usage

```javascript
import { CircuitBreaker } from '@rescor/core-utils';

const dbBreaker = new CircuitBreaker('database', {
  failureThreshold: 5,      // Open after 5 failures
  windowMs: 60000,          // In 60 second window
  resetTimeoutMs: 30000,    // Try recovery after 30s
  successThreshold: 2       // Close after 2 successes
});

// Use the breaker
try {
  const result = await dbBreaker.execute(async () => {
    return await database.query('SELECT * FROM users');
  });

  console.log('Query succeeded:', result);
} catch (err) {
  if (err.name === 'CircuitBreakerOpenError') {
    // Circuit is open, use fallback
    console.log('Using cached data due to circuit breaker');
    return getCachedUsers();
  }

  // Real error, handle it
  throw err;
}
```

### Circuit Breaker Manager

Manage multiple circuit breakers:

```javascript
import { CircuitBreakerManager } from '@rescor/core-utils';

const manager = new CircuitBreakerManager({
  // Default options for all breakers
  failureThreshold: 5,
  windowMs: 60000,
  resetTimeoutMs: 30000
});

// Automatic breaker creation and management
await manager.execute('database', async () => {
  return await db.query('SELECT 1');
});

await manager.execute('redis', async () => {
  return await redis.get('key');
});

// Get statistics for all breakers
const stats = manager.getAllStats();
console.log(stats);
// [
//   { serviceName: 'database', state: 'CLOSED', totalCalls: 100, ... },
//   { serviceName: 'redis', state: 'OPEN', openedAt: '2026-02-17T...', ... }
// ]

// Check if any circuits are open
if (manager.hasOpenCircuits()) {
  console.warn('Some services are experiencing issues');
}
```

### Integration with Operations

```javascript
// In DB2Operations or similar
import { CircuitBreakerManager } from '@rescor/core-utils';

const breakerManager = new CircuitBreakerManager();

class DB2Operations {
  async query(sql, params) {
    return await breakerManager.execute('database', async () => {
      return await this._executeQuery(sql, params);
    });
  }
}
```

### Monitoring Circuit Breakers

```javascript
// Health endpoint showing circuit breaker status
app.get('/health/circuits', (req, res) => {
  const stats = breakerManager.getAllStats();

  const anyOpen = stats.some(s => s.state === 'OPEN');

  res.status(anyOpen ? 503 : 200).json({
    status: anyOpen ? 'DEGRADED' : 'UP',
    circuits: stats
  });
});
```

---

## Health Check

### Standardized Health Checks

The health check utilities provide consistent interfaces for monitoring:

#### TCP Port Check

```javascript
import { checkTcpPort } from '@rescor/core-utils';

const health = await checkTcpPort({
  host: 'localhost',
  port: 9999,
  timeout: 3000
});

console.log(health);
// {
//   healthy: true,
//   status: 'UP',
//   message: 'Port 9999 is reachable',
//   latency: 45,
//   data: { host: 'localhost', port: 9999, reachable: true }
// }
```

#### HTTP Endpoint Check

```javascript
import { checkHttpEndpoint } from '@rescor/core-utils';

const health = await checkHttpEndpoint({
  url: 'http://localhost:3000/health',
  timeout: 5000,
  expectedStatus: 200,
  validator: (body) => body.status === 'OK' // Optional
});

console.log(health);
// {
//   healthy: true,
//   status: 'UP',
//   message: 'Endpoint is healthy',
//   latency: 123,
//   data: { url: '...', status: 200 }
// }
```

#### Database Check

```javascript
import { checkDatabase } from '@rescor/core-utils';

const health = await checkDatabase({
  query: () => db.query('SELECT 1 FROM SYSIBM.SYSDUMMY1'),
  timeout: 3000,
  testQuery: 'DB2 test query'
});

console.log(health);
// {
//   healthy: true,
//   status: 'UP',
//   message: 'Database is connected',
//   latency: 67,
//   data: { query: 'DB2 test query', connected: true }
// }
```

#### Memory Check

```javascript
import { checkMemory } from '@rescor/core-utils';

const health = checkMemory({ thresholdPercent: 90 });

console.log(health);
// {
//   healthy: true,
//   status: 'UP',
//   message: 'Memory usage is normal',
//   latency: 0,
//   data: {
//     heapUsed: 45678901,
//     heapTotal: 100000000,
//     percentUsed: '45.68',
//     external: 1234567,
//     rss: 67890123
//   }
// }
```

#### Disk Check

```javascript
import { checkDisk } from '@rescor/core-utils';

const health = await checkDisk({
  path: '/var/log',
  thresholdPercent: 90
});

console.log(health);
// {
//   healthy: true,
//   status: 'UP',
//   message: 'Disk space is sufficient',
//   latency: 0,
//   data: { path: '/var/log', percentUsed: 45, threshold: 90 }
// }
```

### Health Aggregator

Combine multiple health checks:

```javascript
import { HealthAggregator } from '@rescor/core-utils';

const aggregator = new HealthAggregator();

// Add checks
aggregator.addCheck('database', () =>
  checkDatabase({
    query: () => db.query('SELECT 1'),
    timeout: 3000
  })
);

aggregator.addCheck('redis', () =>
  checkTcpPort({ host: 'localhost', port: 6379 })
);

aggregator.addCheck('memory', () =>
  Promise.resolve(checkMemory({ thresholdPercent: 90 }))
);

// Run all checks (in parallel by default)
const health = await aggregator.check();

console.log(health);
// {
//   status: 'UP',
//   timestamp: '2026-02-17T12:34:56.789Z',
//   healthy: true,
//   checks: {
//     database: { healthy: true, status: 'UP', latency: 67, ... },
//     redis: { healthy: true, status: 'UP', latency: 23, ... },
//     memory: { healthy: true, status: 'UP', latency: 0, ... }
//   }
// }
```

### HTTP Health Endpoint

```javascript
import express from 'express';
import { HealthAggregator } from '@rescor/core-utils';

const app = express();
const health = new HealthAggregator();

// Configure health checks
health.addCheck('database', checkDatabaseHealth);
health.addCheck('cache', checkCacheHealth);

// Health endpoint
app.get('/health', async (req, res) => {
  const { statusCode, body } = await health.toHttpResponse();
  res.status(statusCode).json(body);
});

// Response format:
// {
//   status: 'UP',           // UP, DEGRADED, or DOWN
//   timestamp: '2026-02-17T12:34:56.789Z',
//   healthy: true,
//   checks: {
//     database: { ... },
//     cache: { ... }
//   }
// }
```

---

## Complete Example: Resilient Service

```javascript
import {
  CircuitBreakerManager,
  HealthAggregator,
  checkDatabase,
  checkHttpEndpoint
} from '@rescor/core-utils';

class ResilientService {
  constructor() {
    // Circuit breakers for all external dependencies
    this.breakers = new CircuitBreakerManager({
      failureThreshold: 5,
      windowMs: 60000,
      resetTimeoutMs: 30000
    });

    // Health checks
    this.health = new HealthAggregator();
    this.health.addCheck('database', () => this.checkDatabaseHealth());
    this.health.addCheck('api', () => this.checkApiHealth());
    this.health.addCheck('circuits', () => this.checkCircuits());
  }

  async query(sql, params) {
    try {
      return await this.breakers.execute('database', async () => {
        return await this.db.query(sql, params);
      });
    } catch (err) {
      if (err.name === 'CircuitBreakerOpenError') {
        // Return cached data or throw service unavailable
        const cached = await this.cache.get(sql);
        if (cached) return cached;
        throw new Error('Service temporarily unavailable');
      }
      throw err;
    }
  }

  async callExternalApi(url) {
    try {
      return await this.breakers.execute('external-api', async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      });
    } catch (err) {
      if (err.name === 'CircuitBreakerOpenError') {
        // Degrade gracefully
        return this.getDefaultApiResponse();
      }
      throw err;
    }
  }

  async checkDatabaseHealth() {
    return checkDatabase({
      query: () => this.db.query('SELECT 1'),
      timeout: 3000
    });
  }

  async checkApiHealth() {
    return checkHttpEndpoint({
      url: 'http://api.example.com/health',
      timeout: 5000
    });
  }

  checkCircuits() {
    const anyOpen = this.breakers.hasOpenCircuits();
    return {
      healthy: !anyOpen,
      status: anyOpen ? 'DEGRADED' : 'UP',
      message: anyOpen ? 'Some circuits are open' : 'All circuits closed',
      latency: 0,
      data: { circuits: this.breakers.getAllStats() }
    };
  }

  async getHealth() {
    return await this.health.check();
  }
}

// Usage
const service = new ResilientService();

// Queries are protected by circuit breakers
const users = await service.query('SELECT * FROM users');

// Health checks show overall status
const health = await service.getHealth();
console.log(health.status); // UP, DEGRADED, or DOWN
```

---

## Best Practices

### Circuit Breaker

1. **Tune thresholds for your SLAs**
   - High-volume services: Higher thresholds (10-20 failures)
   - Low-volume services: Lower thresholds (3-5 failures)

2. **Set appropriate timeouts**
   - Fast services (< 100ms): 10-20s reset timeout
   - Slow services (> 1s): 30-60s reset timeout

3. **Always provide fallbacks**
   - Cached data
   - Default responses
   - Degraded functionality

4. **Monitor circuit state**
   - Alert when circuits open
   - Track failure rates
   - Monitor recovery times

### Health Checks

1. **Keep checks lightweight**
   - Simple queries only (SELECT 1)
   - No heavy computation
   - Fast timeouts (< 5s)

2. **Check dependencies**
   - Database connections
   - External APIs
   - Caches and queues

3. **Include system metrics**
   - Memory usage
   - Disk space
   - CPU load

4. **Use appropriate status codes**
   - 200 OK: All healthy
   - 503 Service Unavailable: Degraded or down
   - Include detailed breakdown in response body

---

## Testing

### Circuit Breaker Tests

```javascript
import { CircuitBreaker } from '@rescor/core-utils';

describe('CircuitBreaker', () => {
  it('should open after threshold failures', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      windowMs: 60000
    });

    // Cause failures
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('should reject when open', async () => {
    const breaker = new CircuitBreaker('test');
    breaker.open();

    await expect(
      breaker.execute(() => Promise.resolve('success'))
    ).rejects.toThrow('Circuit breaker OPEN');
  });
});
```

### Health Check Tests

```javascript
import { HealthAggregator, checkMemory } from '@rescor/core-utils';

describe('HealthAggregator', () => {
  it('should aggregate multiple checks', async () => {
    const aggregator = new HealthAggregator();

    aggregator.addCheck('test1', () =>
      Promise.resolve({ healthy: true, status: 'UP', latency: 0 })
    );

    aggregator.addCheck('test2', () =>
      Promise.resolve({ healthy: true, status: 'UP', latency: 0 })
    );

    const result = await aggregator.check();
    expect(result.status).toBe('UP');
    expect(result.checks).toHaveProperty('test1');
    expect(result.checks).toHaveProperty('test2');
  });
});
```

---

## Migration Guide

### From Manual Retry to Circuit Breaker

**Before**:
```javascript
async function queryWithRetry(sql) {
  let attempts = 0;
  while (attempts < 3) {
    try {
      return await db.query(sql);
    } catch (err) {
      attempts++;
      if (attempts >= 3) throw err;
      await sleep(1000);
    }
  }
}
```

**After**:
```javascript
import { CircuitBreakerManager } from '@rescor/core-utils';

const breakers = new CircuitBreakerManager();

async function queryWithCircuitBreaker(sql) {
  return await breakers.execute('database', () => db.query(sql));
}
```

### From Custom Health to Standard Health

**Before**:
```javascript
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(500).json({ status: 'error' });
  }
});
```

**After**:
```javascript
import { HealthAggregator, checkDatabase } from '@rescor/core-utils';

const health = new HealthAggregator();
health.addCheck('database', () =>
  checkDatabase({ query: () => db.query('SELECT 1') })
);

app.get('/health', async (req, res) => {
  const { statusCode, body } = await health.toHttpResponse();
  res.status(statusCode).json(body);
});
```

---

## Performance Impact

- **Circuit Breaker**: < 1ms overhead per call
- **Health Checks**: Run on-demand, not in request path
- **Memory**: ~1KB per circuit breaker instance

---

## See Also

- [VitalSigns Documentation](./VITALSIGNS.md)
- [Error Handling](./ERRORS.md)
- [Recorder](./RECORDER.md)
