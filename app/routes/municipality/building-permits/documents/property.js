import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsDocumentsPropertyRoute extends Route {
  @service assessing;
  @service('current-user') currentUser;
  @service('property-selection') propertySelection;
  @service router;
  @service api;
  @service municipality;

  async model(params) {
    const { property_id } = params;

    console.log('📄 Documents property route - Loading for property:', property_id);

    try {
      // Load property data
      const response = await this.assessing.getProperty(property_id);
      const property = response.property || response;

      console.log('✅ Property loaded:', property);

      // Update property selection service
      this.propertySelection.setSelectedProperty(property);

      const municipalityId = this.municipality.currentMunicipality?.id;

      console.log('📡 Fetching files and permits for municipality:', municipalityId, 'property:', property_id);

      // Load files and permits for this property
      const [filesResponse, permitsResponse] = await Promise.all([
        this.api.get(`/municipalities/${municipalityId}/files?propertyId=${property_id}&department=building-permits`),
        this.api.get(`/municipalities/${municipalityId}/permits?propertyId=${property_id}`)
      ]);

      console.log('✅ Files loaded:', filesResponse.files?.length || 0, 'files');
      console.log('✅ Permits loaded:', permitsResponse.permits?.length || 0, 'permits');

      return {
        property,
        propertyId: property_id,
        municipalityId,
        files: filesResponse.files || [],
        permits: permitsResponse.permits || [],
      };
    } catch (error) {
      console.error('❌ Failed to load property documents:', error);
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
