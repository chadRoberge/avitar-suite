import Service from '@ember/service';
import { inject as service } from '@ember/service';

export default class AssessingService extends Service {
  @service localApi;
  @service municipality;
  @service('property-cache') propertyCache;

  async getProperties(filters = {}) {
    const municipalityId = this.municipality.currentMunicipality.id;
    return this.localApi.get(`/municipalities/${municipalityId}/properties`, {
      params: filters,
    });
  }

  async getProperty(propertyId) {
    // Use direct property endpoint, not municipality-scoped
    return this.localApi.get(`/properties/${propertyId}`);
  }

  async getPropertyWithCard(propertyId, cardNumber = 1) {
    // Check cache first
    const cached = this.propertyCache.get(propertyId, cardNumber);
    if (cached) {
      return cached;
    }

    // Fetch from API
    const result = await this.localApi.get(`/properties/${propertyId}?card=${cardNumber}`);

    // Cache the result
    this.propertyCache.set(propertyId, result, cardNumber);

    return result;
  }

  // Optimized method to fetch all property data in one call
  async getPropertyFullData(propertyId, cardNumber = 1, assessmentYear = null) {
    // Check cache first
    const cached = this.propertyCache.get(propertyId, cardNumber, assessmentYear);
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
        this.localApi.get(`/properties/${propertyId}/assessment/current?card=${cardNumber}${assessmentYear ? `&assessment_year=${assessmentYear}` : ''}`),
        this.localApi.get(`/properties/${propertyId}/assessment-history`, {}, { showLoading: false }),
        this.localApi.get(`/municipalities/${municipalityId}/properties/${propertyId}/listing-history`, {}, { showLoading: false }),
      ]);

      // Log any failed requests for debugging
      if (propertyResponse.status === 'rejected') {
        console.error('Property response failed:', propertyResponse.reason);
      }
      if (assessmentResponse.status === 'rejected') {
        console.warn('Assessment response failed (may be normal):', assessmentResponse.reason);
      }
      if (assessmentHistoryResponse.status === 'rejected') {
        console.warn('Assessment history response failed:', assessmentHistoryResponse.reason);
      }
      if (listingHistoryResponse.status === 'rejected') {
        console.warn('Listing history response failed:', listingHistoryResponse.reason);
      }

      // Process results - use successful responses, provide defaults for failures
      const result = {
        property: propertyResponse.status === 'fulfilled' ?
          (propertyResponse.value?.property || propertyResponse.value) : null,
        assessment: assessmentResponse.status === 'fulfilled' ?
          (assessmentResponse.value?.assessment || assessmentResponse.value) : null,
        assessmentHistory: assessmentHistoryResponse.status === 'fulfilled' ?
          (assessmentHistoryResponse.value?.assessments || []) : [],
        listingHistory: listingHistoryResponse.status === 'fulfilled' ?
          (listingHistoryResponse.value?.listingHistory || []) : [],
        propertyNotes: listingHistoryResponse.status === 'fulfilled' ?
          listingHistoryResponse.value?.propertyNotes : null,
        salesHistory: listingHistoryResponse.status === 'fulfilled' ?
          (listingHistoryResponse.value?.salesHistory || []) : [],
        currentYear
      };

      // Validate that we have at least property data
      if (!result.property) {
        console.error('No property data returned from API call for propertyId:', propertyId);
        throw new Error(`Property ${propertyId} not found or data not available`);
      }

      // Cache the combined result
      this.propertyCache.set(propertyId, result, cardNumber, assessmentYear);

      console.log('🚀 Loaded property data in single optimized call:', propertyId);
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

    // Invalidate cache for this property
    this.propertyCache.invalidate(propertyId);

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
    const result = await this.localApi.patch(
      `/properties/${propertyId}/assessment/building?card=${cardNumber}`,
      data,
    );

    // Invalidate property cache for this property since building assessment affects total
    this.propertyCache.invalidate(propertyId);

    return result;
  }

  async getBuildingFeatureCodes(municipalityId = null) {
    const muniId = municipalityId || this.municipality.currentMunicipality.id;
    return this.localApi.get(
      `/municipalities/${muniId}/building-feature-codes`,
    );
  }

  async getPropertyFeatures(propertyId, cardNumber = 1) {
    return this.localApi.get(
      `/properties/${propertyId}/features?card=${cardNumber}`,
    );
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
    return this.localApi.get(
      `/properties/${propertyId}/features?${params.toString()}`,
    );
  }

  async getPropertySketches(propertyId, cardNumber = 1, options = {}) {
    return this.localApi.get(
      `/properties/${propertyId}/sketches?card=${cardNumber}`,
      options,
    );
  }

  async getPropertySketchesForYear(
    propertyId,
    cardNumber = 1,
    assessmentYear = null,
    options = {},
  ) {
    const params = new URLSearchParams({ card: cardNumber });
    if (assessmentYear) {
      params.append('assessment_year', assessmentYear);
    }
    return this.localApi.get(
      `/properties/${propertyId}/sketches?${params.toString()}`,
      options,
    );
  }

  async createPropertySketch(propertyId, sketchData) {
    return this.localApi.post(`/properties/${propertyId}/sketches`, sketchData);
  }

  async updatePropertySketch(propertyId, sketchId, sketchData) {
    return this.localApi.put(
      `/properties/${propertyId}/sketches/${sketchId}`,
      sketchData,
    );
  }

  async deletePropertySketch(propertyId, sketchId) {
    const result = await this.localApi.delete(
      `/properties/${propertyId}/sketches/${sketchId}`,
    );
    return result;
  }

  clearSketchCache(propertyId, cardNumber) {
    // Clear the specific cache key for this property's sketches
    // The endpoint /properties/{propertyId}/sketches?card={cardNumber} becomes:
    // _properties_{propertyId}_sketches_card_{cardNumber} and is stored with item_ prefix
    const endpointCacheKey = `_properties_${propertyId}_sketches_card_${cardNumber}`;
    const actualCacheKey = `item_${endpointCacheKey}`;

    this.localApi.localStorage.remove(actualCacheKey);

    // Also clear related caches that might interfere
    const propertyEndpointKey = `_properties_${propertyId}_card_${cardNumber}`;
    const propertyActualKey = `item_${propertyEndpointKey}`;
    this.localApi.localStorage.remove(propertyActualKey);
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
}
