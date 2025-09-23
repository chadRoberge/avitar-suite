import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingGeneralPropertyRoute extends Route {
  @service assessing;
  @service router;
  @service api;
  @service municipality;
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
      const municipalityId = this.municipality.currentMunicipality?.id;

      // Use optimized single call to load all property data
      const data = await this.assessing.getPropertyFullData(
        property_id,
        cardNumber,
        assessmentYear ? parseInt(assessmentYear, 10) : null
      );

      // Extract data from optimized response
      const property = data.property;
      const assessment = data.assessment;
      const assessmentHistory = data.assessmentHistory;

      // Find the last assessment that was different from current assessment
      const currentTotalValue =
        assessment?.total_value ||
        assessment?.total ||
        assessment?.totalAssessedValue ||
        0;
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
          lastChangedAssessment = previousAssessments[0]; // Already sorted by effective_year desc
          lastChangedYear = lastChangedAssessment.effective_year;
        }
      }

      // Enhance property with current assessment component values
      const cleanProperty = {
        ...property,
        current_card: parseInt(cardNumber),
        taxYear: currentYear,
        // Use computed values from assessment if available, otherwise fallback to property values
        buildingValue:
          assessment?.building?.value ||
          assessment?.building ||
          assessment?.buildingValue ||
          property.buildingValue ||
          0,
        landValue:
          assessment?.land?.value ||
          assessment?.land ||
          assessment?.landValue ||
          property.landValue ||
          0,
        otherValue:
          assessment?.other_improvements?.value ||
          assessment?.features ||
          assessment?.featuresValue ||
          assessment?.otherValue ||
          property.otherValue ||
          0,
        totalValue:
          assessment?.total_value ||
          assessment?.total ||
          assessment?.totalAssessedValue ||
          property.totalValue ||
          0,
      };

      // Enhanced assessment data with last changed assessment comparison
      const enhancedAssessment = {
        ...(assessment || {}),
        // Last changed assessment values for comparison
        lastChangedYear: lastChangedYear,
        previousBuildingValue:
          lastChangedAssessment?.building?.value ||
          lastChangedAssessment?.building ||
          lastChangedAssessment?.buildingValue ||
          0,
        previousLandValue:
          lastChangedAssessment?.land?.value ||
          lastChangedAssessment?.land ||
          lastChangedAssessment?.landValue ||
          0,
        previousOtherValue:
          lastChangedAssessment?.other_improvements?.value ||
          lastChangedAssessment?.features ||
          lastChangedAssessment?.featuresValue ||
          lastChangedAssessment?.otherValue ||
          0,
        previousTotalValue:
          lastChangedAssessment?.total_value ||
          lastChangedAssessment?.total ||
          lastChangedAssessment?.totalAssessedValue ||
          0,
      };

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(cleanProperty);

      return {
        property: cleanProperty,
        assessment: enhancedAssessment,
        lastChangedAssessment: lastChangedAssessment,
        assessmentHistory: assessmentHistory,
        salesHistory: data.salesHistory || property.salesHistory || [],
        listingHistory: data.listingHistory || [],
        propertyNotes: data.propertyNotes || {
          notes: '',
        },
        showPropertySelection: false,
      };
    } catch (error) {
      console.error('Failed to load property assessment:', error);
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
}
