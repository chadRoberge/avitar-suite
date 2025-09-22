import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class AuthenticatedRoute extends Route {
  @service session;
  @service router;

  beforeModel() {
    if (!this.session.isAuthenticated) {
      this.router.transitionTo('login');
    }
  }
}
