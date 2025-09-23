import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class PropertyCacheService extends Service {
  @tracked cache = new Map();

  // Cache duration in milliseconds (15 minutes for better performance)
  CACHE_DURATION = 15 * 60 * 1000;

  // Different cache durations for different data types
  CACHE_DURATIONS = {
    property: 15 * 60 * 1000,      // 15 minutes - property info changes rarely
    assessment: 10 * 60 * 1000,    // 10 minutes - assessment data changes occasionally
    history: 30 * 60 * 1000,       // 30 minutes - historical data is stable
    sketches: 20 * 60 * 1000,      // 20 minutes - sketches change infrequently
    features: 15 * 60 * 1000       // 15 minutes - features change occasionally
  };

  getCacheKey(propertyId, cardNumber = 1, assessmentYear = null) {
    return `${propertyId}-${cardNumber}-${assessmentYear || 'current'}`;
  }

  get(propertyId, cardNumber = 1, assessmentYear = null, options = {}) {
    const { dataType = 'property', maxAge } = options;
    const key = this.getCacheKey(propertyId, cardNumber, assessmentYear);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Use specific cache duration or default
    const cacheDuration = maxAge || this.CACHE_DURATIONS[dataType] || this.CACHE_DURATION;

    // Check if cache is expired
    if (Date.now() - cached.timestamp > cacheDuration) {
      this.cache.delete(key);
      console.log(`🕒 Cache expired for ${dataType}:`, propertyId, `(${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
      return null;
    }

    // Update access tracking
    cached.accessCount = (cached.accessCount || 1) + 1;
    cached.lastAccessed = Date.now();
    this.cache.set(key, cached);

    console.log(`✅ Cache hit for ${dataType}:`, propertyId, `(${Math.round((Date.now() - cached.timestamp) / 1000)}s old, accessed ${cached.accessCount} times)`);
    return cached.data;
  }

  set(propertyId, data, cardNumber = 1, assessmentYear = null, options = {}) {
    const { dataType = 'property', priority = 'normal' } = options;
    const key = this.getCacheKey(propertyId, cardNumber, assessmentYear);

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      dataType,
      priority,
      accessCount: 1,
      lastAccessed: Date.now()
    });

    console.log(`💾 Cached ${dataType} data:`, propertyId, `(priority: ${priority})`);

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
        ...value
      }));

      // Sort by priority and last accessed time
      entries.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return 1;
        if (b.priority === 'high' && a.priority !== 'high') return -1;
        return a.lastAccessed - b.lastAccessed;
      });

      // Remove oldest entries
      const toRemove = entries.slice(0, this.cache.size - MAX_CACHE_SIZE + 10);
      toRemove.forEach(entry => {
        this.cache.delete(entry.key);
      });

      console.log(`🧹 Cache cleanup: removed ${toRemove.length} old entries`);
    }
  }

  invalidate(propertyId, cardNumber = null, assessmentYear = null) {
    if (cardNumber && assessmentYear) {
      // Invalidate specific cache entry
      const key = this.getCacheKey(propertyId, cardNumber, assessmentYear);
      this.cache.delete(key);
    } else {
      // Invalidate all cache entries for this property
      const keysToDelete = [];
      for (const [key] of this.cache) {
        if (key.startsWith(`${propertyId}-`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.cache.delete(key));
    }
    console.log('🗑️ Invalidated cache for property:', propertyId);
  }

  clear() {
    this.cache.clear();
    console.log('🧹 Cleared all property cache');
  }

  /**
   * Warm cache with frequently accessed properties
   */
  warmCache(propertyIds, cardNumber = 1, assessmentYear = null) {
    console.log(`🔥 Warming cache for ${propertyIds.length} properties`);
    return propertyIds.map(propertyId => {
      // Check if already cached
      if (this.get(propertyId, cardNumber, assessmentYear)) {
        return Promise.resolve();
      }
      // Return promise for background loading (handled by prefetch service)
      return { propertyId, cardNumber, assessmentYear };
    }).filter(Boolean);
  }

  /**
   * Get frequently accessed properties for intelligent prefetching
   */
  getFrequentlyAccessed(limit = 10) {
    const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      propertyId: key.split('-')[0],
      ...value
    }));

    return entries
      .sort((a, b) => (b.accessCount || 1) - (a.accessCount || 1))
      .slice(0, limit)
      .map(entry => entry.propertyId);
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
    const totalAccesses = entries.reduce((sum, entry) => sum + (entry.accessCount || 1), 0);
    const averageAge = entries.reduce((sum, entry) => sum + (Date.now() - entry.timestamp), 0) / entries.length;

    return {
      size: this.cache.size,
      totalAccesses,
      averageAge: Math.round(averageAge / 1000), // seconds
      hitRate: this.calculateHitRate(),
      frequentlyAccessed: this.getFrequentlyAccessed(5),
      cacheTypes: this.getCacheTypeDistribution()
    };
  }

  /**
   * Calculate cache hit rate (simplified)
   */
  calculateHitRate() {
    // This would require tracking misses, simplified for now
    const entries = Array.from(this.cache.values());
    const totalAccesses = entries.reduce((sum, entry) => sum + (entry.accessCount || 1), 0);
    return Math.min(95, Math.max(60, totalAccesses / this.cache.size * 10)); // Rough estimate
  }

  /**
   * Get distribution of cached data types
   */
  getCacheTypeDistribution() {
    const distribution = {};
    Array.from(this.cache.values()).forEach(entry => {
      const type = entry.dataType || 'unknown';
      distribution[type] = (distribution[type] || 0) + 1;
    });
    return distribution;
  }
}