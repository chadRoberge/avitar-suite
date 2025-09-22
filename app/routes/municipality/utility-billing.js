import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityUtilityBillingRoute extends Route {
  @service municipality;
  @service router;

  beforeModel() {
    // Check if municipality has utility billing module enabled
    if (!this.municipality.hasModule('waterSewer')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error(
        'Utility Billing module is not available for this municipality',
      );
    }
  }

  async model() {
    // Load utility billing data
    return {
      bills: [], // Would come from API
      customers: [],
      meters: [],
    };
  }
}
