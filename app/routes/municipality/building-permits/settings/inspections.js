import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsInspectionsRoute extends Route {
  @service api;
  @service municipality;

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    const [settingsResponse, batchesResponse] = await Promise.all([
      this.api.get(`/municipalities/${municipalityId}/inspection-settings`),
      this.api
        .get(`/municipalities/${municipalityId}/inspection-issue-batches`)
        .catch(() => ({ batches: [] })),
    ]);

    return {
      inspectionSettings: settingsResponse.inspectionSettings,
      inspectors: settingsResponse.inspectors,
      batches: batchesResponse.batches || [],
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
    controller.batches = [...(model.batches || [])];
  }
}
