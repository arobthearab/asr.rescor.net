/**
 * CascadingStore - Orchestrates multiple secret stores with fallback logic
 *
 * Typical configuration:
 * 1. MemoryStore (cache)
 * 2. InfisicalStore (primary)
 * 3. EnvironmentStore (fallback)
 *
 * Read strategy: Try each store in order, return first success, cache result
 * Write strategy: Write to primary store only (skip cache and read-only stores)
 */

import { SecureStore, SecureItem, SecureItems, SecureStoreError } from '../SecureStore.mjs';

export class CascadingStore extends SecureStore {
  static CODES = {
    ...SecureStore.CODES,
    NO_STORES: 10500,
    ALL_STORES_FAILED: 10501,
    PARTIAL_SUCCESS: 10502
  };

  constructor(options = {}) {
    super(options);

    this.stores = options.stores || [];
    this.cacheStore = options.cacheStore || null; // Optional cache layer
    this.primaryStore = options.primaryStore || null; // Primary for writes
    this.writeThrough = options.writeThrough ?? true; // Write to cache on read
    this._initialized = false;

    if (this.stores.length === 0) {
      throw new SecureStoreError(
        CascadingStore.CODES.NO_STORES,
        'CascadingStore requires at least one backing store'
      );
    }

    // Auto-detect primary store (first writable store)
    if (!this.primaryStore) {
      this.primaryStore = this.stores.find(store =>
        store.constructor.name !== 'EnvironmentStore' // EnvironmentStore is read-only
      );
    }
  }

  get isInitialized() {
    return this._initialized;
  }

  async _initialize() {
    // Initialize cache if provided
    if (this.cacheStore && !this.cacheStore.isInitialized) {
      await this.cacheStore.initialize();
    }

    // Initialize all backing stores
    const results = await Promise.allSettled(
      this.stores.map(store => store.isInitialized ? Promise.resolve() : store.initialize())
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length === this.stores.length) {
      this.log.emit(CascadingStore.CODES.ALL_STORES_FAILED, 'e',
        'All backing stores failed to initialize');
      throw new SecureStoreError(
        CascadingStore.CODES.ALL_STORES_FAILED,
        'All backing stores failed to initialize'
      );
    }

    if (failed.length > 0) {
      this.log.emit(CascadingStore.CODES.PARTIAL_SUCCESS, 'w',
        `${failed.length}/${this.stores.length} stores failed to initialize`);
    }

    this.log.emit(SecureStore.CODES.INITIALIZING, 'i',
      `Cascading store initialized with ${this.stores.length} backing stores`);

    return true;
  }

  async access() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this;
  }

  /**
   * Get credential with cascading fallback
   */
  async getCredential(domain, key) {
    return this.getConfiguration(domain, key);
  }

  /**
   * Get configuration with cascading fallback
   */
  async getConfiguration(domain, key) {
    await this.access();

    // Try cache first
    if (this.cacheStore) {
      const cachedValue = await this.cacheStore.getConfiguration(domain, key);
      if (cachedValue !== null) {
        this.log.emit(10600, 'd', `Cache hit for ${domain}.${key}`);
        return cachedValue;
      }
    }

    // Try each store in order
    for (const store of this.stores) {
      try {
        const value = await store.getConfiguration(domain, key);

        if (value !== null) {
          this.log.emit(10601, 'd',
            `Retrieved ${domain}.${key} from ${store.constructor.name}`);

          // Write-through to cache
          if (this.cacheStore && this.writeThrough) {
            await this.cacheStore.storeConfiguration(domain, key, value);
          }

          return value;
        }
      } catch (err) {
        this.log.emit(10602, 'w',
          `Failed to get ${domain}.${key} from ${store.constructor.name}: ${err.message}`);
        // Continue to next store
      }
    }

    this.log.emit(10603, 'd', `${domain}.${key} not found in any store`);
    return null;
  }

  /**
   * Store credential to primary store
   */
  async storeCredential(domain, key, secret) {
    return this.storeConfiguration(domain, key, secret);
  }

  /**
   * Store configuration to primary store
   */
  async storeConfiguration(domain, key, value) {
    await this.access();

    if (!this.primaryStore) {
      throw new SecureStoreError(
        SecureStore.CODES.STORE_ERROR,
        'No writable primary store configured'
      );
    }

    try {
      await this.primaryStore.storeConfiguration(domain, key, value);

      this.log.emit(10610, 'i',
        `Stored ${domain}.${key} to ${this.primaryStore.constructor.name}`);

      // Update cache
      if (this.cacheStore) {
        await this.cacheStore.storeConfiguration(domain, key, value);
      }

      return this;
    } catch (err) {
      this.log.emit(10611, 'e',
        `Failed to store ${domain}.${key}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Clear credential from primary store
   */
  async clearCredential(domain, key) {
    return this.clearConfiguration(domain, key);
  }

  /**
   * Clear configuration from primary store
   */
  async clearConfiguration(domain, key) {
    await this.access();

    if (!this.primaryStore) {
      throw new SecureStoreError(
        SecureStore.CODES.STORE_ERROR,
        'No writable primary store configured'
      );
    }

    try {
      await this.primaryStore.clearConfiguration(domain, key);

      this.log.emit(10620, 'i',
        `Cleared ${domain}.${key} from ${this.primaryStore.constructor.name}`);

      // Clear from cache
      if (this.cacheStore) {
        await this.cacheStore.clearConfiguration(domain, key);
      }

      return this;
    } catch (err) {
      this.log.emit(10621, 'e',
        `Failed to clear ${domain}.${key}: ${err.message}`);
      throw err;
    }
  }

  /**
   * List credentials from all stores (merged)
   */
  async listCredentials(domain = null) {
    return this.listConfiguration(domain);
  }

  /**
   * List configuration from all stores (merged, deduplicated)
   */
  async listConfiguration(domain = null) {
    await this.access();

    const allItems = new Map(); // domain:key -> SecureItem

    // Collect from all stores (in reverse order, so primary wins)
    for (const store of [...this.stores].reverse()) {
      try {
        const items = await store.listConfiguration(domain);

        for (const item of items.toArray()) {
          const itemKey = `${item.domain}:${item.key}`;
          if (!allItems.has(itemKey)) {
            allItems.set(itemKey, item);
          }
        }
      } catch (err) {
        this.log.emit(10630, 'w',
          `Failed to list from ${store.constructor.name}: ${err.message}`);
      }
    }

    this.log.emit(10631, 'd', `Listed ${allItems.size} total items from all stores`);
    return new SecureItems(Array.from(allItems.values()));
  }

  /**
   * Get information about configured stores
   */
  getStoreInfo() {
    return {
      stores: this.stores.map(s => ({
        name: s.constructor.name,
        initialized: s.isInitialized
      })),
      cacheStore: this.cacheStore ? {
        name: this.cacheStore.constructor.name,
        initialized: this.cacheStore.isInitialized
      } : null,
      primaryStore: this.primaryStore ? {
        name: this.primaryStore.constructor.name,
        initialized: this.primaryStore.isInitialized
      } : null,
      writeThrough: this.writeThrough
    };
  }

  /**
   * Convenience: Invalidate cache
   */
  async invalidateCache() {
    if (this.cacheStore && typeof this.cacheStore.clearAll === 'function') {
      await this.cacheStore.clearAll();
      this.log.emit(10640, 'i', 'Cache invalidated');
    }
  }

  /**
   * Convenience: Prune expired cache entries
   */
  async pruneCache() {
    if (this.cacheStore && typeof this.cacheStore.prune === 'function') {
      const pruned = await this.cacheStore.prune();
      this.log.emit(10641, 'd', `Pruned ${pruned} expired cache entries`);
      return pruned;
    }
    return 0;
  }

  // ====================================================================
  // Unified API Implementation (Phase 2)
  // ====================================================================

  /**
   * Get single item with ClassifiedDatum (cascading fallback)
   */
  async _getSingle(datum) {
    await this.access();

    // Try cache first
    if (this.cacheStore) {
      try {
        const cachedValue = await this.cacheStore._getSingle(datum);
        if (cachedValue !== null) {
          this.log.emit(10600, 'd', `Cache hit for ${datum.domain}.${datum.key}`);
          return cachedValue;
        }
      } catch (err) {
        // Cache errors are non-fatal, continue to backing stores
        this.log.emit(10602, 'w', `Cache read failed: ${err.message}`);
      }
    }

    // Try each store in order
    for (const store of this.stores) {
      try {
        const value = await store._getSingle(datum);

        if (value !== null) {
          this.log.emit(10601, 'd',
            `Retrieved ${datum.domain}.${datum.key} from ${store.constructor.name}`);

          // Write-through to cache
          if (this.cacheStore && this.writeThrough) {
            try {
              await this.cacheStore._storeSingle(datum.with(value));
            } catch (err) {
              this.log.emit(10602, 'w', `Cache write failed: ${err.message}`);
            }
          }

          return value;
        }
      } catch (err) {
        this.log.emit(10602, 'w',
          `Failed to get ${datum.domain}.${datum.key} from ${store.constructor.name}: ${err.message}`);
        // Continue to next store
      }
    }

    this.log.emit(10603, 'd', `${datum.domain}.${datum.key} not found in any store`);
    return null;
  }

  /**
   * Store single item with ClassifiedDatum (to primary store)
   */
  async _storeSingle(datum) {
    await this.access();

    if (!this.primaryStore) {
      throw new SecureStoreError(
        SecureStore.CODES.STORE_ERROR,
        'No writable primary store configured'
      );
    }

    try {
      await this.primaryStore._storeSingle(datum);

      this.log.emit(10610, 'i',
        `Stored ${datum.domain}.${datum.key} to ${this.primaryStore.constructor.name}`);

      // Update cache
      if (this.cacheStore) {
        try {
          await this.cacheStore._storeSingle(datum);
        } catch (err) {
          this.log.emit(10602, 'w', `Cache update failed: ${err.message}`);
        }
      }

      return this;
    } catch (err) {
      this.log.emit(10611, 'e',
        `Failed to store ${datum.domain}.${datum.key}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Clear single item with ClassifiedDatum (from primary store)
   */
  async _clearSingle(datum) {
    await this.access();

    if (!this.primaryStore) {
      throw new SecureStoreError(
        SecureStore.CODES.STORE_ERROR,
        'No writable primary store configured'
      );
    }

    try {
      await this.primaryStore._clearSingle(datum);

      this.log.emit(10620, 'i',
        `Cleared ${datum.domain}.${datum.key} from ${this.primaryStore.constructor.name}`);

      // Clear from cache
      if (this.cacheStore) {
        try {
          await this.cacheStore._clearSingle(datum);
        } catch (err) {
          this.log.emit(10602, 'w', `Cache clear failed: ${err.message}`);
        }
      }

      return this;
    } catch (err) {
      this.log.emit(10621, 'e',
        `Failed to clear ${datum.domain}.${datum.key}: ${err.message}`);
      throw err;
    }
  }
}
