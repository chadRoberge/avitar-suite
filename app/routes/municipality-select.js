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
      } else {
        // Other users (citizens, etc.) may not have municipality access
        return [];
      }

      return data.municipalities || [];
    } catch (error) {
      console.error('Error loading municipalities:', error);
      return [];
    }
  }

  // Auto-redirect if user has default municipality
  async beforeModel() {
    const defaultMunicipality = this.session.get('defaultMunicipality');
    if (defaultMunicipality) {
      this.router.transitionTo('municipality.dashboard', defaultMunicipality);
    }
  }
}
