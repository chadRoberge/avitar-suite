import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityTownClerkRoute extends Route {
  @service municipality;
  @service router;

  beforeModel() {
    // Check if municipality has town clerk module enabled
    if (!this.municipality.hasModule('townClerk')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error(
        'Town Clerk module is not available for this municipality',
      );
    }
  }

  async model() {
    // Load town clerk data
    return {
      records: [], // Would come from API
      licenses: [],
      meetings: [],
    };
  }
}
