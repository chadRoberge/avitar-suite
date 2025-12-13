import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsPaymentSetupRoute extends Route {
  @service api;
  @service municipality;
  @service('current-user') currentUser;
  @service notifications;
  @service router;

  async beforeModel() {
    console.log('🔍 [PAYMENT-SETUP] beforeModel called');

    // Check if user has admin permission for this municipality
    const municipalityId = this.municipality.currentMunicipality?.id;
    console.log('🔍 [PAYMENT-SETUP] Municipality ID:', municipalityId);

    if (!municipalityId) {
      console.log('❌ [PAYMENT-SETUP] No municipality ID found');
      this.notifications.error('Municipality not found');
      this.router.transitionTo('municipality-select');
      return;
    }

    // Check if user is admin or Avitar staff
    console.log(
      '🔍 [PAYMENT-SETUP] User permissions:',
      this.currentUser.user.municipal_permissions,
    );
    console.log(
      '🔍 [PAYMENT-SETUP] User global_role:',
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
          '🔍 [PAYMENT-SETUP] Checking perm:',
          permMunicipalityId?.toString(),
          'vs',
          municipalityId?.toString(),
        );
        return permMunicipalityId?.toString() === municipalityId?.toString();
      },
    );

    console.log('🔍 [PAYMENT-SETUP] Found user permission:', userPerm);

    const isAvitarStaff = ['avitar_admin', 'avitar_staff'].includes(
      this.currentUser.user.global_role,
    );
    const isMunicipalAdmin = userPerm && userPerm.role === 'admin';

    console.log('🔍 [PAYMENT-SETUP] isAvitarStaff:', isAvitarStaff);
    console.log('🔍 [PAYMENT-SETUP] isMunicipalAdmin:', isMunicipalAdmin);

    if (!isAvitarStaff && !isMunicipalAdmin) {
      console.log(
        '❌ [PAYMENT-SETUP] Permission denied - redirecting to municipality.settings',
      );
      this.notifications.error('Only administrators can manage payment setup');
      this.router.transitionTo('municipality.settings');
      return;
    }

    console.log('✅ [PAYMENT-SETUP] Permission check passed');
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
