import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsDocumentsRoute extends Route {
  @service municipality;

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    return {
      municipalityId,
    };
  }
}
