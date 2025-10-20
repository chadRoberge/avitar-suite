import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingLandPropertyRoute extends Route {
  @service assessing;
  @service router;
  @service('property-selection') propertySelection;
  @service('current-user') currentUser;

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

      // Load property with card info, land assessment data (includes views), and current assessment totals
      const [propertyResponse, landAssessmentResponse] = await Promise.all([
        this.assessing.getPropertyWithCard(property_id, cardNumber),
        this.assessing.getLandAssessmentForYear(
          property_id,
          cardNumber,
          assessmentYear,
        ), // Use year-aware method
      ]);

      // Debug logs removed to prevent potential issues

      // Get current total assessment to update property header
      let currentAssessment = null;
      try {
        currentAssessment = await this.assessing.getCurrentAssessmentForYear(
          property_id,
          cardNumber,
          assessmentYear,
        );
        // Debug logging removed
      } catch (error) {
        console.warn('Could not load current assessment totals:', error);
      }

      // Create a clean copy of the property with the current card
      const property = propertyResponse.property || propertyResponse;
      const cleanProperty = JSON.parse(JSON.stringify(property));
      cleanProperty.current_card = parseInt(cardNumber);

      // Ensure cards information is preserved for navigation
      if (property.cards) {
        cleanProperty.cards = property.cards;
      }

      // Update property with current assessment total for header display
      if (currentAssessment) {
        // Fix: Use the same property path as the general route
        const assessment = currentAssessment.assessment || currentAssessment;

        // Extract individual component values ONLY from the card-specific assessment
        // Do NOT fall back to property-level values to avoid showing wrong card's data
        // Use nullish coalescing (??) for .value checks to handle 0 as a valid value
        const buildingValue =
          assessment?.building?.value ??
          (typeof assessment?.building === 'number' ? assessment.building : null) ??
          assessment?.calculated_totals?.buildingValue ??
          assessment?.buildingValue ??
          0;

        // Use land assessment data directly for accurate land taxable value
        const landAssessment =
          landAssessmentResponse.assessment || landAssessmentResponse;

        // Calculate land taxable value from land assessment calculated totals
        // For current use land: landMarketValue - totalCurrentUseCredit = land taxable value
        const landMarketValue =
          landAssessment?.calculated_totals?.landMarketValue ?? 0;
        const totalCurrentUseCredit =
          landAssessment?.calculated_totals?.totalCurrentUseCredit ?? 0;
        const landTaxableValueFromCalculation =
          landMarketValue - totalCurrentUseCredit;
        // Debug calculation logging removed

        const landValue =
          landTaxableValueFromCalculation !== 0 ? landTaxableValueFromCalculation :
          landAssessment?.taxable_value ??
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
        const cardTotalFromComponents = buildingValue + landValue + featuresValue;
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

        cleanProperty.current_card_assessment = currentCardAssessment;
        cleanProperty.assessed_value = parcelTotalValue;
        cleanProperty.tax_year = assessmentYear || new Date().getFullYear();
      }

      // Preserve cards data from currently selected property if not present in new data
      const currentProperty = this.propertySelection.selectedProperty;
      if (currentProperty && currentProperty.id === property.id && currentProperty.cards && !cleanProperty.cards) {
        console.log('🃏 Land route preserving cards data for property', property.id);
        cleanProperty.cards = currentProperty.cards;
      }

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(cleanProperty);

      // Create clean copies of assessment data
      const landAssessment =
        landAssessmentResponse.assessment || landAssessmentResponse;
      const cleanLandAssessment = landAssessment
        ? JSON.parse(JSON.stringify(landAssessment))
        : {};

      // Process views data from land assessment response
      const views = landAssessmentResponse?.views || [];
      const viewsArray = Array.isArray(views) ? views : [];

      // Process view attributes and zones data from land assessment response
      const viewAttributes = landAssessmentResponse?.viewAttributes || [];
      const zones = landAssessmentResponse?.zones || [];

      return {
        property: cleanProperty,
        landAssessment: cleanLandAssessment,
        landHistory: landAssessmentResponse.history
          ? [...landAssessmentResponse.history]
          : [],
        comparables: landAssessmentResponse.comparables
          ? [...landAssessmentResponse.comparables]
          : [],
        views: [...viewsArray],
        viewAttributes: [...viewAttributes],
        zones: [...zones],
        showPropertySelection: false,
      };
    } catch (error) {
      console.error('Failed to load land assessment:', error);
      this.router.transitionTo('municipality.assessing.properties');
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Store route reference for refresh functionality
    controller.landRoute = this;

    // Ensure current user permissions are updated
    // This fixes the issue where edit buttons don't appear on first navigation
    this.currentUser._updateCurrentPermissions();
  }
}
