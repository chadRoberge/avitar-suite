import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ContractorManagementVerificationRoute extends Route {
  @service api;
  @service('current-user') currentUser;
  @service router;

  async beforeModel() {
    // Only contractors can access (contractor_id not required - this page creates it)
    if (!this.currentUser.isContractor) {
      this.router.transitionTo('my-permits');
    }
  }

  async model() {
    try {
      // Get existing verification application
      const response = await this.api.get('/contractor-verification/my-verification');

      return {
        verification: response.verification,
        contractor: this.modelFor('contractor-management').contractor,
        user: this.currentUser.user,
      };
    } catch (error) {
      console.error('Error loading verification:', error);
      return {
        verification: null,
        contractor: this.modelFor('contractor-management').contractor,
        user: this.currentUser.user,
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.setupFormData();
  }
}
