import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MyPermitsRoute extends Route {
  @service('current-user') currentUser;
  @service api;
  @service router;

  async beforeModel() {
    // Only contractors and citizens can access this route
    // Municipal staff and Avitar staff should use municipality-scoped routes
    if (
      this.currentUser.user?.global_role !== 'contractor' &&
      this.currentUser.user?.global_role !== 'citizen'
    ) {
      // Redirect to municipality select for staff
      this.router.transitionTo('municipality-select');
    }
  }

  async model() {
    try {
      // Fetch all permits accessible by this user
      const response = await this.api.get('/permits/my-permits');

      return {
        permits: response.permits || [],
        stats: response.stats || {},
        byMunicipality: response.byMunicipality || [],
        userInfo: response.userInfo || {},
      };
    } catch (error) {
      console.error('Error loading user permits:', error);
      return {
        permits: [],
        stats: {},
        byMunicipality: [],
        userInfo: {},
        error: true,
      };
    }
  }
}
