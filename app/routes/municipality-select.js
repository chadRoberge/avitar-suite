import AuthenticatedRoute from './authenticated';
import { inject as service } from '@ember/service';

export default class MunicipalitySelectRoute extends AuthenticatedRoute {
  @service session;
  @service api;
  @service router;

  async model() {
    try {
      // Get user's available municipalities based on role
      const user = this.session.data.authenticated.user;

      let data;

      if (['avitar_staff', 'avitar_admin'].includes(user.global_role)) {
        // Avitar staff can access all municipalities
        data = await this.api.get('/municipalities');
      } else if (user.global_role === 'municipal_user') {
        // Municipal staff only see their assigned municipalities
        data = await this.api.get(`/municipalities/user/${user.id}`);
      } else if (['citizen', 'contractor'].includes(user.global_role)) {
        // Citizens and contractors see all active municipalities
        data = await this.api.get('/municipalities', { active: true });
      } else {
        // Fallback for any other role
        return [];
      }

      return data.municipalities || [];
    } catch (error) {
      console.error('Error loading municipalities:', error);
      return [];
    }
  }

  // Auto-redirect if user has saved default municipality
  async beforeModel(transition) {
    const user = this.session.data.authenticated.user;

    // Don't auto-redirect if we were redirected here due to an error
    // This prevents infinite loops when user doesn't have access
    if (transition.from?.name === 'municipality.index') {
      return;
    }

    // Check localStorage for saved default (supports "remember me" feature)
    const savedDefault = localStorage.getItem('defaultMunicipality');

    // Check session for temporary default (current session only)
    const sessionDefault = this.session.get('defaultMunicipality');

    // Use saved default or session default
    const defaultMunicipality = savedDefault || sessionDefault;

    if (defaultMunicipality) {
      // All users go to the municipality dashboard
      // Menu items are filtered based on user permissions
      this.router.transitionTo('municipality.dashboard', defaultMunicipality);
    }
  }
}
