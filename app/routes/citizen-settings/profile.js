import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class CitizenSettingsProfileRoute extends Route {
  @service('current-user') currentUser;

  model() {
    // Get user from parent route
    const parentModel = this.modelFor('citizen-settings');

    return {
      user: parentModel.user,
      isContractor: parentModel.isContractor,
    };
  }
}
