import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsModulesRoute extends Route {
  @service api;
  @service municipality;
  @service('current-user') currentUser;
  @service notifications;

  async model() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        return {
          modules: [],
          municipality: null,
          active_count: 0,
        };
      }

      // Fetch available modules and municipality's active modules
      const response = await this.api.get(
        `/municipalities/${municipalityId}/modules`,
      );

      return {
        modules: response.modules || [],
        municipality: response.municipality,
        active_count: response.active_count || 0,
        currentUser: this.currentUser.user,
      };
    } catch (error) {
      console.error('Error loading modules:', error);
      this.notifications.error('Failed to load modules');
      return {
        modules: [],
        municipality: null,
        active_count: 0,
      };
    }
  }
}
