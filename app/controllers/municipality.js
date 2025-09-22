import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class MunicipalityController extends Controller {
  @service router;

  @tracked isLoading = false;
  @tracked municipality = null;

  get isOnSettingsRoute() {
    return (
      this.router.currentRouteName?.startsWith('municipality.settings') ||
      this.router.currentRouteName?.startsWith(
        'municipality.assessing.settings',
      )
    );
  }
}
