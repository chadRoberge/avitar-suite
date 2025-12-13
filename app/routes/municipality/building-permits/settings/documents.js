import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsDocumentsRoute extends Route {
  @service api;
  @service router;
  @service('current-user') currentUser;

  beforeModel() {
    // Only municipal staff and admins can access settings
    if (!this.currentUser.isMunicipalStaff) {
      this.router.transitionTo('municipality.building-permits.queue');
    }
  }

  async model() {
    const municipality = this.modelFor('municipality');
    const municipalityId = municipality.id;

    try {
      // Load folder structure and files
      const [foldersResponse, filesResponse] = await Promise.all([
        this.api.get(`/municipalities/${municipalityId}/files/folders`, {
          department: 'building_permit',
        }),
        this.api.get(`/municipalities/${municipalityId}/files`, {
          department: 'building_permit',
        }),
      ]);

      return {
        municipality,
        municipalityId,
        folders: foldersResponse.folders || foldersResponse || {},
        files: filesResponse.files || filesResponse || [],
      };
    } catch (error) {
      console.error('Error loading document library:', error);
      return {
        municipality,
        municipalityId,
        folders: {},
        files: [],
      };
    }
  }
}
