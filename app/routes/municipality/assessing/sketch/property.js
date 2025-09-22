import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingSketchPropertyRoute extends Route {
  @service assessing;
  @service router;
  @service('property-selection') propertySelection;

  queryParams = {
    card: {
      refreshModel: true,
    },
  };

  async model(params, transition) {
    try {
      const { property_id } = params;
      const cardNumber = transition.to.queryParams.card || 1;

      // Clear sketch cache to prevent stale data when switching properties
      this.assessing.clearSketchCache(property_id, cardNumber);

      // Load property data
      const propertyResponse = await this.assessing.getPropertyWithCard(
        property_id,
        cardNumber,
      );

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
