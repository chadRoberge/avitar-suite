import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsIndexRoute extends Route {
  @service router;
  @service('current-user') currentUser;

  beforeModel() {
    // Redirect to appropriate default settings page based on user type
    if (this.currentUser.isContractorOrCitizen) {
      // Residential users go to their account page
      this.router.transitionTo(
        'municipality.building-permits.settings.account',
      );
    } else {
      // Municipal staff go to permit-types configuration
      this.router.transitionTo(
        'municipality.building-permits.settings.permit-types',
      );
    }
  }
}
