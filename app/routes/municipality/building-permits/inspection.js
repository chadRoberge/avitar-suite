import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsInspectionRoute extends Route {
  @service municipality;
  @service api;

  async model(params) {
    const municipalityId = this.municipality.currentMunicipality?.id;
    const { inspection_id } = params;

    const response = await this.api.get(
      `/municipalities/${municipalityId}/inspections/${inspection_id}`,
    );

    return {
      inspection: response.inspection,
      municipalityId,
    };
  }
}
