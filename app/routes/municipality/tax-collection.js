import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityTaxCollectionRoute extends Route {
  @service municipality;
  @service router;

  beforeModel() {
    // Check if municipality has tax collection module enabled
    if (!this.municipality.hasModule('taxCollection')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error(
        'Tax Collection module is not available for this municipality',
      );
    }

    // Check if user can access tax collection module
    if (!this.municipality.canUserAccessModule('taxCollection')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error(
        'You do not have permission to access the tax collection module',
      );
    }
  }

  redirect(model, transition) {
    // If accessing /tax-collection directly, redirect to bills
    if (transition.to.name === 'municipality.tax-collection.index') {
      this.router.transitionTo('municipality.tax-collection.bills');
    }
  }
}
