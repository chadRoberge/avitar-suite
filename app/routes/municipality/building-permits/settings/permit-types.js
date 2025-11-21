import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsPermitTypesRoute extends Route {
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

      // Fetch permit types
      const data = await this.api.get(
        `/municipalities/${municipalityId}/permit-types?status=all`,
      );

      return {
        permitTypes: data.permitTypes || [],
        municipalityId,
      };
    } catch (error) {
      console.error('Error loading permit types:', error);
      this.notifications.error('Failed to load permit types');
      return {
        permitTypes: [],
        municipalityId: this.municipality.currentMunicipality?.id,
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.permitTypes = model.permitTypes;
    controller.municipalityId = model.municipalityId;
  }
}
