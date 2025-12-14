import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsFindRoute extends Route {
  @service('hybrid-api') hybridApi;
  @service('current-user') currentUser;
  @service municipality;
  @service router;

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    if (!municipalityId) {
      console.error('No municipality selected');
      this.router.transitionTo('municipality.building-permits');
      throw new Error('No municipality selected');
    }

    try {
      // Load all properties for the municipality (basic info only)
      const response = await this.hybridApi.get(
        `/municipalities/${municipalityId}/properties`,
      );

      return {
        properties: response.properties || response || [],
        municipalityId,
      };
    } catch (error) {
      console.error('Failed to load properties:', error);
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
