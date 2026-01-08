import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsFeeSchedulesRoute extends Route {
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

      // Fetch permit types for the selector
      const permitTypesData = await this.api.get(
        `/municipalities/${municipalityId}/permit-types?status=active`,
      );

      // Fetch fee schedule summary across all permit types
      const summaryData = await this.api.get(
        `/municipalities/${municipalityId}/fee-schedules/summary`,
      );

      return {
        permitTypes: permitTypesData.permitTypes || [],
        summary: summaryData.summary || [],
        municipalityId,
      };
    } catch (error) {
      console.error('Error loading fee schedules:', error);
      this.notifications.error('Failed to load fee schedules');
      return {
        permitTypes: [],
        summary: [],
        municipalityId: this.municipality.currentMunicipality?.id,
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.permitTypes = model.permitTypes;
    controller.summary = model.summary;
    controller.municipalityId = model.municipalityId;
  }
}
