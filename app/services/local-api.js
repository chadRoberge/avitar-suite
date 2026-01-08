import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

/**
 * LocalAPI Service
 *
 * This service provides a local-first API interface with IndexedDB caching.
 * It delegates all operations to the HybridAPI service which handles
 * the actual caching strategy and offline support.
 *
 * @deprecated This service is a thin wrapper around HybridAPI for backward compatibility.
 * New code should use HybridAPI directly.
 */
export default class LocalApiService extends Service {
  @service api;
  @service('hybrid-api') hybridApi;
  @service indexedDb;

  @tracked isOnline = navigator.onLine;

  constructor() {
    super(...arguments);

    // Listen for online/offline events
    window.addEventListener('online', () => (this.isOnline = true));
    window.addEventListener('offline', () => (this.isOnline = false));
  }

  /**
   * Provides a localStorage-like interface for cache operations
   * This is for backward compatibility with code that uses localApi.localStorage
   * @deprecated Use indexedDb methods directly
   */
  get localStorage() {
    const self = this;
    return {
      set(key, value, options = {}) {
        // Delegate to indexedDb for caching
        // This is a simplified proxy that stores in metadata
        console.log(
          `🔄 [LocalAPI] localStorage.set deprecated - using indexedDb for: ${key}`,
        );
        self.indexedDb.setMetadata(key, {
          data: value,
          ...options,
          timestamp: Date.now(),
        });
      },

      get(key, options = {}) {
        console.log(
          `🔄 [LocalAPI] localStorage.get deprecated - using indexedDb for: ${key}`,
        );
        return self.indexedDb.getMetadata(key);
      },

      remove(key) {
        console.log(
          `🔄 [LocalAPI] localStorage.remove deprecated - using indexedDb for: ${key}`,
        );
        self.indexedDb.setMetadata(key, null);
      },

      getCollection(collection, options = {}) {
        console.log(
          `🔄 [LocalAPI] localStorage.getCollection deprecated: ${collection}`,
        );
        return self.indexedDb.getAll(collection);
      },

      setCollection(collection, data, options = {}) {
        console.log(
          `🔄 [LocalAPI] localStorage.setCollection deprecated: ${collection}`,
        );
        return self.indexedDb.bulkPut(collection, data);
      },

      clearCollection(collection) {
        console.log(
          `🔄 [LocalAPI] localStorage.clearCollection deprecated: ${collection}`,
        );
        return self.indexedDb.clearCollection(collection);
      },

      clearAll() {
        console.log(`🔄 [LocalAPI] localStorage.clearAll deprecated`);
        return self.hybridApi.clearCache();
      },
    };
  }

  // === API METHODS - All delegate to HybridAPI ===

  /**
   * Get data with local-first approach
   * Delegates to HybridAPI
   */
  async get(endpoint, options = {}) {
    return this.hybridApi.get(endpoint, options);
  }

  /**
   * Create data with optimistic updates
   * Delegates to HybridAPI
   */
  async post(endpoint, data, options = {}) {
    return this.hybridApi.post(endpoint, data, options);
  }

  /**
   * Update data with optimistic updates (PATCH)
   * Delegates to HybridAPI
   */
  async patch(endpoint, data, options = {}) {
    return this.hybridApi.patch(endpoint, data, options);
  }

  /**
   * Update data with optimistic updates (PUT)
   * Delegates to HybridAPI
   */
  async put(endpoint, data, options = {}) {
    return this.hybridApi.put(endpoint, data, options);
  }

  /**
   * Delete data with optimistic updates
   * Delegates to HybridAPI
   */
  async delete(endpoint, options = {}) {
    return this.hybridApi.delete(endpoint, options);
  }

  // === SYNC METHODS ===

  /**
   * Force sync a specific collection
   */
  @action
  async syncCollection(collection) {
    return this.hybridApi.syncCollection?.(collection);
  }

  /**
   * Get sync status for debugging
   */
  getSyncStatus() {
    return this.hybridApi.getSyncStatus?.() || { status: 'unknown' };
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    return this.hybridApi.clearCache();
  }

  // === DIRECT API PASSTHROUGH ===

  /**
   * Direct API call without caching (for special cases)
   */
  async directGet(endpoint, options = {}) {
    return this.api.get(endpoint, options);
  }

  async directPost(endpoint, data, options = {}) {
    return this.api.post(endpoint, data);
  }

  async directPatch(endpoint, data, options = {}) {
    return this.api.patch(endpoint, data);
  }

  async directPut(endpoint, data, options = {}) {
    return this.api.put(endpoint, data);
  }

  async directDelete(endpoint, options = {}) {
    return this.api.delete(endpoint);
  }

  // === UTILITY METHODS (kept for backward compatibility) ===

  /**
   * Determine collection name from endpoint
   */
  getCollectionFromEndpoint(endpoint) {
    return this.hybridApi.getCollectionFromEndpoint?.(endpoint);
  }
}
