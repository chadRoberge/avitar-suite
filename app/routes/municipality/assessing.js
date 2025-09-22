import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityAssessingRoute extends Route {
  @service municipality;
  @service session;
  @service router;

  beforeModel() {
    // Check if municipality has assessing module enabled
    if (!this.municipality.hasModule('assessing')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error(
        'Assessing module is not available for this municipality',
      );
    }

    // Check if user can access assessing module
    if (!this.municipality.canUserAccessModule('assessing')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error(
        'You do not have permission to access the assessing module',
      );
    }
  }

  redirect(model, transition) {
    // If accessing /assessing directly, redirect to properties (main view)
    if (transition.to.name === 'municipality.assessing.index') {
      this.router.transitionTo('municipality.assessing.properties');
    }
  }
}
