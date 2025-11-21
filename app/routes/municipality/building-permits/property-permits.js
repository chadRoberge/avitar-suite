import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsPropertyPermitsRoute extends Route {
  @service router;

  beforeModel() {
    // Redirect index to queue (non-property view)
    this.router.transitionTo('municipality.building-permits.queue');
  }
}
