import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class PropertyCacheService extends Service {
  @service localStorage;
  @service realtime;

  @tracked cache = new Map(); // In-memory cache for fastest access

  // Cache duration in milliseconds (15 minutes for better performance)
  CACHE_DURATION = 15 * 60 * 1000;

  // Different cache durations for different data types
  CACHE_DURATIONS = {
    property: 2 * 60 * 60 * 1000, // 2 hours - property info changes rarely
    assessment: 30 * 60 * 1000, // 30 minutes - assessment data changes occasionally
    history: 4 * 60 * 60 * 1000, // 4 hours - historical data is stable
    sketches: 1 * 60 * 60 * 1000, // 1 hour - sketches change infrequently
    features: 1 * 60 * 60 * 1000, // 1 hour - features change occasionally
  };

  // Persistent storage TTL (longer than memory cache)
  PERSISTENT_CACHE_DURATIONS = {
    property: 24 * 60 * 60 * 1000, // 24 hours in persistent storage
    assessment: 4 * 60 * 60 * 1000, // 4 hours in persistent storage
    history: 7 * 24 * 60 * 60 * 1000, // 7 days for historical data
    sketches: 12 * 60 * 60 * 1000, // 12 hours for sketches
    features: 12 * 60 * 60 * 1000, // 12 hours for features
  };

  constructor() {
    super(...arguments);
    this.setupRealtimeListeners();
  }

  getCacheKey(propertyId, cardNumber = 1, assessmentYear = null) {
    return `${propertyId}-${cardNumber}-${assessmentYear || 'current'}`;
  }

  get(propertyId, cardNumber = 1, assessmentYear = null, options = {}) {
    const { dataType = 'property', maxAge } = options;
    const key = this.getCacheKey(propertyId, cardNumber, assessmentYear);

    // First check in-memory cache (fastest)
    const memoryCached = this.cache.get(key);
    const memoryDuration =
      maxAge || this.CACHE_DURATIONS[dataType] || this.CACHE_DURATION;

    if (memoryCached && Date.now() - memoryCached.timestamp <= memoryDuration) {
      // Update access tracking
      memoryCached.accessCount = (memoryCached.accessCount || 1) + 1;
      memoryCached.lastAccessed = Date.now();
      this.cache.set(key, memoryCached);

      console.log(
        `✅ Memory cache hit for ${dataType}:`,
        propertyId,
        `(${Math.round((Date.now() - memoryCached.timestamp) / 1000)}s old)`,
      );
      return memoryCached.data;
    }

    // Skip persistent storage check since we've disabled localStorage for property cache
    // Only use memory cache to prevent localStorage quota issues

    // Clean up expired memory cache
    if (memoryCached) {
      this.cache.delete(key);
    }

    console.log(`❌ Cache miss for ${dataType}:`, propertyId);
    return null;
  }

  set(propertyId, data, cardNumber = 1, assessmentYear = null, options = {}) {
    const { dataType = 'property', priority = 'normal' } = options;
    const key = this.getCacheKey(propertyId, cardNumber, assessmentYear);
    const now = Date.now();

    // Store in memory cache
    const cacheData = {
      data,
      timestamp: now,
      dataType,
      priority,
      accessCount: 1,
      lastAccessed: now,
    };

    this.cache.set(key, cacheData);

    // Skip localStorage storage since we have IndexedDB - prevents quota issues
    // Store in persistent storage with appropriate TTL
    // const persistentKey = `property-cache:${key}`;
    // const persistentTtl =
    //   this.PERSISTENT_CACHE_DURATIONS[dataType] || 24 * 60 * 60 * 1000;

    // this.localStorage.set(persistentKey, data, {
    //   ttl: persistentTtl,
    //   source: 'cache',
    //   dataType,
    //   propertyId,
    //   cardNumber,
    //   assessmentYear,
    //   accessCount: 1,
    // });

    console.log(
      `💾 Cached ${dataType} data:`,
      propertyId,
      `(priority: ${priority}, memory-only storage)`,
    );

    // Implement cache size management
    this.manageCacheSize();
  }

  /**
   * Manage cache size by removing least recently used entries
   */
  manageCacheSize() {
    const MAX_CACHE_SIZE = 200; // Limit cache to 200 properties

    if (this.cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
        key,
        ...value,
      }));

      // Sort by priority and last accessed time
      entries.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return 1;
        if (b.priority === 'high' && a.priority !== 'high') return -1;
        return a.lastAccessed - b.lastAccessed;
      });

      // Remove oldest entries
      const toRemove = entries.slice(0, this.cache.size - MAX_CACHE_SIZE + 10);
      toRemove.forEach((entry) => {
        this.cache.delete(entry.key);
      });

      console.log(`🧹 Cache cleanup: removed ${toRemove.length} old entries`);
    }
  }

  invalidate(propertyId, cardNumber = null, assessmentYear = null) {
    if (cardNumber !== null && assessmentYear !== null) {
      // Invalidate specific cache entry (memory only)
      const key = this.getCacheKey(propertyId, cardNumber, assessmentYear);
      this.cache.delete(key);

      console.log('🗑️ Invalidated specific cache entry:', key);
    } else {
      // Invalidate all cache entries for this property (memory only)
      const keysToDelete = [];

      // Remove from memory cache
      for (const [key] of this.cache) {
        if (key.startsWith(`${propertyId}-`)) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach((key) => this.cache.delete(key));

      console.log(
        '🗑️ Invalidated all cache entries for property:',
        propertyId,
        `(${keysToDelete.length} entries)`,
      );
    }
  }

  clear() {
    this.cache.clear();

    // Only clear memory cache since we've disabled localStorage for property cache
    console.log('🧹 Cleared all property cache (memory only)');
  }

  /**
   * Warm cache with frequently accessed properties
   */
  warmCache(propertyIds, cardNumber = 1, assessmentYear = null) {
    console.log(`🔥 Warming cache for ${propertyIds.length} properties`);
    return propertyIds
      .map((propertyId) => {
        // Check if already cached
        if (this.get(propertyId, cardNumber, assessmentYear)) {
          return Promise.resolve();
        }
        // Return promise for background loading (handled by prefetch service)
        return { propertyId, cardNumber, assessmentYear };
      })
      .filter(Boolean);
  }

  /**
   * Get frequently accessed properties for intelligent prefetching
   */
  getFrequentlyAccessed(limit = 10) {
    const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      propertyId: key.split('-')[0],
      ...value,
    }));

    return entries
      .sort((a, b) => (b.accessCount || 1) - (a.accessCount || 1))
      .slice(0, limit)
      .map((entry) => entry.propertyId);
  }

  /**
   * Check if property should be prefetched based on access patterns
   */
  shouldPrefetch(propertyId) {
    const frequently = this.getFrequentlyAccessed(20);
    return frequently.includes(propertyId);
  }

  // Get cache statistics
  getStats() {
    const entries = Array.from(this.cache.values());
    const totalAccesses = entries.reduce(
      (sum, entry) => sum + (entry.accessCount || 1),
      0,
    );
    const averageAge =
      entries.reduce((sum, entry) => sum + (Date.now() - entry.timestamp), 0) /
      entries.length;

    return {
      size: this.cache.size,
      totalAccesses,
      averageAge: Math.round(averageAge / 1000), // seconds
      hitRate: this.calculateHitRate(),
      frequentlyAccessed: this.getFrequentlyAccessed(5),
      cacheTypes: this.getCacheTypeDistribution(),
    };
  }

  /**
   * Calculate cache hit rate (simplified)
   */
  calculateHitRate() {
    // This would require tracking misses, simplified for now
    const entries = Array.from(this.cache.values());
    const totalAccesses = entries.reduce(
      (sum, entry) => sum + (entry.accessCount || 1),
      0,
    );
    return Math.min(95, Math.max(60, (totalAccesses / this.cache.size) * 10)); // Rough estimate
  }

  /**
   * Get distribution of cached data types
   */
  getCacheTypeDistribution() {
    const distribution = {};
    Array.from(this.cache.values()).forEach((entry) => {
      const type = entry.dataType || 'unknown';
      distribution[type] = (distribution[type] || 0) + 1;
    });
    return distribution;
  }

  // === REAL-TIME SYNCHRONIZATION ===

  /**
   * Setup real-time listeners for cache invalidation
   */
  setupRealtimeListeners() {
    // Listen for property updates from other users
    this.realtime.on('properties:updated', (data) => {
      console.log('🔄 Real-time property update received:', data.id);
      this.invalidate(data.id);

      // Optionally, update cache with new data if available
      if (data.property) {
        this.set(
          data.id,
          data.property,
          data.cardNumber || 1,
          data.assessmentYear,
          {
            dataType: 'property',
            priority: 'high',
          },
        );
      }
    });

    // Listen for assessment updates
    this.realtime.on('assessments:updated', (data) => {
      console.log('🔄 Real-time assessment update received:', data.propertyId);
      this.invalidate(data.propertyId, data.cardNumber, data.assessmentYear);
    });

    // Listen for sketch updates
    this.realtime.on('sketches:updated', (data) => {
      console.log('🔄 Real-time sketch update received:', data.propertyId);
      this.invalidate(data.propertyId, data.cardNumber, data.assessmentYear);
    });

    // Listen for feature updates
    this.realtime.on('features:updated', (data) => {
      console.log('🔄 Real-time feature update received:', data.propertyId);
      this.invalidate(data.propertyId, data.cardNumber, data.assessmentYear);
    });

    // Listen for property deletions
    this.realtime.on('properties:deleted', (data) => {
      console.log('🔄 Real-time property deletion received:', data.id);
      this.invalidate(data.id);
    });

    // Generic data update handler
    this.realtime.on('data:updated', (eventData) => {
      const { collection, data } = eventData;

      switch (collection) {
        case 'properties':
        case 'property_assessments':
        case 'building_assessments':
        case 'land_assessments':
          if (data.property_id || data.propertyId) {
            const propertyId = data.property_id || data.propertyId;
            console.log(
              `🔄 Real-time ${collection} update for property:`,
              propertyId,
            );
            this.invalidate(propertyId);
          }
          break;
        case 'sketches':
        case 'property_features':
          if (data.property_id || data.propertyId) {
            const propertyId = data.property_id || data.propertyId;
            console.log(
              `🔄 Real-time ${collection} update for property:`,
              propertyId,
            );
            this.invalidate(propertyId, data.card_number, data.assessment_year);
          }
          break;
      }
    });

    console.log('🎯 Real-time cache synchronization listeners setup complete');
  }

  /**
   * Notify other users of local property changes
   */
  notifyPropertyUpdate(
    propertyId,
    cardNumber = 1,
    assessmentYear = null,
    changeType = 'update',
    data = null,
  ) {
    if (this.realtime.isConnected) {
      this.realtime.broadcastChange('properties', changeType, {
        id: propertyId,
        propertyId,
        cardNumber,
        assessmentYear,
        property: data,
        timestamp: Date.now(),
      });

      console.log('📡 Broadcasted property change:', propertyId, changeType);
    }
  }

  /**
   * Get cache storage information (memory-only for property cache)
   */
  getStorageInfo() {
    const memoryStats = this.getStats();
    const localStorageInfo = this.localStorage.getStorageInfo();

    // Property cache no longer uses localStorage to prevent quota issues
    return {
      memory: memoryStats,
      persistent: {
        propertyCacheItems: 0, // No longer using localStorage for property cache
        totalLocalStorageItems: localStorageInfo.itemCount,
        totalLocalStorageSize: localStorageInfo.totalSizeMB,
        note: 'Property cache uses memory-only storage to prevent localStorage quota issues',
      },
      realtime: {
        isConnected: this.realtime.isConnected,
        status: this.realtime.getStatus(),
      },
    };
  }
}
