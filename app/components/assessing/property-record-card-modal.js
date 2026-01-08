import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PropertyRecordCardModalComponent extends Component {
  @service('property-selection') propertySelection;
  @service assessing;
  @service municipality;
  @service('property-cache') propertyCache;
  @service realtime;

  @tracked isLoading = false;
  @tracked propertyData = null;
  @tracked cardData = [];
  @tracked lastLoadedPropertyId = null;
  @tracked sketchSubAreaFactors = [];
  sketchUpdateUnsubscribe = null;

  get selectedProperty() {
    return this.propertySelection.selectedProperty;
  }

  get assessmentYear() {
    // Use the same logic as sketch controller: fall back to property tax year instead of current year
    return (
      this.municipality.selectedAssessmentYear ||
      this.selectedProperty?.tax_year
    );
  }

  get municipalityName() {
    return this.municipality.currentMunicipality || null;
  }

  _hasInitialized = false;

  constructor() {
    super(...arguments);

    // Don't load data on construction - wait until modal is opened
    // This prevents unnecessary API calls on every page load

    // Set up realtime listener for immediate sketch updates
    this.sketchUpdateUnsubscribe = this.realtime.on(
      'sketch:updated',
      (data) => {
        // Only refresh if this property is affected and modal is open
        if (this.args.isOpen && data.propertyId === this.selectedProperty?.id) {
          this.refreshData();
        }
      },
    );
  }

  /**
   * Initialize data when modal is first opened
   * Called from template to trigger lazy loading
   */
  get shouldInitialize() {
    if (this.args.isOpen && !this._hasInitialized) {
      this._hasInitialized = true;
      // Use setTimeout to avoid triggering during render
      setTimeout(() => {
        this.loadSketchSubAreaFactors();
        if (this.selectedProperty) {
          this.loadPropertyData();
        }
      }, 0);
    }
    return this._hasInitialized;
  }

  willDestroy() {
    super.willDestroy();
    // Clean up realtime event listener
    if (this.sketchUpdateUnsubscribe) {
      this.sketchUpdateUnsubscribe();
    }
  }

  @action
  closeModal() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  printCard() {
    // Simple approach: Just print the modal as-is, let CSS handle hiding chrome
    // The modal pages are already sized correctly (8in high with 0.25in margins)

    // Detect Safari for orientation reminder
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isSafari) {
      const confirmed = window.confirm(
        'Safari Print Notice:\n\n' +
        'Please select "Landscape" orientation in the print dialog for proper formatting.\n\n' +
        'Click OK to continue to print, or Cancel to go back.'
      );
      if (!confirmed) {
        return;
      }
    }

    // Just print - let the print CSS in printing.css handle everything
    window.print();
  }

  async loadSketchSubAreaFactors() {
    try {
      const response = await this.assessing.getSketchSubAreaFactors();

      // Handle different API response formats (same logic as sketch-edit-modal)
      if (
        Array.isArray(response) &&
        response.length > 0 &&
        response[0].sketchSubAreaFactors
      ) {
        this.sketchSubAreaFactors = response[0].sketchSubAreaFactors;
      } else if (Array.isArray(response)) {
        this.sketchSubAreaFactors = response;
      } else {
        this.sketchSubAreaFactors = response?.sketchSubAreaFactors || [];
      }
    } catch (error) {
      console.error(
        'Error loading sketch sub area factors for GLA calculation:',
        error,
      );
      this.sketchSubAreaFactors = [];
    }
  }

  // Clear cached data when switching properties
  clearCachedData() {
    this.cardData = [];
    this.propertyData = null;
  }

  @action
  refreshData() {
    // Force refresh by clearing cached data and reloading with forceRefresh
    this.clearCachedData();
    this.lastLoadedPropertyId = null;

    if (this.selectedProperty) {
      // Clear IndexedDB cache for land assessments
      if (this.assessing.localApi && this.assessing.localApi.clearCache) {
        for (let cardNumber = 1; cardNumber <= this.totalCards; cardNumber++) {
          const cacheKey = `_properties_${this.selectedProperty.id}_assessment_land_card_${cardNumber}`;
          try {
            this.assessing.localApi.clearCache(cacheKey);
            console.log(
              `✅ Cleared land assessment cache for card ${cardNumber}`,
            );
          } catch (e) {
            console.warn(`Failed to clear cache key: ${cacheKey}`, e);
          }
        }
      }

      // Only clear property record card specific cache, preserve edit modal cache
      this.assessing.clearSketchCache(
        this.selectedProperty.id,
        this.selectedProperty.current_card,
        { skipEditModal: true },
      );
      // Force refresh bypasses all caches
      this.performDataLoading(true);
    }
  }

  get totalCards() {
    return this.selectedProperty?.cards?.total_cards || 1;
  }

  // Getter to trigger data loading and handle property changes
  get triggerDataLoading() {
    // Check if property has changed or if we have no data
    const currentPropertyId = this.selectedProperty?.id;
    const propertyChanged = currentPropertyId !== this.lastLoadedPropertyId;
    const needsData = this.cardData.length === 0;

    if (
      this.selectedProperty &&
      (propertyChanged || needsData) &&
      !this.isLoading
    ) {
      // Use setTimeout to avoid reactivity issues by deferring to next tick
      setTimeout(() => {
        // Double-check conditions in case they changed
        const stillCurrentPropertyId = this.selectedProperty?.id;
        const stillPropertyChanged =
          stillCurrentPropertyId !== this.lastLoadedPropertyId;
        const stillNeedsData = this.cardData.length === 0;

        if (
          this.selectedProperty &&
          (stillPropertyChanged || stillNeedsData) &&
          !this.isLoading
        ) {
          // Clear cached data if property changed
          if (stillPropertyChanged) {
            this.clearCachedData();
            // Also clear IndexedDB cache for land assessments
            if (this.assessing.localApi && this.assessing.localApi.clearCache) {
              for (
                let cardNumber = 1;
                cardNumber <= this.totalCards;
                cardNumber++
              ) {
                const cacheKey = `_properties_${this.selectedProperty.id}_assessment_land_card_${cardNumber}`;
                try {
                  this.assessing.localApi.clearCache(cacheKey);
                  console.log(
                    `✅ Cleared land assessment cache for card ${cardNumber} on property change`,
                  );
                } catch (e) {
                  console.warn(`Failed to clear cache key: ${cacheKey}`, e);
                }
              }
            }
          }
          this.loadPropertyData();
        }
      }, 0);
    }
    return null; // Return null so template doesn't render anything
  }

  async performDataLoading(forceRefresh = false) {
    if (!this.selectedProperty) return;

    this.isLoading = true;

    try {
      const totalCards = this.totalCards;
      const cardPromises = [];

      // Load data for all cards
      for (let cardNumber = 1; cardNumber <= totalCards; cardNumber++) {
        cardPromises.push(this.loadCardData(cardNumber, forceRefresh));
      }

      const cardDataResults = await Promise.all(cardPromises);
      this.cardData = cardDataResults;
      this.propertyData = this.selectedProperty;
      this.lastLoadedPropertyId = this.selectedProperty.id;
    } catch (error) {
      console.error('Error loading property data for record card:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadCardData(cardNumber, forceRefresh = false) {
    try {
      const [
        landData,
        buildingData,
        featuresData,
        sketchData,
        assessmentHistory,
      ] = await Promise.all([
        this.loadLandAssessment(cardNumber, forceRefresh),
        this.loadBuildingAssessment(cardNumber),
        this.loadPropertyFeatures(cardNumber),
        this.loadSketchData(cardNumber, forceRefresh),
        this.loadAssessmentHistory(cardNumber),
      ]);

      return {
        cardNumber,
        landAssessment: landData,
        buildingAssessment: buildingData,
        propertyFeatures: {
          features: featuresData,

          // categories: [
          //   { name: 'Exterior Features', type: 'exterior' },
          //   { name: 'Interior Features', type: 'interior' },
          //   { name: 'Site Features', type: 'site' },
          //   { name: 'Utilities', type: 'utilities' },
          // ],
        },
        sketchData: sketchData,
        assessmentHistory: assessmentHistory || [],
      };
    } catch (error) {
      console.error(`Error loading data for card ${cardNumber}:`, error);
      return {
        cardNumber,
        landAssessment: null,
        buildingAssessment: null,
        propertyFeatures: {
          features: [],
          // categories: [
          //   { name: 'Exterior Features', type: 'exterior' },
          //   { name: 'Interior Features', type: 'interior' },
          //   { name: 'Site Features', type: 'site' },
          //   { name: 'Utilities', type: 'utilities' },
          // ],
        },
        sketchData: [],
        assessmentHistory: [],
      };
    }
  }

  async loadAssessmentHistory(cardNumber) {
    try {
      const response = await this.assessing.localApi.get(
        `/properties/${this.selectedProperty.id}/assessment-history?card=${cardNumber}`,
      );

      // Extract assessment history from response
      const history = response?.assessment_history || response || [];

      console.log(`🎯 Assessment History for card ${cardNumber}:`, {
        yearsCount: history.length,
        years: history.map((h) => h.year),
        firstYear: history[0],
      });

      return history;
    } catch (error) {
      console.error('Error loading assessment history:', error);
      return [];
    }
  }

  // Keep the original method for constructor use
  async loadPropertyData(forceRefresh = false) {
    return this.performDataLoading(forceRefresh);
  }

  async loadLandAssessment(cardNumber, forceRefresh = false) {
    try {
      const options = forceRefresh ? { skipCache: true } : {};
      const response = await this.assessing.getLandAssessmentForYear(
        this.selectedProperty.id,
        cardNumber,
        this.assessmentYear,
        options,
      );

      // If we got a response from cache without waterfront_details field, force refresh
      if (
        !forceRefresh &&
        response?.assessment &&
        !response.assessment.hasOwnProperty('waterfront_details')
      ) {
        console.log(
          '⚠️ Property Record Card: Cached data missing waterfront_details, refreshing...',
        );
        return this.loadLandAssessment(cardNumber, true);
      }

      return response;
    } catch (error) {
      console.error('Error loading land assessment:', error);
      return null;
    }
  }

  async loadBuildingAssessment(cardNumber) {
    try {
      const response = await this.assessing.getBuildingAssessmentForYear(
        this.selectedProperty.id,
        cardNumber,
        this.assessmentYear,
      );
      return response;
    } catch (error) {
      console.error(
        `Error loading building assessment for card ${cardNumber}:`,
        {
          propertyId: this.selectedProperty.id,
          cardNumber,
          assessmentYear: this.assessmentYear,
          error: error.message,
          stack: error.stack,
          response: error.response?.data || 'No response data',
        },
      );

      // For properties without buildings, this is expected - return null gracefully
      if (
        error.response?.status === 500 &&
        error.message?.includes('Failed to get building assessment')
      ) {
        console.warn(
          `Property ${this.selectedProperty.id} card ${cardNumber} appears to have no building data - this is normal for land-only properties`,
        );
        return null;
      }

      return null;
    }
  }

  async loadPropertyFeatures(cardNumber) {
    try {
      const response = await this.assessing.getPropertyFeaturesForYear(
        this.selectedProperty.id,
        cardNumber,
        this.assessmentYear,
      );
      console.log(response);

      // Extract features array from API response
      const features = response?.features || response || [];

      return features;
    } catch (error) {
      console.error('Error loading property features:', error);
      return [];
    }
  }

  async loadSketchData(cardNumber, forceRefresh = false) {
    try {
      const options = forceRefresh ? { forceRefresh: true } : {};

      const response = await this.assessing.getPropertySketchesForYear(
        this.selectedProperty.id,
        cardNumber,
        this.assessmentYear,
        options,
      );

      const sketches = response?.sketches || response || [];

      // Apply the same deduplication logic as the sketch controller
      const deduplicatedSketches = this.deduplicateSketches(
        sketches,
        cardNumber,
      );

      // Process sketches to ensure proper totals are calculated
      const processedSketches = deduplicatedSketches.map((sketch) =>
        this.ensureSketchTotals(sketch),
      );

      return processedSketches;
    } catch (error) {
      console.error('Error loading sketch data:', error);
      return [];
    }
  }

  // Deduplicate sketches using the same logic as the sketch controller
  deduplicateSketches(sketches, cardNumber) {
    if (!sketches || sketches.length === 0) {
      return [];
    }

    // Filter sketches for the current property and card
    let cardSketches = sketches.filter(
      (s) =>
        s.card_number === cardNumber &&
        s.property_id === this.selectedProperty.id,
    );

    // Deduplicate sketches - prefer ones with actual IDs over undefined IDs
    if (cardSketches.length > 1) {
      // Sort by: has ID first, then by shapes count, then by most recent update
      const sortedSketches = cardSketches.sort((a, b) => {
        // Prefer sketches with real IDs
        if (a.id && !b.id) return -1;
        if (!a.id && b.id) return 1;

        // Then prefer sketches with more shapes
        const aShapes = a.shapes?.length || 0;
        const bShapes = b.shapes?.length || 0;
        if (aShapes !== bShapes) return bShapes - aShapes;

        // Then prefer more recent updates
        const aUpdated = new Date(a.updated_at || 0);
        const bUpdated = new Date(b.updated_at || 0);
        if (aUpdated !== bUpdated) return bUpdated - aUpdated;

        // Finally, prefer higher version numbers
        const aVersion = a.__v || 0;
        const bVersion = b.__v || 0;
        return bVersion - aVersion;
      });

      // Return only the best sketch
      cardSketches = [sortedSketches[0]];
    }

    return cardSketches;
  }

  // Helper method to ensure sketch has proper totals calculated
  ensureSketchTotals(sketch) {
    if (!sketch || !sketch.shapes) return sketch;

    // Default area description rates (matching the sketch controller)
    const defaultRates = new Map([
      ['HSF', 0.5], // Half Story Finished
      ['FFF', 1.0], // Full Floor Finished
      ['BMU', 0.75], // Basement Unfinished
      ['BMF', 1.0], // Basement Finished
      ['ATU', 0.5], // Attic Unfinished
      ['ATF', 0.75], // Attic Finished
      ['GAR', 0.25], // Garage
      ['POR', 0.1], // Porch
      ['DEC', 0.1], // Deck
      ['BAL', 0.1], // Balcony
    ]);

    // Process each shape to ensure it has effective areas calculated
    const processedShapes = sketch.shapes.map((shape) => {
      if (!shape.descriptions || shape.descriptions.length === 0) {
        return {
          ...shape,
          descriptions: [],
          effective_areas: {},
          total_effective_area: 0,
        };
      }

      // Handle both old and new description formats
      let effectiveAreas = {};
      let totalEffectiveArea = 0;

      if (shape.descriptions.length > 0) {
        if (typeof shape.descriptions[0] === 'string') {
          // Old format: descriptions are strings, calculate effective areas
          shape.descriptions.forEach((desc) => {
            const rate = defaultRates.get(desc.toUpperCase()) || 1.0;
            effectiveAreas[desc] = Math.round((shape.area || 0) * rate);
          });
          totalEffectiveArea = Object.values(effectiveAreas).reduce(
            (sum, area) => sum + area,
            0,
          );
        } else {
          // New format: descriptions are objects with {label, effective_area}
          shape.descriptions.forEach((desc) => {
            if (desc && desc.label) {
              effectiveAreas[desc.label] = desc.effective_area || 0;
            }
          });
          totalEffectiveArea = Object.values(effectiveAreas).reduce(
            (sum, area) => sum + area,
            0,
          );
        }
      }

      return {
        ...shape,
        effective_areas: effectiveAreas,
        total_effective_area: totalEffectiveArea,
      };
    });

    // Calculate sketch-level totals
    // Total area should be shape area × number of descriptions for that shape
    const totalArea = processedShapes.reduce((sum, shape) => {
      const shapeArea = shape.area || 0;
      const descriptionsCount = shape.descriptions?.length || 0;
      // If no descriptions, count the shape area once
      // If descriptions exist, count area × descriptions (e.g., 400 sq ft × 2 descriptions = 800 sq ft)
      return sum + shapeArea * Math.max(descriptionsCount, 1);
    }, 0);
    const totalEffectiveArea = processedShapes.reduce(
      (sum, shape) => sum + (shape.total_effective_area || 0),
      0,
    );

    // Calculate GLA (Gross Living Area) - sum effective areas for descriptions where livingSpace is true
    const totalGLA = processedShapes.reduce((sum, shape) => {
      if (!shape.descriptions || shape.descriptions.length === 0) {
        return sum;
      }

      return (
        sum +
        shape.descriptions.reduce((shapeGLASum, desc) => {
          const descLabel = typeof desc === 'string' ? desc : desc.label;
          if (!descLabel) return shapeGLASum;

          // Find the corresponding factor to check if it's living space
          const factor = this.sketchSubAreaFactors.find(
            (f) => f.displayText?.toUpperCase() === descLabel.toUpperCase(),
          );

          if (factor && factor.livingSpace) {
            // For living space descriptions, add the effective area
            const effectiveArea =
              typeof desc === 'string'
                ? shape.effective_areas?.[desc] || 0
                : desc.effective_area || 0;
            return shapeGLASum + effectiveArea;
          }

          return shapeGLASum;
        }, 0)
      );
    }, 0);

    return {
      ...sketch,
      shapes: processedShapes,
      total_area: Math.round(totalArea),
      total_effective_area: Math.round(totalEffectiveArea),
      total_gla: Math.round(totalGLA),
    };
  }
}
