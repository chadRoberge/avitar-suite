import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingFeaturesPropertyRoute extends Route {
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
    try {
      const { property_id } = params;
      const cardNumber = transition.to.queryParams.card || 1;
      const assessmentYear = transition.to.queryParams.assessment_year;

      // Load property and its feature assessment data for the specific card
      const [propertyResponse, featuresResponse] = await Promise.all([
        this.assessing.getPropertyWithCard(property_id, cardNumber),
        this.assessing.getPropertyFeaturesForYear(
          property_id,
          cardNumber,
          assessmentYear,
        ),
      ]);

      // Set the current card on the property for display
      const property = propertyResponse.property || propertyResponse;
      const cleanProperty = {
        ...property,
        current_card: parseInt(cardNumber),
      };

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(cleanProperty);

      return {
        property: cleanProperty,
        features: featuresResponse.features || [],
        featureCategories: featuresResponse.categories || [],
        featureHistory: featuresResponse.history || [],
        showPropertySelection: false,
      };
    } catch (error) {
      console.error('Failed to load property features:', error);
      this.router.transitionTo('municipality.assessing.properties');
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Store route reference for refresh functionality
    controller.featuresRoute = this;

    // Initialize features in controller
    controller.setupFeatures();
  }
}
