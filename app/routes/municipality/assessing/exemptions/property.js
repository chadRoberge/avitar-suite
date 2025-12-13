import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingExemptionsPropertyRoute extends Route {
  @service assessing;
  @service router;
  @service api;
  @service('hybrid-api') hybridApi;
  @service municipality;
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
    try {
      const { property_id } = params;
      const cardNumber = transition.to.queryParams.card || 1;
      const assessmentYear = transition.to.queryParams.assessment_year;

      // Load property and its exemptions data for the specific card
      const [
        propertyResponse,
        exemptionsResponse,
        availableExemptionsResponse,
      ] = await Promise.all([
        this.assessing.getPropertyWithCard(property_id, cardNumber),
        this.getPropertyExemptions(property_id, cardNumber, assessmentYear),
        this.getAvailableExemptions(),
      ]);

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

      // Set the current card on the property for display
      const property = propertyResponse.property || propertyResponse;
      const cleanProperty = {
        ...property,
        current_card: parseInt(cardNumber),
      };

      // Update property with current assessment total for header display
      if (currentAssessment) {
        const assessment = currentAssessment.assessment || currentAssessment;

        // Extract individual component values ONLY from the card-specific assessment
        // Do NOT fall back to property-level values to avoid showing wrong card's data
        // Use nullish coalescing (??) for .value checks to handle 0 as a valid value
        const buildingValue =
          assessment?.building?.value ??
          (typeof assessment?.building === 'number'
            ? assessment.building
            : null) ??
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
          (typeof assessment?.features === 'number'
            ? assessment.features
            : null) ??
          assessment?.calculated_totals?.featuresValue ??
          assessment?.featuresValue ??
          assessment?.otherValue ??
          0;

        // Calculate CARD-SPECIFIC total from components
        // Only include land value for Card 1 (base land is parcel-level, only Card 1 gets it)
        const cardLandValue = parseInt(cardNumber) === 1 ? landValue : 0;
        const cardTotalFromComponents =
          buildingValue + cardLandValue + featuresValue;
        const cardProvidedTotal =
          assessment?.total_value ||
          assessment?.total ||
          assessment?.calculated_totals?.totalTaxableValue ||
          assessment?.totalTaxableValue ||
          assessment?.total_assessed_value ||
          0;

        // Card-specific assessment total
        const currentCardAssessment = Math.max(
          cardProvidedTotal,
          cardTotalFromComponents,
        );

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
      if (
        currentProperty &&
        currentProperty.id === cleanProperty.id &&
        currentProperty.cards &&
        !cleanProperty.cards
      ) {
        console.log(
          '🃏 Exemptions route preserving cards data for property',
          cleanProperty.id,
        );
        cleanProperty.cards = currentProperty.cards;
      }

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(cleanProperty);

      // Service layer could normalize these responses if needed
      return {
        property: cleanProperty,
        exemptions: exemptionsResponse.exemptions || [],
        availableExemptions:
          availableExemptionsResponse.exemptionTypes ||
          availableExemptionsResponse.exemptions ||
          [],
        exemptionHistory: exemptionsResponse.history || [],
        showPropertySelection: false,
      };
    } catch (error) {
      console.error('Failed to load property exemptions:', error);
      this.router.transitionTo('municipality.assessing.properties');
    }
  }

  async getPropertyExemptions(
    propertyId,
    cardNumber = 1,
    assessmentYear = null,
  ) {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const params = new URLSearchParams({ card: cardNumber });
      if (assessmentYear) {
        params.append('assessment_year', assessmentYear);
      }

      const response = await this.hybridApi.get(
        `/municipalities/${municipalityId}/properties/${propertyId}/exemptions?${params.toString()}`,
      );

      // Handle different response formats from HybridAPI vs direct API
      if (response?.success !== undefined) {
        // LocalAPI format: {success: true, exemptions: [...]}
        return {
          exemptions: response.exemptions || [],
          history: response.history || [],
        };
      } else if (Array.isArray(response)) {
        // Direct IndexedDB array format
        return {
          exemptions: response,
          history: [],
        };
      } else {
        // Direct API format: {exemptions: [...], history: [...]}
        return {
          exemptions: response?.exemptions || [],
          history: response?.history || [],
        };
      }
    } catch (error) {
      console.warn('Failed to load property exemptions:', error);
      return { exemptions: [], history: [] };
    }
  }

  async getAvailableExemptions() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const response = await this.hybridApi.get(
        `/municipalities/${municipalityId}/exemption-types`,
      );

      // Handle different response formats from HybridAPI vs direct API
      if (response?.success !== undefined) {
        // LocalAPI format: {success: true, exemptionTypes: [...]}
        return {
          exemptionTypes: response.exemptionTypes || response.exemptions || [],
        };
      } else if (Array.isArray(response)) {
        // Direct IndexedDB array format
        return {
          exemptionTypes: response,
        };
      } else {
        // Direct API format: {exemptionTypes: [...]} or {exemptions: [...]}
        return {
          exemptionTypes:
            response?.exemptionTypes || response?.exemptions || [],
        };
      }
    } catch (error) {
      console.warn('Failed to load available exemptions:', error);
      return { exemptionTypes: [] };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Store route reference for refresh functionality
    controller.exemptionsRoute = this;

    // Initialize exemptions in controller
    controller.setupExemptions();
  }
}
