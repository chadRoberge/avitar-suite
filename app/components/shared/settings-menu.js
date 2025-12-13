import Component from '@glimmer/component';
import { inject as service } from '@ember/service';

export default class SharedSettingsMenuComponent extends Component {
  @service municipality;

  /**
   * Check if payment setup is complete for the current municipality
   */
  get isPaymentSetupComplete() {
    const currentMunicipality = this.municipality.currentMunicipality;

    console.log('🔍 [SETTINGS-MENU] Checking payment setup status');
    console.log(
      '🔍 [SETTINGS-MENU] Current municipality:',
      currentMunicipality,
    );

    if (!currentMunicipality) {
      console.log('❌ [SETTINGS-MENU] No current municipality found');
      return false;
    }

    console.log('🔍 [SETTINGS-MENU] Municipality ID:', currentMunicipality.id);
    console.log(
      '🔍 [SETTINGS-MENU] Municipality name:',
      currentMunicipality.name,
    );
    console.log(
      '🔍 [SETTINGS-MENU] isPaymentSetupComplete field:',
      currentMunicipality.isPaymentSetupComplete,
    );
    console.log('🔍 [SETTINGS-MENU] Stripe fields:', {
      stripe_account_id: currentMunicipality.stripe_account_id,
      stripe_onboarding_completed:
        currentMunicipality.stripe_onboarding_completed,
      stripe_charges_enabled: currentMunicipality.stripe_charges_enabled,
      stripe_payouts_enabled: currentMunicipality.stripe_payouts_enabled,
      stripe_account_status: currentMunicipality.stripe_account_status,
    });

    // Check if municipality has the isPaymentSetupComplete virtual field
    // This is computed in the Municipality model based on:
    // - stripe_account_id exists
    // - stripe_onboarding_completed is true
    // - stripe_charges_enabled is true
    const isComplete = currentMunicipality.isPaymentSetupComplete === true;

    console.log(
      '🔍 [SETTINGS-MENU] Final result - isPaymentSetupComplete:',
      isComplete,
    );

    return isComplete;
  }
}
