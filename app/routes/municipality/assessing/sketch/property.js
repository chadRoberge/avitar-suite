import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSketchPropertyRoute extends Route {
  @service assessing;
  @service router;
  @service('property-selection') propertySelection;
  @service('property-cache') propertyCache;

  queryParams = {
    card: {
      refreshModel: true,
    },
  };

  async model(params, transition) {
    try {
      const { property_id } = params;
      const cardNumber = transition.to.queryParams.card || 1;

      // Clear both sketch cache and property cache to ensure no stale data
      // This prevents sketch data from previous property from showing up
      this.assessing.clearSketchCache(property_id, cardNumber, {
        skipPropertyRecord: true,
      });

      // Also invalidate property cache for sketch data to ensure clean state
      this.propertyCache.invalidate(property_id, cardNumber);

      console.log(
        '🧹 Cleared sketch and property cache for navigation to property:',
        property_id,
      );

      // Load property data
      const propertyResponse = await this.assessing.getPropertyWithCard(
        property_id,
        cardNumber,
      );

      // Get current total assessment to update property header
      let currentAssessment = null;
      try {
        currentAssessment = await this.assessing.getCurrentAssessmentForYear(
          property_id,
          cardNumber,
          null,
        );
        console.log('🔍 Sketch route - Fetched assessment for card:', {
          propertyId: property_id,
          cardNumber,
          hasAssessment: !!currentAssessment,
        });
      } catch (error) {
        console.warn('Could not load current assessment totals:', error);
      }

      // Load sketch data for the current year
      const sketchResponse = await this.assessing.getPropertySketchesForYear(
        property_id,
        cardNumber,
        null,
      );

      // Set the current card on the property for display
      const property = propertyResponse.property || propertyResponse;
      const cleanProperty = JSON.parse(JSON.stringify(property));
      cleanProperty.current_card = parseInt(cardNumber);

      // Ensure cards information is preserved for navigation
      if (property.cards) {
        cleanProperty.cards = property.cards;
      } else {
        // Try to get cards data from property selection service as fallback
        const serviceProperty = this.propertySelection.selectedProperty;
        if (serviceProperty?.cards) {
          cleanProperty.cards = serviceProperty.cards;
          console.log('🃏 Sketch route - Using cards data from service:', cleanProperty.cards);
        }
      }

      // Update property with current assessment total for header display
      if (currentAssessment) {
        // Fix: Use the same property path as the general route
        const assessment = currentAssessment.assessment || currentAssessment;

        console.log('🔍 Sketch route - Card assessment data:', {
          propertyId: property_id,
          cardNumber,
          assessment,
          hasBuilding: !!assessment?.building,
          hasLand: !!assessment?.land,
          hasFeatures: !!assessment?.other_improvements,
        });

        // Extract individual component values ONLY from the card-specific assessment
        // Do NOT fall back to property-level values to avoid showing wrong card's data
        // Use nullish coalescing (??) for .value checks to handle 0 as a valid value
        const buildingValue =
          assessment?.building?.value ??
          (typeof assessment?.building === 'number' ? assessment.building : null) ??
          assessment?.calculated_totals?.buildingValue ??
          assessment?.buildingValue ??
          0;

        const landValue =
          assessment?.land?.value ??
          (typeof assessment?.land === 'number' ? assessment.land : null) ??
          assessment?.calculated_totals?.landTaxableValue ??
          assessment?.landValue ??
          0;

        const featuresValue =
          assessment?.other_improvements?.value ??
          (typeof assessment?.features === 'number' ? assessment.features : null) ??
          assessment?.calculated_totals?.featuresValue ??
          assessment?.featuresValue ??
          assessment?.otherValue ??
          0;

        // Calculate CARD-SPECIFIC total from components
        // Only include land value for Card 1 (base land is parcel-level, only Card 1 gets it)
        const cardLandValue = parseInt(cardNumber) === 1 ? landValue : 0;
        const cardTotalFromComponents = buildingValue + cardLandValue + featuresValue;
        const cardProvidedTotal =
          assessment?.total_value ||
          assessment?.total ||
          assessment?.calculated_totals?.totalTaxableValue ||
          assessment?.totalTaxableValue ||
          assessment?.total_assessed_value ||
          0;

        // Card-specific assessment total
        const currentCardAssessment = Math.max(cardProvidedTotal, cardTotalFromComponents);

        // PARCEL total (sum of all cards) - use assessment_summary if available
        const parcelTotalValue =
          property.assessment_summary?.total_value ||
          property.assessed_value ||
          currentCardAssessment;

        console.log('🔍 Sketch route - Calculated values:', {
          cardNumber,
          buildingValue,
          landValue,
          featuresValue,
          cardTotalFromComponents,
          currentCardAssessment,
          parcelTotalValue,
        });

        cleanProperty.current_card_assessment = currentCardAssessment;
        cleanProperty.assessed_value = parcelTotalValue;
        cleanProperty.tax_year = new Date().getFullYear();
      } else {
        console.warn('⚠️ Sketch route - No assessment data found for card', cardNumber);
        // Set card assessment to 0 if no data
        cleanProperty.current_card_assessment = 0;
        // Still use parcel total from assessment_summary
        cleanProperty.assessed_value = property.assessment_summary?.total_value || property.assessed_value || 0;
      }

      // Final preservation check: ensure cards data is not lost
      const currentProperty = this.propertySelection.selectedProperty;
      if (currentProperty && currentProperty.id === cleanProperty.id && currentProperty.cards && !cleanProperty.cards) {
        console.log('🃏 Sketch route final preservation - adding cards data for property', cleanProperty.id);
        cleanProperty.cards = currentProperty.cards;
      }

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(cleanProperty);

      return {
        property: cleanProperty,
        sketches: sketchResponse.sketches || [],
        areaDescriptions: sketchResponse.areaDescriptions || [],
        showPropertySelection: false,
      };
    } catch (error) {
      console.error('Failed to load property sketches:', error);
      this.router.transitionTo('municipality.assessing.properties');
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Store route reference for refresh functionality
    controller.sketchRoute = this;

    // Initialize sketches in controller
    controller.setupSketches();
  }
}
