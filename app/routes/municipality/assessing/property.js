import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingPropertyRoute extends Route {
  @service assessing;
  @service('current-user') currentUser;
  @service router;

  async model(params) {
    const { property_id } = params;

    try {
      const response = await this.assessing.getProperty(property_id);
      return response.property || response;
    } catch (error) {
      console.error('Failed to load property:', error);
      this.router.transitionTo('municipality.assessing');
      throw error;
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Ensure current user permissions are updated
    // This fixes the issue where edit buttons don't appear on first navigation
    this.currentUser._updateCurrentPermissions();
  }

  beforeModel() {
    // Check if user has read access to assessing module
    if (!this.currentUser.hasModulePermission('assessing', 'read')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error(
        'You do not have permission to view property assessments',
      );
    }
  }
}
