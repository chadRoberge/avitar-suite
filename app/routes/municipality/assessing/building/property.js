import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingBuildingPropertyRoute extends Route {
  @service assessing;
  @service router;
  @service('property-selection') propertySelection;

  queryParams = {
    card: {
      refreshModel: true,
    },
    assessment_year: {
      refreshModel: true,
    },
  };

  async model(params, transition) {
    console.log('Building property route model() called');
    try {
      const { property_id } = params;
      const cardNumber = transition.to.queryParams.card || 1;
      const assessmentYear = transition.to.queryParams.assessment_year;
      console.log('Loading building property data for:', {
        property_id,
        cardNumber,
        assessmentYear,
      });

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
          assessmentYear,
        );
      } catch (error) {
        console.warn('Could not load current assessment totals:', error);
      }

      // Try to load building assessment data, but don't fail if it doesn't exist
      let buildingAssessmentResponse = null;
      try {
        buildingAssessmentResponse =
          await this.assessing.getBuildingAssessmentForYear(
            property_id,
            cardNumber,
            assessmentYear,
          );
      } catch (error) {
        console.warn(
          `No building assessment data found for property ${property_id}, card ${cardNumber}, year ${assessmentYear}:`,
          error.message || error,
        );
        // Create empty structure for missing building data
        buildingAssessmentResponse = {
          assessment: null,
          history: [],
          depreciation: {},
          improvements: [],
        };
      }

      // Create a clean copy of the property with the current card
      const property = propertyResponse.property || propertyResponse;
      console.log('🃏 Building route - Original property cards data:', property.cards);

      const cleanProperty = JSON.parse(JSON.stringify(property));
      cleanProperty.current_card = parseInt(cardNumber);

      // Ensure cards information is preserved for navigation
      if (property.cards) {
        cleanProperty.cards = property.cards;
        console.log('🃏 Building route - Preserved cards data:', cleanProperty.cards);
      } else {
        console.warn('🃏 Building route - No cards data found in property, checking service...');

        // Try to get cards data from property selection service as fallback
        const serviceProperty = this.propertySelection.selectedProperty;
        if (serviceProperty?.cards) {
          cleanProperty.cards = serviceProperty.cards;
          console.log('🃏 Building route - Using cards data from service:', cleanProperty.cards);
        } else {
          console.warn('🃏 Building route - No cards data available anywhere!');
        }
      }

      // Update property with current assessment total for header display
      if (currentAssessment) {
        // Fix: Use the same property path as the general route
        const assessment = currentAssessment.assessment || currentAssessment;

        console.log('🔍 Building route - Card assessment data:', {
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
        const currentCardAssessment =
          cardProvidedTotal > cardTotalFromComponents
            ? cardProvidedTotal
            : cardTotalFromComponents;

        // PARCEL total (sum of all cards) - use assessment_summary if available
        const parcelTotalValue =
          property.assessment_summary?.total_value ||
          property.assessed_value ||
          currentCardAssessment;

        console.log('🔍 Building route - Calculated values:', {
          cardNumber,
          buildingValue,
          landValue,
          featuresValue,
          cardTotalFromComponents,
          cardProvidedTotal,
          currentCardAssessment,
          parcelTotalValue,
        });

        cleanProperty.current_card_assessment = currentCardAssessment;
        cleanProperty.assessed_value = parcelTotalValue;
        cleanProperty.tax_year = assessmentYear || new Date().getFullYear();
      } else {
        console.warn('⚠️ Building route - No assessment data found for card', cardNumber);
        // Set card assessment to 0 if no data
        cleanProperty.current_card_assessment = 0;
        // Still use parcel total from assessment_summary
        cleanProperty.assessed_value = property.assessment_summary?.total_value || property.assessed_value || 0;
      }

      // Final preservation check: ensure cards data is not lost
      const currentProperty = this.propertySelection.selectedProperty;
      if (currentProperty && currentProperty.id === cleanProperty.id && currentProperty.cards && !cleanProperty.cards) {
        console.log('🃏 Building route final preservation - adding cards data for property', cleanProperty.id);
        cleanProperty.cards = currentProperty.cards;
      }

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(cleanProperty);

      console.log('Building assessment response:', buildingAssessmentResponse);

      // Handle both API response format (object with assessment/history/etc)
      // and direct BuildingAssessment object from cache
      let buildingAssessment = null;
      let buildingHistory = [];
      let depreciation = {};
      let improvements = [];

      if (buildingAssessmentResponse) {
        // Service layer normalizes response format
        buildingAssessment = buildingAssessmentResponse.assessment;
        buildingHistory = buildingAssessmentResponse.history || [];
        depreciation = buildingAssessmentResponse.depreciation || {};
        improvements = buildingAssessmentResponse.improvements || [];
      }

      const finalModel = {
        property: cleanProperty,
        buildingAssessment: buildingAssessment,
        buildingHistory: buildingHistory,
        depreciation: depreciation,
        improvements: improvements,
        showPropertySelection: false,
      };

      console.log('Final building model:', finalModel);
      console.log('Building assessment data:', finalModel.buildingAssessment);

      return finalModel;
    } catch (error) {
      console.error('Failed to load building assessment:', error);
      this.router.transitionTo('municipality.assessing.properties');
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Store route reference for refresh functionality
    controller.buildingRoute = this;
  }
}
