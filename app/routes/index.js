import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class IndexRoute extends Route {
  @service router;

  beforeModel() {
    // Redirect to login page
    this.router.transitionTo('login');
  }
}
