import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class PropertyCacheService extends Service {
  @tracked cache = new Map();

  // Cache duration in milliseconds (5 minutes)
  CACHE_DURATION = 5 * 60 * 1000;

  getCacheKey(propertyId, cardNumber = 1, assessmentYear = null) {
    return `${propertyId}-${cardNumber}-${assessmentYear || 'current'}`;
  }

  get(propertyId, cardNumber = 1, assessmentYear = null) {
    const key = this.getCacheKey(propertyId, cardNumber, assessmentYear);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.cache.delete(key);
      return null;
    }

    console.log('✅ Cache hit for property:', propertyId);
    return cached.data;
  }

  set(propertyId, data, cardNumber = 1, assessmentYear = null) {
    const key = this.getCacheKey(propertyId, cardNumber, assessmentYear);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    console.log('💾 Cached property data:', propertyId);
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

  // Get cache statistics
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}