import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsFindRoute extends Route {
  @service('hybrid-api') hybridApi;
  @service('current-user') currentUser;
  @service municipality;
  @service('property-selection') propertySelection;
  @service router;

  queryParams = {
    property_id: {
      refreshModel: false
    }
  };

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    if (!municipalityId) {
      console.error('No municipality selected');
      this.router.transitionTo('municipality.building-permits');
      throw new Error('No municipality selected');
    }

    return {
      municipalityId,
    };
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Load permits for the selected property
    if (this.propertySelection.selectedProperty) {
      controller.loadPermitsForProperty(this.propertySelection.selectedProperty.id);
    }
  }

  beforeModel() {
    // Check if user has read access to building permits module
    if (!this.currentUser.hasModulePermission('building_permit', 'read')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error('You do not have permission to view building permits');
    }
  }
}
