import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

/**
 * Progressive Property Data Loading Service
 *
 * Implements tiered loading strategy:
 * - Tier 1 (Critical): Basic property info (PID, address, owner) - <200ms
 * - Tier 2 (Important): Current assessment values - <500ms
 * - Tier 3 (Supporting): Assessment history, sales history - <1s
 * - Tier 4 (Optional): Sketches, detailed features - background
 */
export default class PropertyDataLoaderService extends Service {
  @service assessing;
  @service localApi;
  @service municipality;
  @service('property-cache') propertyCache;
  @service('property-prefetch') propertyPrefetch;

  @tracked loadingStates = new Map();

  /**
   * Load property data progressively in tiers
   * @param {string} propertyId
   * @param {number} cardNumber
   * @param {number} assessmentYear
   * @param {Object} options - Loading options
   * @returns {Object} Progressive data loader with promises for each tier
   */
  loadPropertyProgressively(
    propertyId,
    cardNumber = 1,
    assessmentYear = null,
    options = {},
  ) {
    const {
      skipCache = false,
      onTierComplete = () => {},
      loadAll = false,
    } = options;

    // Initialize loading state
    const loadingKey = `${propertyId}-${cardNumber}-${assessmentYear || 'current'}`;
    this.loadingStates.set(loadingKey, {
      tier1: 'loading',
      tier2: 'pending',
      tier3: 'pending',
      tier4: 'pending',
      startTime: Date.now(),
    });

    // Check cache first for complete data
    if (!skipCache) {
      const cached = this.propertyCache.get(
        propertyId,
        cardNumber,
        assessmentYear,
      );
      if (cached && this.isCachedDataComplete(cached)) {
        console.log(
          '✅ Complete cached data found, returning all tiers immediately',
        );
        return this.createProgressiveResult(cached, loadingKey);
      }
    }

    // Create progressive loading promises
    const tierPromises = {
      tier1: this.loadTier1(propertyId, cardNumber, assessmentYear, loadingKey),
      tier2: this.loadTier2(propertyId, cardNumber, assessmentYear, loadingKey),
      tier3: this.loadTier3(propertyId, cardNumber, assessmentYear, loadingKey),
      tier4: this.loadTier4(propertyId, cardNumber, assessmentYear, loadingKey),
    };

    // Set up tier completion callbacks
    Object.keys(tierPromises).forEach((tier) => {
      tierPromises[tier]
        .then((data) => {
          this.updateLoadingState(loadingKey, tier, 'complete');
          onTierComplete(tier, data);
        })
        .catch((error) => {
          this.updateLoadingState(loadingKey, tier, 'error');
          console.warn(`${tier} loading failed:`, error);
        });
    });

    // If loadAll is true, wait for all tiers
    if (loadAll) {
      tierPromises.all = Promise.allSettled(Object.values(tierPromises));
    }

    return {
      ...tierPromises,
      loadingState: () => this.loadingStates.get(loadingKey),
      isComplete: () => this.isLoadingComplete(loadingKey),
    };
  }

  /**
   * Tier 1: Critical data (basic property info)
   */
  async loadTier1(propertyId, cardNumber, assessmentYear, loadingKey) {
    console.log('🚀 Loading Tier 1: Basic property info');
    this.updateLoadingState(loadingKey, 'tier1', 'loading');

    try {
      // Use hybrid strategy: IndexedDB first with background refresh
      // This gives instant loading from IndexedDB while ensuring data freshness
      const response = await this.localApi.get(
        `/properties/${propertyId}?card=${cardNumber}&fields=basic`,
        { strategy: 'hybrid' }, // Stale-while-revalidate: always use IndexedDB if available
      );

      const basicData = {
        property: response.property || response,
        loadedAt: Date.now(),
        tier: 1,
      };

      console.log(
        '✅ Tier 1 loaded:',
        Date.now() - this.loadingStates.get(loadingKey).startTime,
        'ms',
      );
      return basicData;
    } catch (error) {
      // Fallback to full property endpoint with hybrid strategy
      console.warn('Tier 1 fallback to full property endpoint');
      const response = await this.localApi.get(
        `/properties/${propertyId}?card=${cardNumber}`,
        { strategy: 'hybrid' },
      );
      return {
        property: response.property || response,
        loadedAt: Date.now(),
        tier: 1,
      };
    }
  }

  /**
   * Tier 2: Important data (current assessment)
   */
  async loadTier2(propertyId, cardNumber, assessmentYear, loadingKey) {
    console.log('🚀 Loading Tier 2: Current assessment');
    this.updateLoadingState(loadingKey, 'tier2', 'loading');

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const assessmentUrl = `/properties/${propertyId}/assessment/current?card=${cardNumber}${assessmentYear ? `&assessment_year=${assessmentYear}` : ''}`;

      const assessment = await this.localApi.get(assessmentUrl, {
        strategy: 'hybrid', // IndexedDB first with background refresh
      });

      const assessmentData = {
        assessment: assessment.assessment || assessment,
        loadedAt: Date.now(),
        tier: 2,
      };

      console.log(
        '✅ Tier 2 loaded:',
        Date.now() - this.loadingStates.get(loadingKey).startTime,
        'ms',
      );
      return assessmentData;
    } catch (error) {
      console.warn('Tier 2 loading failed, continuing without assessment data');
      return { assessment: null, loadedAt: Date.now(), tier: 2 };
    }
  }

  /**
   * Tier 3: Supporting data (history, sales)
   */
  async loadTier3(propertyId, cardNumber, assessmentYear, loadingKey) {
    console.log('🚀 Loading Tier 3: History and sales data');
    this.updateLoadingState(loadingKey, 'tier3', 'loading');

    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      const [assessmentHistoryResponse, listingHistoryResponse] =
        await Promise.allSettled([
          this.localApi.get(
            `/properties/${propertyId}/assessment-history`,
            {},
            { showLoading: false },
          ),
          // Use API service directly for listing-history to avoid cache issues with card parameter
          this.assessing.api.get(
            `/municipalities/${municipalityId}/properties/${propertyId}/listing-history?card=${cardNumber}`,
          ),
        ]);

      const historyData = {
        assessmentHistory:
          assessmentHistoryResponse.status === 'fulfilled'
            ? assessmentHistoryResponse.value?.assessments || []
            : [],
        listingHistory:
          listingHistoryResponse.status === 'fulfilled'
            ? listingHistoryResponse.value?.listingHistory || []
            : [],
        salesHistory:
          listingHistoryResponse.status === 'fulfilled'
            ? listingHistoryResponse.value?.salesHistory || []
            : [],
        propertyNotes:
          listingHistoryResponse.status === 'fulfilled'
            ? listingHistoryResponse.value?.propertyNotes
            : null,
        loadedAt: Date.now(),
        tier: 3,
      };

      console.log(
        '✅ Tier 3 loaded:',
        Date.now() - this.loadingStates.get(loadingKey).startTime,
        'ms',
      );
      return historyData;
    } catch (error) {
      console.warn('Tier 3 loading failed');
      return {
        assessmentHistory: [],
        listingHistory: [],
        salesHistory: [],
        propertyNotes: null,
        loadedAt: Date.now(),
        tier: 3,
      };
    }
  }

  /**
   * Tier 4: Optional data (sketches, detailed features)
   */
  async loadTier4(propertyId, cardNumber, assessmentYear, loadingKey) {
    console.log('🚀 Loading Tier 4: Sketches and features (background)');
    this.updateLoadingState(loadingKey, 'tier4', 'loading');

    try {
      const [sketchResponse, featuresResponse] = await Promise.allSettled([
        this.assessing.getPropertySketchesForYear(
          propertyId,
          cardNumber,
          assessmentYear,
        ),
        this.assessing.getPropertyFeaturesForYear(
          propertyId,
          cardNumber,
          assessmentYear,
        ),
      ]);

      const optionalData = {
        sketches:
          sketchResponse.status === 'fulfilled' ? sketchResponse.value : [],
        features:
          featuresResponse.status === 'fulfilled' ? featuresResponse.value : [],
        loadedAt: Date.now(),
        tier: 4,
      };

      console.log(
        '✅ Tier 4 loaded:',
        Date.now() - this.loadingStates.get(loadingKey).startTime,
        'ms',
      );
      return optionalData;
    } catch (error) {
      console.warn('Tier 4 loading failed');
      return {
        sketches: [],
        features: [],
        loadedAt: Date.now(),
        tier: 4,
      };
    }
  }

  /**
   * Check if cached data has all required tiers
   */
  isCachedDataComplete(cached) {
    return (
      cached.property &&
      cached.assessment !== undefined &&
      cached.assessmentHistory !== undefined &&
      cached.currentYear !== undefined
    );
  }

  /**
   * Create a progressive result object from cached data
   */
  createProgressiveResult(cached, loadingKey) {
    this.updateLoadingState(loadingKey, 'tier1', 'complete');
    this.updateLoadingState(loadingKey, 'tier2', 'complete');
    this.updateLoadingState(loadingKey, 'tier3', 'complete');
    this.updateLoadingState(loadingKey, 'tier4', 'complete');

    return {
      tier1: Promise.resolve({
        property: cached.property,
        loadedAt: Date.now(),
        tier: 1,
        fromCache: true,
      }),
      tier2: Promise.resolve({
        assessment: cached.assessment,
        loadedAt: Date.now(),
        tier: 2,
        fromCache: true,
      }),
      tier3: Promise.resolve({
        assessmentHistory: cached.assessmentHistory || [],
        listingHistory: cached.listingHistory || [],
        salesHistory: cached.salesHistory || [],
        propertyNotes: cached.propertyNotes,
        loadedAt: Date.now(),
        tier: 3,
        fromCache: true,
      }),
      tier4: Promise.resolve({
        sketches: [],
        features: [],
        loadedAt: Date.now(),
        tier: 4,
        fromCache: true,
      }),
      loadingState: () => this.loadingStates.get(loadingKey),
      isComplete: () => true,
    };
  }

  /**
   * Update loading state for a specific tier
   */
  updateLoadingState(loadingKey, tier, state) {
    const current = this.loadingStates.get(loadingKey);
    if (current) {
      current[tier] = state;
      this.loadingStates.set(loadingKey, { ...current });
    }
  }

  /**
   * Check if all tiers are complete
   */
  isLoadingComplete(loadingKey) {
    const state = this.loadingStates.get(loadingKey);
    if (!state) return false;

    return Object.values(state).every(
      (tierState) => tierState === 'complete' || tierState === 'error',
    );
  }

  /**
   * Get loading statistics
   */
  getLoadingStats(loadingKey) {
    const state = this.loadingStates.get(loadingKey);
    if (!state) return null;

    const totalTime = Date.now() - state.startTime;
    return {
      totalTime,
      completedTiers: Object.keys(state).filter(
        (key) => key.startsWith('tier') && state[key] === 'complete',
      ).length,
      failedTiers: Object.keys(state).filter(
        (key) => key.startsWith('tier') && state[key] === 'error',
      ).length,
    };
  }

  /**
   * Clean up loading states (call when leaving route)
   */
  cleanup(loadingKey) {
    if (loadingKey) {
      this.loadingStates.delete(loadingKey);
    } else {
      this.loadingStates.clear();
    }
  }
}
