import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class CitizenSettingsIndexRoute extends Route {
  @service router;

  beforeModel() {
    // Redirect to profile page by default
    this.router.replaceWith('citizen-settings.profile');
  }
}
