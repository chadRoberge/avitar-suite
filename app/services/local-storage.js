import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class LocalStorageService extends Service {
  @tracked isOnline = navigator.onLine;

  constructor() {
    super(...arguments);

    // Listen for online/offline status
    window.addEventListener('online', () => (this.isOnline = true));
    window.addEventListener('offline', () => (this.isOnline = false));
  }

  // === CORE STORAGE METHODS ===

  /**
   * Store data in localStorage with metadata
   * @param {string} key - Storage key
   * @param {*} data - Data to store
   * @param {Object} options - Storage options
   */
  set(key, data, options = {}) {
    const now = Date.now();
    const storageData = {
      data,
      timestamp: now,
      lastModified: options.lastModified || now,
      version: options.version || 1,
      source: options.source || 'local', // 'local', 'server', 'sync'
      ttl: options.ttl ? now + options.ttl : null,
      municipalityId: options.municipalityId || null,
      userId: options.userId || null,
      dirty: options.dirty || false, // Track if needs server sync
    };

    try {
      localStorage.setItem(
        this.getStorageKey(key),
        JSON.stringify(storageData),
      );
      return true;
    } catch (error) {
      console.error('LocalStorage write error:', error);
      // Handle quota exceeded
      if (error.name === 'QuotaExceededError') {
        this.cleanup();
        try {
          localStorage.setItem(
            this.getStorageKey(key),
            JSON.stringify(storageData),
          );
          return true;
        } catch (retryError) {
          console.error('LocalStorage write failed after cleanup:', retryError);
          return false;
        }
      }
      return false;
    }
  }

  /**
   * Get data from localStorage with freshness check
   * @param {string} key - Storage key
   * @param {Object} options - Retrieval options
   * @returns {Object|null} - Retrieved data with metadata
   */
  get(key, options = {}) {
    try {
      const stored = localStorage.getItem(this.getStorageKey(key));
      if (!stored) return null;

      const storageData = JSON.parse(stored);
      const now = Date.now();

      // Check TTL expiration
      if (storageData.ttl && now > storageData.ttl) {
        this.remove(key);
        return null;
      }

      // Check freshness if maxAge specified
      if (options.maxAge && now - storageData.timestamp > options.maxAge) {
        return null;
      }

      return storageData;
    } catch (error) {
      console.error('LocalStorage read error:', error);
      return null;
    }
  }

  /**
   * Remove data from localStorage
   * @param {string} key - Storage key
   */
  remove(key) {
    try {
      localStorage.removeItem(this.getStorageKey(key));
      return true;
    } catch (error) {
      console.error('LocalStorage remove error:', error);
      return false;
    }
  }

  /**
   * Check if data exists and is fresh
   * @param {string} key - Storage key
   * @param {Object} options - Check options
   * @returns {boolean}
   */
  has(key, options = {}) {
    const data = this.get(key, options);
    return data !== null;
  }

  // === COLLECTION METHODS ===

  /**
   * Store a collection of items with indexing
   * @param {string} collectionName - Collection name (e.g., 'properties', 'sketches')
   * @param {Array} items - Array of items to store
   * @param {Object} options - Storage options
   */
  setCollection(collectionName, items, options = {}) {
    // Store the collection
    const collectionKey = `collection:${collectionName}`;
    const success = this.set(collectionKey, items, options);

    if (success) {
      // Create indexes for efficient querying
      this.createIndexes(collectionName, items);
    }

    return success;
  }

  /**
   * Get a collection from storage
   * @param {string} collectionName - Collection name
   * @param {Object} options - Retrieval options
   * @returns {Array|null}
   */
  getCollection(collectionName, options = {}) {
    const collectionKey = `collection:${collectionName}`;
    const stored = this.get(collectionKey, options);
    return stored ? stored.data : null;
  }

  /**
   * Add item to a collection
   * @param {string} collectionName - Collection name
   * @param {Object} item - Item to add
   * @param {Object} options - Options
   */
  addToCollection(collectionName, item, options = {}) {
    const collection = this.getCollection(collectionName) || [];

    // Find existing item by ID
    const existingIndex = collection.findIndex(
      (existing) => existing.id === item.id,
    );

    if (existingIndex >= 0) {
      // Update existing item
      collection[existingIndex] = { ...collection[existingIndex], ...item };
    } else {
      // Add new item
      collection.push(item);
    }

    return this.setCollection(collectionName, collection, {
      ...options,
      dirty: true, // Mark as needing sync
    });
  }

  /**
   * Remove item from a collection
   * @param {string} collectionName - Collection name
   * @param {string} itemId - ID of item to remove
   * @param {Object} options - Options
   */
  removeFromCollection(collectionName, itemId, options = {}) {
    const collection = this.getCollection(collectionName) || [];
    const filteredCollection = collection.filter((item) => item.id !== itemId);

    return this.setCollection(collectionName, filteredCollection, {
      ...options,
      dirty: true,
    });
  }

  /**
   * Query a collection with filters
   * @param {string} collectionName - Collection name
   * @param {Object} query - Query filters
   * @returns {Array}
   */
  queryCollection(collectionName, query = {}) {
    const collection = this.getCollection(collectionName) || [];

    return collection.filter((item) => {
      return Object.entries(query).every(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          // Handle operators like { $in: [...], $gte: ..., etc }
          return this.applyQueryOperators(item[key], value);
        }
        return item[key] === value;
      });
    });
  }

  // === INDEX CREATION FOR FAST QUERIES ===

  createIndexes(collectionName, items) {
    // Create common indexes for fast lookups
    const indexes = {};

    items.forEach((item, index) => {
      // Index by ID
      if (item.id) {
        indexes[`id:${item.id}`] = index;
      }

      // Index by municipality_id if present
      if (item.municipality_id) {
        const municipalityKey = `municipality_id:${item.municipality_id}`;
        if (!indexes[municipalityKey]) indexes[municipalityKey] = [];
        indexes[municipalityKey].push(index);
      }

      // Index by property_id if present
      if (item.property_id) {
        const propertyKey = `property_id:${item.property_id}`;
        if (!indexes[propertyKey]) indexes[propertyKey] = [];
        indexes[propertyKey].push(index);
      }
    });

    this.set(`indexes:${collectionName}`, indexes);
  }

  // === SYNC TRACKING ===

  /**
   * Get all items that need syncing to server
   * @returns {Object} - Collections with dirty items
   */
  getDirtyItems() {
    const dirtyItems = {};
    const keys = this.getAllKeys();

    keys.forEach((key) => {
      if (key.startsWith('collection:')) {
        const stored = this.get(key.replace('avitar:', ''));
        if (stored && stored.dirty) {
          const collectionName = key.replace('avitar:collection:', '');
          dirtyItems[collectionName] = stored.data;
        }
      }
    });

    return dirtyItems;
  }

  /**
   * Mark collection as synced (clean)
   * @param {string} collectionName - Collection name
   */
  markAsSynced(collectionName) {
    const stored = this.get(`collection:${collectionName}`);
    if (stored) {
      stored.dirty = false;
      stored.source = 'server';
      this.set(`collection:${collectionName}`, stored.data, {
        ...stored,
        dirty: false,
        source: 'server',
      });
    }
  }

  // === UTILITY METHODS ===

  getStorageKey(key) {
    return `avitar:${key}`;
  }

  getAllKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('avitar:')) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * Clean up old/expired data
   */
  cleanup() {
    const keys = this.getAllKeys();
    const now = Date.now();
    let deletedCount = 0;

    keys.forEach((key) => {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const data = JSON.parse(stored);

          // Remove expired items
          if (data.ttl && now > data.ttl) {
            localStorage.removeItem(key);
            deletedCount++;
          }
          // Remove old items (older than 30 days) if storage is getting full
          else if (now - data.timestamp > 30 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem(key);
            deletedCount++;
          }
        }
      } catch (error) {
        // Remove corrupted data
        localStorage.removeItem(key);
        deletedCount++;
      }
    });

    console.log(`LocalStorage cleanup: removed ${deletedCount} items`);
  }

  /**
   * Get storage usage info
   * @returns {Object} - Storage usage statistics
   */
  getStorageInfo() {
    const keys = this.getAllKeys();
    let totalSize = 0;

    keys.forEach((key) => {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      } catch (error) {
        // Skip corrupted items
      }
    });

    return {
      itemCount: keys.length,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      isOnline: this.isOnline,
    };
  }

  /**
   * Apply query operators for filtering
   * @private
   */
  applyQueryOperators(itemValue, queryValue) {
    if (queryValue.$in) {
      return queryValue.$in.includes(itemValue);
    }
    if (queryValue.$gte !== undefined) {
      return itemValue >= queryValue.$gte;
    }
    if (queryValue.$lte !== undefined) {
      return itemValue <= queryValue.$lte;
    }
    if (queryValue.$ne !== undefined) {
      return itemValue !== queryValue.$ne;
    }
    return itemValue === queryValue;
  }

  /**
   * Clear all local storage (for debugging/reset)
   */
  clearAll() {
    const keys = this.getAllKeys();
    keys.forEach((key) => localStorage.removeItem(key));
    console.log('All local storage cleared');
  }
}
