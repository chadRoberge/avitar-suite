import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsIndexRoute extends Route {
  @service router;

  beforeModel() {
    // Redirect to permit-types as the default settings page
    this.router.transitionTo(
      'municipality.building-permits.settings.permit-types',
    );
  }
}
