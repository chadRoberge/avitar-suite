import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsProjectsRoute extends Route {
  @service municipality;
  @service api;
  @service notifications;

  async model() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Fetch projects from the backend
      const response = await this.api.get(
        `/municipalities/${municipalityId}/projects`,
      );

      return {
        projects: response.projects || [],
        stats: response.stats || {},
        municipalityId,
      };
    } catch (error) {
      console.error('Error loading projects:', error);
      this.notifications.error('Failed to load projects');
      return {
        projects: [],
        stats: {},
        municipalityId: this.municipality.currentMunicipality?.id,
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.projects = model.projects;
    controller.stats = model.stats;
    controller.municipalityId = model.municipalityId;
  }
}
