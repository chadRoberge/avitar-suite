import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ContractorManagementIndexRoute extends Route {
  @service router;

  beforeModel() {
    // Redirect to general tab by default
    this.router.transitionTo('contractor-management.general');
  }
}
