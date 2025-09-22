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
      const cleanProperty = JSON.parse(JSON.stringify(property));
      cleanProperty.current_card = parseInt(cardNumber);

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(cleanProperty);

      console.log('Building assessment response:', buildingAssessmentResponse);

      const finalModel = {
        property: cleanProperty,
        buildingAssessment:
          buildingAssessmentResponse.assessment || buildingAssessmentResponse,
        buildingHistory: buildingAssessmentResponse.history || [],
        depreciation: buildingAssessmentResponse.depreciation || {},
        improvements: buildingAssessmentResponse.improvements || [],
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
