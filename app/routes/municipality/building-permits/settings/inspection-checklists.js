import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsInspectionChecklistsRoute extends Route {
  @service api;
  @service municipality;
  @service notifications;
  @service('current-user') currentUser;

  async model() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Fetch all inspection checklist templates
      const data = await this.api.get(
        `/municipalities/${municipalityId}/inspection-checklist-templates`,
      );

      return {
        templates: data.templates || [],
        municipalityId,
      };
    } catch (error) {
      console.error('Error loading inspection checklist templates:', error);
      this.notifications.error('Failed to load inspection checklist templates');
      return {
        templates: [],
        municipalityId: this.municipality.currentMunicipality?.id,
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.templates = model.templates;
    controller.municipalityId = model.municipalityId;
  }
}
