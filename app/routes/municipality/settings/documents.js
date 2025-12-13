import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsDocumentsRoute extends Route {
  @service api;
  @service router;
  @service('current-user') currentUser;

  beforeModel() {
    // Only municipal staff and admins can access settings
    if (!this.currentUser.isMunicipalStaff) {
      this.router.transitionTo('municipality.dashboard');
    }
  }

  async model() {
    const municipality = this.modelFor('municipality');
    const municipalityId = municipality.id;

    try {
      // Load folder structure and files for general municipal documents
      const [foldersResponse, filesResponse] = await Promise.all([
        this.api.get(`/municipalities/${municipalityId}/files/folders`, {
          department: 'general',
        }),
        this.api.get(`/municipalities/${municipalityId}/files`, {
          department: 'general',
        }),
      ]);

      return {
        municipality,
        municipalityId,
        folders: foldersResponse.folders || foldersResponse || {},
        files: filesResponse.files || filesResponse || [],
      };
    } catch (error) {
      console.error('Error loading municipal document library:', error);
      return {
        municipality,
        municipalityId,
        folders: {},
        files: [],
      };
    }
  }
}
