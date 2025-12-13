import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsPaymentInfoRoute extends Route {
  @service api;
  @service municipality;
  @service('current-user') currentUser;
  @service notifications;
  @service router;

  async beforeModel() {
    console.log('🔍 [PAYMENT-INFO] beforeModel called');

    // Check if user has admin permission for this municipality
    const municipalityId = this.municipality.currentMunicipality?.id;
    console.log('🔍 [PAYMENT-INFO] Municipality ID:', municipalityId);

    if (!municipalityId) {
      console.log('❌ [PAYMENT-INFO] No municipality ID found');
      this.notifications.error('Municipality not found');
      this.router.transitionTo('municipality-select');
      return;
    }

    // Check if user is admin or Avitar staff
    console.log(
      '🔍 [PAYMENT-INFO] User permissions:',
      this.currentUser.user.municipal_permissions,
    );
    console.log(
      '🔍 [PAYMENT-INFO] User global_role:',
      this.currentUser.user.global_role,
    );

    const userPerm = this.currentUser.user.municipal_permissions?.find(
      (perm) => {
        // Handle both string IDs and object IDs
        const permMunicipalityId =
          typeof perm.municipality_id === 'object'
            ? perm.municipality_id?._id || perm.municipality_id?.id
            : perm.municipality_id;

        console.log(
          '🔍 [PAYMENT-INFO] Checking perm:',
          permMunicipalityId?.toString(),
          'vs',
          municipalityId?.toString(),
        );
        return permMunicipalityId?.toString() === municipalityId?.toString();
      },
    );

    console.log('🔍 [PAYMENT-INFO] Found user permission:', userPerm);

    const isAvitarStaff = ['avitar_admin', 'avitar_staff'].includes(
      this.currentUser.user.global_role,
    );
    const isMunicipalAdmin = userPerm && userPerm.role === 'admin';

    console.log('🔍 [PAYMENT-INFO] isAvitarStaff:', isAvitarStaff);
    console.log('🔍 [PAYMENT-INFO] isMunicipalAdmin:', isMunicipalAdmin);

    if (!isAvitarStaff && !isMunicipalAdmin) {
      console.log(
        '❌ [PAYMENT-INFO] Permission denied - redirecting to municipality.settings',
      );
      this.notifications.error(
        'Only administrators can view payment information',
      );
      this.router.transitionTo('municipality.settings');
      return;
    }

    console.log('✅ [PAYMENT-INFO] Permission check passed');

    // Check if payment setup is complete
    const currentMuni = this.municipality.currentMunicipality;
    if (!currentMuni.isPaymentSetupComplete) {
      console.log(
        '❌ [PAYMENT-INFO] Payment setup not complete - redirecting to payment-setup',
      );
      this.notifications.warning('Please complete payment setup first');
      this.router.transitionTo('municipality.settings.payment-setup');
      return;
    }

    console.log('✅ [PAYMENT-INFO] Payment setup complete - loading dashboard');
  }

  async model() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        return {
          municipality: null,
          dashboard: null,
        };
      }

      // Fetch payment dashboard data from the API
      const response = await this.api.get(
        `/municipalities/${municipalityId}/stripe-connect/dashboard`,
      );

      return {
        municipality: this.municipality.currentMunicipality,
        dashboard: response,
        currentUser: this.currentUser.user,
      };
    } catch (error) {
      console.error('Error loading payment dashboard:', error);
      this.notifications.error('Failed to load payment dashboard information');
      return {
        municipality: this.municipality.currentMunicipality,
        dashboard: null,
      };
    }
  }
}
