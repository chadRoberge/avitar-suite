import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsIndexRoute extends Route {
  @service router;

  beforeModel() {
    // Redirect to the queue as the default view
    this.router.transitionTo('municipality.building-permits.queue');
  }
}
