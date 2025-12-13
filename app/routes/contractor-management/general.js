import Route from '@ember/routing/route';
import { action } from '@ember/object';

export default class ContractorManagementGeneralRoute extends Route {
  model() {
    return this.modelFor('contractor-management');
  }

  @action
  setupController(controller, model) {
    super.setupController(controller, model);
    // Initialize form data when entering the route
    controller.initializeFormData();
  }
}
