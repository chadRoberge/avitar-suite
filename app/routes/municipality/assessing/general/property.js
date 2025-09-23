import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingGeneralPropertyRoute extends Route {
  @service assessing;
  @service router;
  @service api;
  @service municipality;
  @service('property-selection') propertySelection;
  @service('current-user') currentUser;
  @service('property-data-loader') propertyDataLoader;
  @service('property-prefetch') propertyPrefetch;

  queryParams = {
    card: {
      refreshModel: true,
    },
    assessment_year: {
      refreshModel: true,
    },
  };

  async model(params, transition) {
    try {
      const { property_id } = params;
      const cardNumber = transition.to.queryParams.card || 1;
      const assessmentYear = transition.to.queryParams.assessment_year;
      const municipalityId = this.municipality.currentMunicipality?.id;

      console.log('🚀 Starting progressive property loading:', property_id);

      // Start progressive loading
      const progressiveLoader = this.propertyDataLoader.loadPropertyProgressively(
        property_id,
        cardNumber,
        assessmentYear ? parseInt(assessmentYear, 10) : null,
        {
          onTierComplete: (tier, data) => {
            console.log(`✅ ${tier} loaded, updating UI...`);
            // Trigger UI update for this tier
            this.controller?.updateTierData?.(tier, data);
          }
        }
      );

      // Wait only for Tier 1 (critical data) to return initial model
      const tier1Data = await progressiveLoader.tier1;
      const property = tier1Data.property;

      // Safety check: ensure we have property data
      if (!property) {
        console.error('No property data returned from Tier 1');
        throw new Error('Property data not found');
      }

      // Start prefetching in background
      this.startBackgroundPrefetching(property_id, cardNumber, assessmentYear);

      // Load Tier 2 (assessment) with a reasonable timeout for immediate display
      let assessment = null;
      let currentYear = assessmentYear || new Date().getFullYear();

      try {
        const tier2Data = await Promise.race([
          progressiveLoader.tier2,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Tier 2 timeout')), 1000))
        ]);
        assessment = tier2Data.assessment;
      } catch (error) {
        console.log('Tier 2 loading delayed, will update UI when ready');
        // Continue loading in background
        progressiveLoader.tier2.then(tier2Data => {
          assessment = tier2Data.assessment;
          this.controller?.updateTierData?.('tier2', tier2Data);
        });
      }

      // Return initial model with Tier 1 data and placeholders
      // Historical data will be loaded in background and update UI when ready
      const initialModel = {
        property: this.enhancePropertyData(property, assessment, currentYear, cardNumber),
        assessment: assessment ? this.enhanceAssessmentData(assessment) : null,
        lastChangedAssessment: null, // Will be populated when Tier 3 loads
        assessmentHistory: [], // Will be populated when Tier 3 loads
        salesHistory: [],
        listingHistory: [],
        propertyNotes: { notes: '' },
        showPropertySelection: false,
        // Progressive loading state
        progressiveLoader,
        isLoadingTier2: !assessment,
        isLoadingTier3: true,
        isLoadingTier4: true,
        loadingStartTime: Date.now()
      };

      // Continue loading remaining tiers in background
      this.loadRemainingTiersInBackground(progressiveLoader, currentYear, initialModel);

      return initialModel;
    } catch (error) {
      console.error('Failed to load property assessment:', {
        error: error.message,
        stack: error.stack,
        propertyId: property_id,
        cardNumber,
        assessmentYear,
        municipalityId
      });
      this.router.transitionTo('municipality.assessing.properties');
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Store route reference for refresh functionality
    controller.generalRoute = this;

    // Ensure current user permissions are updated
    // This fixes the issue where edit buttons don't appear on first navigation
    this.currentUser._updateCurrentPermissions();

    // Setup controller with model data for listing history, sales, and notes
    controller.setupController(model);
  }

  /**
   * Enhance property data with assessment values
   */
  enhancePropertyData(property, assessment, currentYear, cardNumber) {
    const enhanced = {
      ...(property || {}),
      current_card: parseInt(cardNumber),
      taxYear: currentYear,
      tax_year: currentYear,
      // Use computed values from assessment if available, otherwise fallback to property values
      buildingValue:
        assessment?.building?.value ||
        assessment?.building ||
        assessment?.buildingValue ||
        property?.buildingValue ||
        0,
      landValue:
        assessment?.land?.value ||
        assessment?.land ||
        assessment?.landValue ||
        property?.landValue ||
        0,
      otherValue:
        assessment?.other_improvements?.value ||
        assessment?.features ||
        assessment?.featuresValue ||
        assessment?.otherValue ||
        property?.otherValue ||
        0,
      totalValue:
        assessment?.total_value ||
        assessment?.total ||
        assessment?.totalAssessedValue ||
        property?.totalValue ||
        0,
      assessed_value:
        assessment?.total_value ||
        assessment?.total ||
        assessment?.totalAssessedValue ||
        property?.totalValue ||
        0,
    };

    // Update property selection service so other routes work correctly
    this.propertySelection.setSelectedProperty(enhanced);

    return enhanced;
  }

  /**
   * Enhance assessment data
   */
  enhanceAssessmentData(assessment) {
    return {
      ...(assessment || {}),
      // Placeholder values, will be updated when historical data loads
      lastChangedYear: null,
      previousBuildingValue: 0,
      previousLandValue: 0,
      previousOtherValue: 0,
      previousTotalValue: 0,
    };
  }

  /**
   * Load remaining tiers in background and update model
   */
  async loadRemainingTiersInBackground(progressiveLoader, currentYear, model) {
    try {
      // Load Tier 3 (history data) in background
      const tier3Data = await progressiveLoader.tier3;

      // Process assessment history to find last changed assessment
      const assessmentHistory = tier3Data.assessmentHistory || [];
      const currentTotalValue = model.assessment?.total_value || 0;
      let lastChangedAssessment = null;
      let lastChangedYear = currentYear;

      // Look through assessment history to find when the value last changed
      for (const historyItem of assessmentHistory) {
        if (
          historyItem.effective_year < currentYear &&
          historyItem.total_value !== currentTotalValue
        ) {
          lastChangedAssessment = historyItem;
          lastChangedYear = historyItem.effective_year;
          break;
        }
      }

      // If no different assessment found, use the most recent assessment before current year
      if (!lastChangedAssessment && assessmentHistory.length > 0) {
        const previousAssessments = assessmentHistory.filter(
          (h) => h.effective_year < currentYear,
        );
        if (previousAssessments.length > 0) {
          lastChangedAssessment = previousAssessments[0];
          lastChangedYear = lastChangedAssessment.effective_year;
        }
      }

      // Update assessment with historical comparison
      if (model.assessment && lastChangedAssessment) {
        model.assessment.lastChangedYear = lastChangedYear;
        model.assessment.previousBuildingValue =
          lastChangedAssessment?.building?.value ||
          lastChangedAssessment?.building ||
          lastChangedAssessment?.buildingValue ||
          0;
        model.assessment.previousLandValue =
          lastChangedAssessment?.land?.value ||
          lastChangedAssessment?.land ||
          lastChangedAssessment?.landValue ||
          0;
        model.assessment.previousOtherValue =
          lastChangedAssessment?.other_improvements?.value ||
          lastChangedAssessment?.features ||
          lastChangedAssessment?.featuresValue ||
          lastChangedAssessment?.otherValue ||
          0;
        model.assessment.previousTotalValue =
          lastChangedAssessment?.total_value ||
          lastChangedAssessment?.total ||
          lastChangedAssessment?.totalAssessedValue ||
          0;
      }

      // Update model with Tier 3 data
      Object.assign(model, {
        lastChangedAssessment,
        assessmentHistory,
        salesHistory: tier3Data.salesHistory || [],
        listingHistory: tier3Data.listingHistory || [],
        propertyNotes: tier3Data.propertyNotes || { notes: '' },
        isLoadingTier3: false
      });

      // Notify controller that Tier 3 is ready
      this.controller?.updateTierData?.('tier3', tier3Data);

    } catch (error) {
      console.warn('Tier 3 background loading failed:', error);
      model.isLoadingTier3 = false;
    }

    try {
      // Load Tier 4 (sketches, features) in background
      const tier4Data = await progressiveLoader.tier4;

      // Update model with Tier 4 data
      Object.assign(model, {
        sketches: tier4Data.sketches || [],
        features: tier4Data.features || [],
        isLoadingTier4: false
      });

      // Notify controller that Tier 4 is ready
      this.controller?.updateTierData?.('tier4', tier4Data);

    } catch (error) {
      console.warn('Tier 4 background loading failed:', error);
      model.isLoadingTier4 = false;
    }
  }

  /**
   * Start background prefetching for performance
   */
  startBackgroundPrefetching(propertyId, cardNumber, assessmentYear) {
    // Prefetch other cards for this property
    this.propertyPrefetch.smartPrefetch(propertyId, cardNumber, assessmentYear);

    // Prefetch adjacent properties (will be implemented when property list is available)
    // This would require access to the current property list context
  }
}
