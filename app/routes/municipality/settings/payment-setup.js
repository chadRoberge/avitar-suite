import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsPaymentSetupRoute extends Route {
  @service api;
  @service municipality;
  @service('current-user') currentUser;
  @service notifications;
  @service router;

  async beforeModel() {
    // Check if user has admin permission for this municipality
    const municipalityId = this.municipality.currentMunicipality?.id;

    if (!municipalityId) {
      this.notifications.error('Municipality not found');
      this.router.transitionTo('municipality-select');
      return;
    }

    // Check if user is admin or Avitar staff
    const userPerm = this.currentUser.user.municipal_permissions?.find(
      (perm) => perm.municipality_id === municipalityId,
    );

    const isAvitarStaff = ['avitar_admin', 'avitar_staff'].includes(
      this.currentUser.user.global_role,
    );
    const isMunicipalAdmin = userPerm && userPerm.role === 'admin';

    if (!isAvitarStaff && !isMunicipalAdmin) {
      this.notifications.error('Only administrators can manage payment setup');
      this.router.transitionTo('municipality.settings');
      return;
    }
  }

  async model() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        return {
          municipality: null,
          account: null,
        };
      }

      // Fetch Stripe Connect account status
      const response = await this.api.get(
        `/municipalities/${municipalityId}/stripe-connect/status`,
      );

      return {
        municipality: this.municipality.currentMunicipality,
        account: response.account || null,
        status: response.status || 'not_started',
        requirements: response.requirements || null,
        currentUser: this.currentUser.user,
      };
    } catch (error) {
      console.error('Error loading payment setup:', error);
      this.notifications.error('Failed to load payment setup information');
      return {
        municipality: this.municipality.currentMunicipality,
        account: null,
        status: 'not_started',
        requirements: null,
      };
    }
  }
}
