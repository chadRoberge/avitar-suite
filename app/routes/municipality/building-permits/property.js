import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsPropertyRoute extends Route {
  @service assessing;
  @service('current-user') currentUser;
  @service('property-selection') propertySelection;
  @service router;

  async model(params) {
    const { property_id } = params;

    try {
      const response = await this.assessing.getProperty(property_id);
      const property = response.property || response;

      // Update property selection service so other routes work correctly
      this.propertySelection.setSelectedProperty(property);

      return property;
    } catch (error) {
      console.error('Failed to load property:', error);
      this.router.transitionTo('municipality.building-permits');
      throw error;
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
