import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsInspectionsRoute extends Route {
  @service municipality;

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    return {
      inspections: [],
      municipalityId,
    };
  }
}
