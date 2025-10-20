import Service from '@ember/service';
import { inject as service } from '@ember/service';

export default class AssessingService extends Service {
  @service api;
  @service localApi;
  @service('hybrid-api') hybridApi;
  @service municipality;
  @service('property-cache') propertyCache;

  async getProperties(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(`/municipalities/${municipalityId}/properties`, {
      params: filters,
    });
  }

  async getProperty(propertyId, options = {}) {
    // Use direct property endpoint, not municipality-scoped
    // Default to network-first to ensure fresh assessment_summary with parcel totals
    const defaultOptions = { strategy: 'network-first', ...options };
    return this.localApi.get(`/properties/${propertyId}`, defaultOptions);
  }

  async getPropertyWithCard(propertyId, cardNumber = 1) {
    // Check cache first
    const cached = this.propertyCache.get(propertyId, cardNumber);
    if (cached) {
      console.log('🃏 getPropertyWithCard - Cached property cards data:', cached.property?.cards);
      return cached;
    }

    // Fetch from API with network-first strategy to ensure we get fresh cards data
    // The IndexedDB cache may have stale property list data without cards information
    const result = await this.localApi.get(
      `/properties/${propertyId}?card=${cardNumber}`,
      { strategy: 'network-first' }
    );

    console.log('🃏 getPropertyWithCard - Fresh API property cards data:', result.property?.cards);

    // Cache the result in memory
    this.propertyCache.set(propertyId, result, cardNumber);

    return result;
  }

  // Optimized method to fetch all property data in one call
  async getPropertyFullData(propertyId, cardNumber = 1, assessmentYear = null) {
    // Check cache first
    const cached = this.propertyCache.get(
      propertyId,
      cardNumber,
      assessmentYear,
    );
    if (cached) {
      return cached;
    }

    console.log('⚡ Loading property data (optimized):', propertyId);

    const municipalityId = this.municipality.currentMunicipality?.id;
    const currentYear = assessmentYear || new Date().getFullYear();

    try {
      // Make all API calls in parallel but catch individual failures
      const [
        propertyResponse,
        assessmentResponse,
        assessmentHistoryResponse,
        listingHistoryResponse,
      ] = await Promise.allSettled([
        this.localApi.get(`/properties/${propertyId}?card=${cardNumber}`),
        this.localApi.get(
          `/properties/${propertyId}/assessment/current?card=${cardNumber}${assessmentYear ? `&assessment_year=${assessmentYear}` : ''}`,
        ),
        this.localApi.get(
          `/properties/${propertyId}/assessment-history`,
          {},
          { showLoading: false },
        ),
        // Use API service directly for listing-history to avoid cache issues with card parameter
        this.api.get(
          `/municipalities/${municipalityId}/properties/${propertyId}/listing-history?card=${cardNumber}`,
        ),
      ]);

      // Log any failed requests for debugging
      if (propertyResponse.status === 'rejected') {
        console.error('Property response failed:', propertyResponse.reason);
      }
      if (assessmentResponse.status === 'rejected') {
        console.warn(
          'Assessment response failed (may be normal):',
          assessmentResponse.reason,
        );
      }
      if (assessmentHistoryResponse.status === 'rejected') {
        console.warn(
          'Assessment history response failed:',
          assessmentHistoryResponse.reason,
        );
      }
      if (listingHistoryResponse.status === 'rejected') {
        console.warn(
          'Listing history response failed:',
          listingHistoryResponse.reason,
        );
      }

      // Process results - use successful responses, provide defaults for failures
      const result = {
        property:
          propertyResponse.status === 'fulfilled'
            ? propertyResponse.value?.property || propertyResponse.value
            : null,
        assessment:
          assessmentResponse.status === 'fulfilled'
            ? assessmentResponse.value?.assessment || assessmentResponse.value
            : null,
        assessmentHistory:
          assessmentHistoryResponse.status === 'fulfilled'
            ? assessmentHistoryResponse.value?.assessments || []
            : [],
        listingHistory:
          listingHistoryResponse.status === 'fulfilled'
            ? listingHistoryResponse.value?.listingHistory || []
            : [],
        propertyNotes:
          listingHistoryResponse.status === 'fulfilled'
            ? listingHistoryResponse.value?.propertyNotes
            : null,
        salesHistory:
          listingHistoryResponse.status === 'fulfilled'
            ? listingHistoryResponse.value?.salesHistory || []
            : [],
        currentYear,
      };

      // Validate that we have at least property data
      if (!result.property) {
        console.error(
          'No property data returned from API call for propertyId:',
          propertyId,
        );
        throw new Error(
          `Property ${propertyId} not found or data not available`,
        );
      }

      // Cache the combined result
      this.propertyCache.set(propertyId, result, cardNumber, assessmentYear);

      console.log(
        '🚀 Loaded property data in single optimized call:',
        propertyId,
      );
      return result;
    } catch (error) {
      console.error('Failed to load property data:', error);
      throw error;
    }
  }

  async updateProperty(propertyId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    const result = await this.localApi.patch(
      `/municipalities/${municipalityId}/properties/${propertyId}`,
      data,
    );

    // Update cache with the server response instead of invalidating
    if (result && result.property) {
      // Update local storage cache
      const cacheKey = `_properties_${propertyId}`;
      this.localApi.localStorage.set(`item_${cacheKey}`, result);

      // Also update in-memory property cache
      this.propertyCache.set(propertyId, result);

      console.log('✅ Updated cache with fresh property data after property update');
    } else {
      // Fall back to invalidation if no property in response
      this.propertyCache.invalidate(propertyId);
    }

    // Notify other users of the property update
    this.propertyCache.notifyPropertyUpdate(
      propertyId,
      1,
      null,
      'update',
      result.property || result,
    );

    return result;
  }

  async createProperty(data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.post(
      `/municipalities/${municipalityId}/properties`,
      data,
    );
  }

  async deleteProperty(propertyId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.delete(
      `/municipalities/${municipalityId}/properties/${propertyId}`,
    );
  }

  // === Valuations ===

  async getValuations(propertyId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${municipalityId}/properties/${propertyId}/valuations`,
    );
  }

  async createValuation(propertyId, valuationData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.post(
      `/municipalities/${municipalityId}/properties/${propertyId}/valuations`,
      valuationData,
    );
  }

  async updateValuation(propertyId, valuationId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.patch(
      `/municipalities/${municipalityId}/properties/${propertyId}/valuations/${valuationId}`,
      data,
    );
  }

  // === Appeals ===

  async getAppeals(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(`/municipalities/${municipalityId}/appeals`, {
      params: filters,
    });
  }

  async getAppeal(appealId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${municipalityId}/appeals/${appealId}`,
    );
  }

  async updateAppeal(appealId, data) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.patch(
      `/municipalities/${municipalityId}/appeals/${appealId}`,
      data,
    );
  }

  // === AI Features (Enterprise) ===

  async generateAIAbatementReview(propertyId, taxpayerData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.post('/ai/abatement-review', {
      municipality_id: municipalityId,
      property_id: propertyId,
      taxpayer_data: taxpayerData,
    });
  }

  async getAIReviewResults(reviewId) {
    return this.localApi.get(`/ai/abatement-review/${reviewId}`);
  }

  async runMassAppraisal(criteria) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.post(
      `/municipalities/${municipalityId}/mass-appraisal`,
      criteria,
    );
  }

  async getMassAppraisalStatus(jobId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${municipalityId}/mass-appraisal/${jobId}`,
    );
  }

  // === Assessment Methods ===

  async getCurrentAssessment(propertyId, cardNumber = 1) {
    return this.localApi.get(
      `/properties/${propertyId}/assessment/current?card=${cardNumber}`,
    );
  }

  async getCurrentAssessmentForYear(
    propertyId,
    cardNumber = 1,
    assessmentYear = null,
  ) {
    const params = new URLSearchParams({ card: cardNumber });
    if (assessmentYear) {
      params.append('assessment_year', assessmentYear);
    }
    return this.localApi.get(
      `/properties/${propertyId}/assessment/current?${params.toString()}`,
    );
  }

  async getLandAssessment(propertyId, cardNumber = 1) {
    return this.localApi.get(
      `/properties/${propertyId}/assessment/land?card=${cardNumber}`,
    );
  }

  async getLandAssessmentForYear(
    propertyId,
    cardNumber = 1,
    assessmentYear = null,
  ) {
    const params = new URLSearchParams({ card: cardNumber });
    if (assessmentYear) {
      params.append('assessment_year', assessmentYear);
    }
    return this.localApi.get(
      `/properties/${propertyId}/assessment/land?${params.toString()}`,
    );
  }

  async getBuildingAssessment(propertyId, cardNumber = 1) {
    return this.localApi.get(
      `/properties/${propertyId}/assessment/building?card=${cardNumber}`,
    );
  }

  async getBuildingAssessmentForYear(
    propertyId,
    cardNumber = 1,
    assessmentYear = null,
  ) {
    const params = new URLSearchParams({ card: cardNumber });
    if (assessmentYear) {
      params.append('assessment_year', assessmentYear);
    }
    return this.localApi.get(
      `/properties/${propertyId}/assessment/building?${params.toString()}`,
    );
  }

  async updateBuildingAssessment(propertyId, cardNumber = 1, data) {
    const result = await this.api.patch(
      `/properties/${propertyId}/assessment/building?card=${cardNumber}`,
      data,
    );

    // After successful save, fetch fresh property data and update cache
    // This ensures the cache has the latest assessment_summary with parcel totals
    try {
      const freshProperty = await this.api.get(`/properties/${propertyId}`);

      // Update the cache with fresh data instead of invalidating
      if (freshProperty && freshProperty.property) {
        // Update local storage cache
        const cacheKey = `_properties_${propertyId}`;
        this.localApi.localStorage.set(`item_${cacheKey}`, freshProperty);

        // Also update in-memory property cache
        this.propertyCache.set(propertyId, freshProperty);

        console.log('✅ Updated cache with fresh property data after building save');
      }
    } catch (error) {
      console.warn('Could not update cache after building save:', error);
      // Fall back to invalidation if update fails
      this.propertyCache.invalidate(propertyId);
    }

    // Notify other users of the building assessment update
    this.propertyCache.notifyPropertyUpdate(
      propertyId,
      cardNumber,
      null,
      'update',
    );

    return result;
  }

  async getBuildingFeatureCodes(municipalityId = null) {
    const muniId = municipalityId || this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${muniId}/building-feature-codes`,
    );
  }

  async getPropertyFeatures(propertyId, cardNumber = 1) {
    const response = await this.hybridApi.get(
      `/properties/${propertyId}/features?card=${cardNumber}`,
    );

    // Handle different response formats from HybridAPI vs direct API
    if (response?.success !== undefined) {
      // LocalAPI format: {success: true, features: [...]}
      return {
        features: response.features || [],
      };
    } else if (Array.isArray(response)) {
      // Direct IndexedDB array format
      return {
        features: response,
      };
    } else {
      // Direct API format: {features: [...]}
      return {
        features: response?.features || [],
      };
    }
  }

  async getPropertyFeaturesForYear(
    propertyId,
    cardNumber = 1,
    assessmentYear = null,
  ) {
    const params = new URLSearchParams({ card: cardNumber });
    if (assessmentYear) {
      params.append('assessment_year', assessmentYear);
    }
    const response = await this.hybridApi.get(
      `/properties/${propertyId}/features?${params.toString()}`,
    );

    // Handle different response formats from HybridAPI vs direct API
    if (response?.success !== undefined) {
      // LocalAPI format: {success: true, features: [...]}
      return {
        features: response.features || [],
      };
    } else if (Array.isArray(response)) {
      // Direct IndexedDB array format
      return {
        features: response,
      };
    } else {
      // Direct API format: {features: [...]}
      return {
        features: response?.features || [],
      };
    }
  }

  async getPropertySketches(propertyId, cardNumber = 1, options = {}) {
    const response = await this.hybridApi.get(
      `/properties/${propertyId}/sketches?card=${cardNumber}`,
      options,
    );

    // Handle different response formats from HybridAPI vs direct API
    if (response?.success !== undefined) {
      // LocalAPI format: {success: true, sketches: [...]}
      return {
        sketches: response.sketches || [],
        areaDescriptions: response.areaDescriptions || [],
      };
    } else if (Array.isArray(response)) {
      // Check if it's an array containing a LocalAPI response object
      if (response.length === 1 && response[0]?.success !== undefined) {
        return {
          sketches: response[0].sketches || [],
          areaDescriptions: response[0].areaDescriptions || [],
        };
      }
      // Direct IndexedDB array format (array of actual sketch objects)
      return {
        sketches: response,
        areaDescriptions: [],
      };
    } else {
      // Direct API format: {sketches: [...], areaDescriptions: [...]}
      return {
        sketches: response?.sketches || [],
        areaDescriptions: response?.areaDescriptions || [],
      };
    }
  }

  async getPropertySketchesForYear(
    propertyId,
    cardNumber = 1,
    assessmentYear = null,
    options = {},
  ) {
    // Unified cache approach: try to reuse data when possible to avoid duplication
    const { forceRefresh = false, useCache = true } = options;

    // If no assessment year specified, use the basic sketches method
    if (!assessmentYear) {
      console.log(
        '📋 Using basic sketches method for year-specific request (no year specified)',
      );
      return this.getPropertySketches(propertyId, cardNumber, options);
    }

    // For assessment year requests, try to use basic sketches if they exist and are fresh
    if (!forceRefresh && useCache) {
      try {
        const basicSketches = await this.getPropertySketches(
          propertyId,
          cardNumber,
          {
            ...options,
            useCache: true,
            suppressErrors: true, // Don't log errors for cache attempts
          },
        );

        // If we have basic sketches data, check if it's suitable for assessment year request
        if (
          basicSketches &&
          basicSketches.sketches &&
          basicSketches.sketches.length > 0
        ) {
          // Check if the sketches are recent enough or match the assessment year criteria
          const firstSketch = basicSketches.sketches[0];
          const currentYear = new Date().getFullYear();

          // If assessment year is current year or close, use basic sketches
          if (Math.abs(assessmentYear - currentYear) <= 1) {
            console.log(
              '📋 Reusing basic sketches cache for assessment year request:',
              {
                assessmentYear,
                currentYear,
                sketchCount: basicSketches.sketches.length,
              },
            );
            return basicSketches;
          }
        }
      } catch (error) {
        // Cache miss or error, fall through to API call
        console.log('📋 Basic sketches cache miss for year-specific request');
      }
    }

    // Make the specific API call with assessment year
    const params = new URLSearchParams({ card: cardNumber });
    if (assessmentYear) {
      params.append('assessment_year', assessmentYear);
    }

    console.log('📋 Making assessment year specific API call:', {
      propertyId,
      cardNumber,
      assessmentYear,
      forceRefresh,
    });

    return this.localApi.get(
      `/properties/${propertyId}/sketches?${params.toString()}`,
      options,
    );
  }

  async createPropertySketch(propertyId, sketchData) {
    return this.localApi.post(`/properties/${propertyId}/sketches`, sketchData);
  }

  async updatePropertySketch(propertyId, sketchId, sketchData) {
    // Extract card number from sketch data to include in URL query parameters
    const cardNumber = sketchData.card_number || 1;
    return this.localApi.put(
      `/properties/${propertyId}/sketches/${sketchId}?card=${cardNumber}`,
      sketchData,
    );
  }

  async deletePropertySketch(propertyId, sketchId) {
    const result = await this.localApi.delete(
      `/properties/${propertyId}/sketches/${sketchId}`,
    );
    return result;
  }

  clearSketchCache(propertyId, cardNumber, options = {}) {
    const {
      specificAssessmentYear = null,
      skipEditModal = false,
      skipPropertyRecord = false,
    } = options;

    console.log('🧹 Smart sketch cache clearing with options:', {
      propertyId,
      cardNumber,
      specificAssessmentYear,
      skipEditModal,
      skipPropertyRecord,
    });

    // With unified caching, we need to be strategic about what we clear
    // The basic sketches cache is the primary source, assessment year caches are secondary

    if (!skipEditModal) {
      // Clear the basic sketch cache key (primary cache used by edit modal and as fallback)
      const endpointCacheKey = `_properties_${propertyId}_sketches_card_${cardNumber}`;
      const actualCacheKey = `item_${endpointCacheKey}`;
      this.localApi.localStorage.remove(actualCacheKey);
      console.log(
        '🗑️ Cleared primary sketch cache (edit modal):',
        actualCacheKey,
      );
    }

    if (!skipPropertyRecord) {
      // Clear assessment year specific variants, but they may fall back to basic cache
      const yearsToCheck = specificAssessmentYear
        ? [specificAssessmentYear]
        : [
            new Date().getFullYear() - 1,
            new Date().getFullYear(),
            new Date().getFullYear() + 1,
          ];

      // Add municipality selected year
      const selectedYear = this.municipality?.selectedAssessmentYear;
      if (selectedYear && !yearsToCheck.includes(selectedYear)) {
        yearsToCheck.push(selectedYear);
      }

      yearsToCheck.forEach((year) => {
        const yearEndpointKey = `_properties_${propertyId}_sketches_card_${cardNumber}_assessment_year_${year}`;
        const yearActualKey = `item_${yearEndpointKey}`;
        this.localApi.localStorage.remove(yearActualKey);
      });

      console.log(
        '🗑️ Cleared secondary sketch caches (property record) for years:',
        yearsToCheck,
      );
    }

    // Clear related property cache
    const propertyEndpointKey = `_properties_${propertyId}_card_${cardNumber}`;
    const propertyActualKey = `item_${propertyEndpointKey}`;
    this.localApi.localStorage.remove(propertyActualKey);

    console.log(
      '🔄 Cache cleared - assessment year requests will fall back to fresh basic cache when appropriate',
    );
  }

  // Debug method to inspect sketch cache keys
  getSketchCacheKeys(propertyId, cardNumber) {
    const keys = [];
    const storage = this.localApi.localStorage.storage;

    // Look for all cache keys related to this property's sketches
    Object.keys(storage).forEach((key) => {
      if (
        key.includes(`properties_${propertyId}`) &&
        key.includes('sketches') &&
        key.includes(`card_${cardNumber}`)
      ) {
        keys.push({
          key,
          hasData: !!storage[key],
          type: key.includes('assessment_year')
            ? 'property-record'
            : 'edit-modal',
        });
      }
    });

    console.log(
      `🔍 Sketch cache keys for property ${propertyId}, card ${cardNumber}:`,
      keys,
    );
    return keys;
  }

  clearLandAssessmentCache(propertyId, cardNumber = 1) {
    // Clear the specific cache key for this property's land assessment
    // The endpoint /properties/{propertyId}/assessment/land?card={cardNumber} becomes:
    // _properties_{propertyId}_assessment_land_card_{cardNumber} and is stored with item_ prefix
    const endpointCacheKey = `_properties_${propertyId}_assessment_land_card_${cardNumber}`;
    const actualCacheKey = `item_${endpointCacheKey}`;

    this.localApi.localStorage.remove(actualCacheKey);

    // Also clear current assessment cache and property cache that might contain land data
    const currentAssessmentKey = `_properties_${propertyId}_assessment_current_card_${cardNumber}`;
    const currentAssessmentActualKey = `item_${currentAssessmentKey}`;
    this.localApi.localStorage.remove(currentAssessmentActualKey);

    const propertyEndpointKey = `_properties_${propertyId}_card_${cardNumber}`;
    const propertyActualKey = `item_${propertyEndpointKey}`;
    this.localApi.localStorage.remove(propertyActualKey);

    // Clear property endpoint without card parameter (direct property fetch)
    const directPropertyKey = `_properties_${propertyId}`;
    const directPropertyActualKey = `item_${directPropertyKey}`;
    this.localApi.localStorage.remove(directPropertyActualKey);
  }

  clearAllLandAssessmentCaches() {
    // Clear all land assessment related caches (for mass operations)
    const allKeys = Object.keys(this.localApi.localStorage.data || {});
    const landAssessmentKeys = allKeys.filter(
      (key) =>
        key.includes('_assessment_land_') ||
        key.includes('_assessment_current_') ||
        key.includes('_properties_'),
    );

    landAssessmentKeys.forEach((key) => {
      this.localApi.localStorage.remove(key);
    });
  }

  async calculateSketchValuePreview(
    propertyId,
    proposedSketch,
    cardNumber = 1,
  ) {
    return this.localApi.post(
      `/properties/${propertyId}/sketches/calculate-preview?card=${cardNumber}`,
      { proposedSketch },
    );
  }

  // === Comparables ===

  async getSalesComparables(propertyId, radius = 1) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${municipalityId}/properties/${propertyId}/comparables`,
      {
        params: { radius },
      },
    );
  }

  async getMarketAnalysis(propertyId, options = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${municipalityId}/properties/${propertyId}/market-analysis`,
      {
        params: options,
      },
    );
  }

  // === Reporting ===

  async getAssessmentRoll(year, options = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${municipalityId}/assessment-roll/${year}`,
      {
        params: options,
      },
    );
  }

  async generateAssessmentReport(reportType, parameters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.post(
      `/municipalities/${municipalityId}/reports/${reportType}`,
      parameters,
    );
  }

  async getReportStatus(reportId) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${municipalityId}/reports/${reportId}/status`,
    );
  }

  // === Bulk Operations ===

  async bulkUpdateProperties(propertyIds, updates) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.patch(
      `/municipalities/${municipalityId}/properties/bulk`,
      {
        property_ids: propertyIds,
        updates,
      },
    );
  }

  async bulkImportProperties(importData) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.post(
      `/municipalities/${municipalityId}/properties/import`,
      importData,
    );
  }

  // === Statistics ===

  async getAssessmentStats(year = null) {
    const municipalityId = this.municipality.currentMunicipality.id;
    const queryParams = year ? { year } : {};
    return this.localApi.get(
      `/municipalities/${municipalityId}/assessment-stats`,
      { params: queryParams },
    );
  }

  async getTaxableValue() {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(`/municipalities/${municipalityId}/taxable-value`);
  }

  // === Sketch Sub-Area Factors ===

  async getSketchSubAreaFactors() {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${municipalityId}/sketch-sub-area-factors`,
    );
  }

  // === Property Querying ===

  async queryProperties(queryParams) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.post(
      `/municipalities/${municipalityId}/properties/query`,
      queryParams,
    );
  }

  async getPropertyZones() {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${municipalityId}/properties/zones`,
    );
  }

  // === View Attributes ===

  async getViewAttributes(municipalityId = null) {
    const muniId = municipalityId || this.municipality.currentMunicipality.id;

    // Use specific collection name to avoid cache collision
    const response = await this.localApi.get(
      `/municipalities/${muniId}/view-attributes`,
      {
        collection: `view-attributes-${muniId}`,
      },
    );

    // Handle different response formats - could be array directly or object with viewAttributes property
    if (Array.isArray(response)) {
      return response;
    } else if (response && response.viewAttributes) {
      return response.viewAttributes;
    }
    return [];
  }

  async createViewAttribute(attributeData, municipalityId = null) {
    const muniId = municipalityId || this.municipality.currentMunicipality.id;
    return this.localApi.post(
      `/municipalities/${muniId}/view-attributes`,
      attributeData,
    );
  }

  async updateViewAttribute(attributeId, attributeData, municipalityId = null) {
    const muniId = municipalityId || this.municipality.currentMunicipality.id;
    return this.localApi.put(
      `/municipalities/${muniId}/view-attributes/${attributeId}`,
      attributeData,
    );
  }

  async deleteViewAttribute(attributeId, municipalityId = null) {
    const muniId = municipalityId || this.municipality.currentMunicipality.id;
    return this.localApi.delete(
      `/municipalities/${muniId}/view-attributes/${attributeId}`,
    );
  }

  async createDefaultViewAttributes(municipalityId = null) {
    const muniId = municipalityId || this.municipality.currentMunicipality.id;
    return this.localApi.post(
      `/municipalities/${muniId}/view-attributes/defaults`,
      {},
    );
  }

  // === Zones ===

  async getZones(municipalityId = null) {
    const muniId = municipalityId || this.municipality.currentMunicipality.id;

    // Use specific collection name to avoid cache collision
    const response = await this.localApi.get(
      `/municipalities/${muniId}/zones`,
      {
        collection: `zones-${muniId}`,
      },
    );

    // Handle different response formats - could be array directly or object with zones property
    if (Array.isArray(response)) {
      return response;
    } else if (response && response.zones) {
      return response.zones;
    }
    return [];
  }

  // === Water Bodies ===

  async getWaterBodies(municipalityId = null) {
    const muniId = municipalityId || this.municipality.currentMunicipality.id;

    // Use specific collection name to avoid cache collision
    const response = await this.localApi.get(
      `/municipalities/${muniId}/water-bodies`,
      {
        collection: `water-bodies-${muniId}`,
      },
    );

    // Handle different response formats - could be array directly or object with waterBodies property
    if (Array.isArray(response)) {
      return response;
    } else if (response && response.waterBodies) {
      return response.waterBodies;
    }
    return [];
  }

  // === Property Views ===

  async getPropertyViews(propertyId) {
    const response = await this.hybridApi.get(
      `/properties/${propertyId}/views`,
    );
    return response;
  }

  async addPropertyView(propertyId, viewData) {
    return this.hybridApi.post(`/properties/${propertyId}/views`, viewData);
  }

  async updatePropertyView(propertyId, viewId, viewData) {
    const result = await this.hybridApi.put(
      `/properties/${propertyId}/views/${viewId}`,
      viewData,
    );

    // Invalidate all related caches after updating a view
    this.clearPropertyViewCaches(propertyId);

    return result;
  }

  async deletePropertyView(propertyId, viewId) {
    return this.hybridApi.delete(`/properties/${propertyId}/views/${viewId}`);
  }

  // === Waterfront ===

  async addWaterfront(propertyId, waterfrontData) {
    return this.localApi.post(
      `/properties/${propertyId}/waterfront`,
      waterfrontData,
    );
  }

  async updateWaterfront(propertyId, waterfrontId, waterfrontData) {
    return this.localApi.put(
      `/properties/${propertyId}/waterfront/${waterfrontId}`,
      waterfrontData,
    );
  }

  async deleteWaterfront(propertyId, waterfrontId) {
    return this.localApi.delete(
      `/properties/${propertyId}/waterfront/${waterfrontId}`,
    );
  }

  // === Cache Management ===

  clearPropertyViewCaches(propertyId) {
    const cacheKeys = [
      // Property views cache
      `property-views-${propertyId}`,
      // Property views API endpoint cache
      `_properties_${propertyId}_views`,
      // Land assessment cache (contains views)
      `_properties_${propertyId}_assessment_land_card_1`,
      `_properties_${propertyId}_assessment_land`,
      // Current assessment cache
      `_properties_${propertyId}_assessment_current_card_1`,
      `_properties_${propertyId}_assessment_current`,
      // Property cache that might contain view data
      `_properties_${propertyId}_card_1`,
      `_properties_${propertyId}`,
    ];

    cacheKeys.forEach((key) => {
      try {
        // Try different cache clearing methods
        if (this.localApi?.localStorage?.remove) {
          this.localApi.localStorage.remove(key);
          this.localApi.localStorage.remove(`item_${key}`);
        }
        if (this.localApi?.clearCache) {
          this.localApi.clearCache(key);
        }
        console.log(`🗑️ Cleared view-related cache: ${key}`);
      } catch (error) {
        console.warn(`Failed to clear cache key ${key}:`, error);
      }
    });

    // Also invalidate property cache if available
    if (this.propertyCache?.invalidate) {
      this.propertyCache.invalidate(propertyId);
    }

    console.log(
      `🔄 Cleared all caches for property ${propertyId} after view update`,
    );
  }

  // === Missing Methods for Complete API Centralization ===

  /**
   * Update land assessment for a property
   */
  async updateLandAssessment(propertyId, data) {
    const municipalityId = this.municipality.currentMunicipality?.id;
    if (!municipalityId) {
      throw new Error('Municipality ID is required for land assessment update');
    }

    const result = await this.localApi.put(
      `/municipalities/${municipalityId}/properties/${propertyId}/land-assessment`,
      { assessment: data },
    );

    // After successful save, fetch fresh property data and update cache
    try {
      const freshProperty = await this.api.get(`/properties/${propertyId}`);

      if (freshProperty && freshProperty.property) {
        // Update local storage cache
        const cacheKey = `_properties_${propertyId}`;
        this.localApi.localStorage.set(`item_${cacheKey}`, freshProperty);

        // Also update in-memory property cache
        this.propertyCache.set(propertyId, freshProperty);

        console.log('✅ Updated cache with fresh property data after land assessment save');
      }
    } catch (error) {
      console.warn('Could not update cache after land save:', error);
      // Fall back to invalidation if update fails
      this.propertyCache.invalidate(propertyId);
    }

    this.propertyCache.notifyPropertyUpdate(
      propertyId,
      null,
      null,
      'land-update',
    );

    return result;
  }

  /**
   * Get topology attributes for the current municipality
   */
  async getTopologyAttributes(municipalityId = null, options = {}) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      console.warn('No municipality ID available for getTopologyAttributes');
      return [];
    }

    try {
      const response = await this.localApi.get(
        `/municipalities/${currentMunicipalityId}/topology-attributes`,
        options,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading topology attributes:', error);
      return [];
    }
  }

  /**
   * Get land ladders for the current municipality
   */
  async getLandLadders(municipalityId = null, options = {}) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      console.warn('No municipality ID available for getLandLadders');
      return [];
    }

    try {
      const response = await this.localApi.get(
        `/municipalities/${currentMunicipalityId}/land-ladders`,
        options,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading land ladders:', error);
      return [];
    }
  }

  /**
   * Get land use details for the current municipality
   */
  async getLandUseDetails(municipalityId = null, options = {}) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      console.warn('No municipality ID available for getLandUseDetails');
      return [];
    }

    try {
      const response = await this.localApi.get(
        `/municipalities/${currentMunicipalityId}/land-use-details`,
        options,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading land use details:', error);
      return [];
    }
  }

  /**
   * Get land taxation categories for the current municipality
   */
  async getLandTaxationCategories(municipalityId = null, options = {}) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      console.warn(
        'No municipality ID available for getLandTaxationCategories',
      );
      return [];
    }

    try {
      const response = await this.localApi.get(
        `/municipalities/${currentMunicipalityId}/land-taxation-categories`,
        options,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading land taxation categories:', error);
      return [];
    }
  }

  /**
   * Get current use settings for the current municipality
   */
  async getCurrentUseSettings(municipalityId = null, options = {}) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      console.warn('No municipality ID available for getCurrentUseSettings');
      return [];
    }

    try {
      const response = await this.localApi.get(
        `/municipalities/${currentMunicipalityId}/current-use`,
        options,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading current use settings:', error);
      return [];
    }
  }

  /**
   * Get acreage discount settings for the current municipality
   */
  async getAcreageDiscountSettings(municipalityId = null) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      console.warn(
        'No municipality ID available for getAcreageDiscountSettings',
      );
      return [];
    }

    try {
      const response = await this.localApi.get(
        `/municipalities/${currentMunicipalityId}/acreage-discount-settings`,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading acreage discount settings:', error);
      return [];
    }
  }

  /**
   * Get exemption types for the current municipality
   */
  async getExemptionTypes(municipalityId = null) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      console.warn('No municipality ID available for getExemptionTypes');
      return [];
    }

    try {
      const response = await this.localApi.get(
        `/municipalities/${currentMunicipalityId}/exemption-types`,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading exemption types:', error);
      return [];
    }
  }

  /**
   * Get exemption credits for the current municipality
   */
  async getExemptionCredits(municipalityId = null) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      console.warn('No municipality ID available for getExemptionCredits');
      return [];
    }

    try {
      const response = await this.localApi.get(
        `/municipalities/${currentMunicipalityId}/exemption-credits`,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading exemption credits:', error);
      return [];
    }
  }

  /**
   * Batch load all land configuration data for better performance
   */
  async getLandConfigurationData(municipalityId = null) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      throw new Error(
        'Municipality ID is required for land configuration data',
      );
    }

    try {
      const [
        zones,
        neighborhoods,
        siteConditions,
        drivewayTypes,
        roadTypes,
        topologyAttributes,
        landLadders,
        landUseDetails,
        landTaxationCategories,
        currentUseSettings,
        acreageDiscountSettings,
      ] = await Promise.allSettled([
        this.municipality.getZones(),
        this.municipality.getNeighborhoods(),
        this.municipality.getSiteConditions(),
        this.municipality.getDrivewayTypes(),
        this.municipality.getRoadTypes(),
        this.getTopologyAttributes(currentMunicipalityId),
        this.getLandLadders(currentMunicipalityId),
        this.getLandUseDetails(currentMunicipalityId),
        this.getLandTaxationCategories(currentMunicipalityId),
        this.getCurrentUseSettings(currentMunicipalityId),
        this.getAcreageDiscountSettings(currentMunicipalityId),
      ]);

      return {
        zones: zones.status === 'fulfilled' ? zones.value?.zones : [],
        neighborhoods:
          neighborhoods.status === 'fulfilled'
            ? neighborhoods.value?.neighborhoods
            : [],
        siteConditions:
          siteConditions.status === 'fulfilled'
            ? siteConditions.value?.site_conditions
            : [],
        drivewayTypes:
          drivewayTypes.status === 'fulfilled'
            ? drivewayTypes.value?.driveway_types
            : [],
        roadTypes:
          roadTypes.status === 'fulfilled' ? roadTypes.value?.road_types : [],
        topologyAttributes:
          topologyAttributes.status === 'fulfilled'
            ? topologyAttributes.value
            : [],
        landLadders:
          landLadders.status === 'fulfilled' ? landLadders.value : [],
        landUseDetails:
          landUseDetails.status === 'fulfilled' ? landUseDetails.value : [],
        landTaxationCategories:
          landTaxationCategories.status === 'fulfilled'
            ? landTaxationCategories.value
            : [],
        currentUseSettings:
          currentUseSettings.status === 'fulfilled'
            ? currentUseSettings.value
            : [],
        acreageDiscountSettings:
          acreageDiscountSettings.status === 'fulfilled'
            ? acreageDiscountSettings.value
            : [],
      };
    } catch (error) {
      console.error('Error loading land configuration data:', error);
      throw error;
    }
  }

  /**
   * Batch load all exemption configuration data for better performance
   */
  async getExemptionConfigurationData(municipalityId = null) {
    const currentMunicipalityId =
      municipalityId || this.municipality.currentMunicipality?.id;
    if (!currentMunicipalityId) {
      throw new Error(
        'Municipality ID is required for exemption configuration data',
      );
    }

    try {
      const [exemptionTypes, exemptionCredits] = await Promise.allSettled([
        this.getExemptionTypes(currentMunicipalityId),
        this.getExemptionCredits(currentMunicipalityId),
      ]);

      return {
        exemptionTypes:
          exemptionTypes.status === 'fulfilled' ? exemptionTypes.value : [],
        exemptionCredits:
          exemptionCredits.status === 'fulfilled' ? exemptionCredits.value : [],
      };
    } catch (error) {
      console.error('Error loading exemption configuration data:', error);
      throw error;
    }
  }
}
