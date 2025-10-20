import Service from '@ember/service';
import { inject as service } from '@ember/service';

export default class PropertyPrefetchService extends Service {
  @service assessing;
  @service('property-cache') propertyCache;

  // Queue of properties to prefetch
  prefetchQueue = new Set();

  // Currently prefetching (to avoid duplicates)
  prefetching = new Set();

  // Prefetch property data in the background
  async prefetchProperty(propertyId, cardNumber = 1, assessmentYear = null) {
    const key = `${propertyId}-${cardNumber}-${assessmentYear || 'current'}`;

    // Skip if already cached
    if (this.propertyCache.get(propertyId, cardNumber, assessmentYear)) {
      return;
    }

    // Skip if already prefetching
    if (this.prefetching.has(key)) {
      return;
    }

    this.prefetching.add(key);
    console.log('🔄 Prefetching property data:', propertyId);

    try {
      // Fetch data in background (don't show loading indicators)
      await this.assessing.getPropertyFullData(
        propertyId,
        cardNumber,
        assessmentYear,
      );
      console.log('✅ Prefetched property data:', propertyId);
    } catch (error) {
      console.warn('⚠️ Failed to prefetch property:', propertyId, error);
    } finally {
      this.prefetching.delete(key);
    }
  }

  // Prefetch multiple properties (useful for property lists)
  async prefetchProperties(properties, cardNumber = 1, assessmentYear = null) {
    const prefetchPromises = properties.map((property) => {
      const propertyId = property.id || property._id || property;
      return this.prefetchProperty(propertyId, cardNumber, assessmentYear);
    });

    // Don't wait for all to complete, let them run in background
    Promise.allSettled(prefetchPromises);
  }

  // Prefetch adjacent properties (next/previous in a list)
  async prefetchAdjacentProperties(
    currentPropertyId,
    propertyList,
    cardNumber = 1,
    assessmentYear = null,
  ) {
    if (!propertyList || propertyList.length < 2) return;

    const currentIndex = propertyList.findIndex(
      (p) => (p.id || p._id) === currentPropertyId,
    );

    if (currentIndex === -1) return;

    const toPreload = [];

    // Previous property
    if (currentIndex > 0) {
      toPreload.push(propertyList[currentIndex - 1]);
    }

    // Next property
    if (currentIndex < propertyList.length - 1) {
      toPreload.push(propertyList[currentIndex + 1]);
    }

    // Prefetch adjacent properties
    await this.prefetchProperties(toPreload, cardNumber, assessmentYear);
  }

  // Smart prefetch based on user behavior patterns
  async smartPrefetch(propertyId, cardNumber = 1, assessmentYear = null) {
    // Prefetch other cards for the same property
    const cardsToPreload = [1, 2, 3, 4, 5].filter(
      (card) => card !== cardNumber,
    );

    cardsToPreload.forEach((card) => {
      this.prefetchProperty(propertyId, card, assessmentYear);
    });
  }

  // Clear prefetch queue (useful when navigating away)
  clearPrefetchQueue() {
    this.prefetchQueue.clear();
    console.log('🧹 Cleared prefetch queue');
  }
}
