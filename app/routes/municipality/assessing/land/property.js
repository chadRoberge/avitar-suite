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

      // Load property with card info and land assessment data (parcel-level, not card-specific)
      const [propertyResponse, landAssessmentResponse] = await Promise.all([
        this.assessing.getPropertyWithCard(property_id, cardNumber),
        this.assessing.getLandAssessmentForYear(property_id, 1, assessmentYear), // Use year-aware method
      ]);

      // Create a clean copy of the property with the current card
      const property = propertyResponse.property || propertyResponse;
      const cleanProperty = JSON.parse(JSON.stringify(property));
      cleanProperty.current_card = parseInt(cardNumber);

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(cleanProperty);

      // Create clean copies of assessment data
      const landAssessment =
        landAssessmentResponse.assessment || landAssessmentResponse;
      const cleanLandAssessment = landAssessment
        ? JSON.parse(JSON.stringify(landAssessment))
        : {};

      return {
        property: cleanProperty,
        landAssessment: cleanLandAssessment,
        landHistory: landAssessmentResponse.history
          ? [...landAssessmentResponse.history]
          : [],
        comparables: landAssessmentResponse.comparables
          ? [...landAssessmentResponse.comparables]
          : [],
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
