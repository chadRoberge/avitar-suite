import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsRoute extends Route {
  @service municipality;
  @service('current-user') currentUser;

  async model() {
    const municipalityId = this.municipality.currentMunicipality?.id;

    return {
      settings: {},
      municipalityId,
      isResidentialUser: this.currentUser.isContractorOrCitizen,
    };
  }
}
