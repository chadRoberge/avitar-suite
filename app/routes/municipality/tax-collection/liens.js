import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityTaxCollectionLiensRoute extends Route {
  @service municipality;
  @service router;

  beforeModel() {
    // This is an Enterprise feature - check if available
    if (!this.municipality.hasFeature('taxCollection', 'liensManagement')) {
      this.router.transitionTo('municipality.tax-collection.bills');
      throw new Error(
        'Liens Management feature is not available in your current subscription tier',
      );
    }

    // Additional permission check for liens (sensitive financial data)
    if (!this.municipality.hasPermission('taxCollection', 'manage_liens')) {
      this.router.transitionTo('municipality.tax-collection.bills');
      throw new Error('You do not have permission to manage tax liens');
    }
  }

  model() {
    // Load liens data
    return {
      activeLiens: [], // Would load from API
      pendingLiens: [], // Would load from API
      lienStatistics: {}, // Would load from API
    };
  }
}
