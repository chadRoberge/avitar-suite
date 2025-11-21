import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsInspectionsPropertyRoute extends Route {
  @service assessing;
  @service('current-user') currentUser;
  @service('property-selection') propertySelection;
  @service router;
  @service api;
  @service municipality;

  async model(params) {
    const { property_id } = params;

    try {
      // Load property data
      const response = await this.assessing.getProperty(property_id);
      const property = response.property || response;

      // Update property selection service
      this.propertySelection.setSelectedProperty(property);

      // Load inspections for this property
      const municipalityId = this.municipality.currentMunicipality?.id;
      const inspectionsData = await this.api.get(
        `/municipalities/${municipalityId}/properties/${property_id}/inspections`
      );

      return {
        property,
        inspections: inspectionsData.inspections || [],
      };
    } catch (error) {
      console.error('Failed to load property inspections:', error);
      this.router.transitionTo('municipality.building-permits.queue');
      throw error;
    }
  }

  beforeModel() {
    if (!this.currentUser.hasModulePermission('buildingPermits', 'read')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error('You do not have permission to view building permits');
    }
  }
}
