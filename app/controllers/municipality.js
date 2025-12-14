import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class MunicipalityController extends Controller {
  @service router;

  @tracked isLoading = false;
  @tracked municipality = null;

  get shouldShowPropertySidebar() {
    const routeName = this.router.currentRouteName;

    // Show sidebar only on assessing routes and building-permits find route
    return (
      routeName?.startsWith('municipality.assessing') &&
      !routeName?.startsWith('municipality.assessing.settings') &&
      !routeName?.startsWith('municipality.assessing.reports') &&
      !routeName?.startsWith('municipality.assessing.revaluation')
    ) || routeName === 'municipality.building-permits.find';
  }

  get isOnSettingsRoute() {
    return (
      this.router.currentRouteName?.startsWith('municipality.settings') ||
      this.router.currentRouteName?.startsWith(
        'municipality.assessing.settings',
      ) ||
      this.router.currentRouteName?.startsWith(
        'municipality.assessing.reports',
      ) ||
      this.router.currentRouteName?.startsWith(
        'municipality.assessing.revaluation',
      ) ||
      this.router.currentRouteName?.startsWith(
        'municipality.building-permits.settings',
      ) ||
      this.router.currentRouteName?.startsWith(
        'municipality.building-permits.permit',
      ) ||
      this.router.currentRouteName?.startsWith(
        'municipality.building-permits.review',
      )
    );
  }
}
