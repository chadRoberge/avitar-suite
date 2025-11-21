import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsCreateRoute extends Route {
  @service session;
  @service('current-user') currentUser;
  @service municipality;
  @service notifications;
  @service router;
  @service('property-selection') propertySelection;

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    // Create a plain permit object (matching assessing module pattern)
    const permit = {
      municipalityId,
      status: 'draft',
      applicationDate: new Date(),
      estimatedValue: 0,
      squareFootage: 0,
      applicant: {},
      contractor: {},
      customFields: {},
      fees: [],
      documents: [],
    };

    // Get currently selected property from property tree
    const selectedProperty = this.propertySelection.selectedProperty;

    return {
      permit,
      municipalityId,
      selectedProperty,
    };
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.permit = model.permit;
    controller.municipalityId = model.municipalityId;
    controller.selectedProperty = model.selectedProperty;
    controller.resetForm();

    // Pre-populate property if one is selected
    if (model.selectedProperty) {
      controller.selectProperty(model.selectedProperty);
    }

    // Always start on step 1 (Select Permit Type)
    controller.currentStep = 1;

    // Load permit types
    controller.loadPermitTypes();
  }

  // Clean up if user navigates away
  resetController(controller, isExiting) {
    if (isExiting) {
      // Clear the permit object
      controller.permit = null;
      controller.selectedPermitType = null;
      controller.selectedProperty = null;
    }
  }
}
