import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsInspectionsRoute extends Route {
  @service api;
  @service municipality;

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    const response = await this.api.get(
      `/municipalities/${municipalityId}/inspection-settings`,
    );

    return {
      inspectionSettings: response.inspectionSettings,
      inspectors: response.inspectors,
      municipalityId,
    };
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Initialize controller state from model
    controller.availableTimeSlots = [
      ...(model.inspectionSettings?.availableTimeSlots || []),
    ];
    controller.inspectors = [...(model.inspectors || [])];
  }
}
