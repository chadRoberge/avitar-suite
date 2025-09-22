import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityMotorVehicleRoute extends Route {
  @service municipality;
  @service router;

  beforeModel() {
    // Check if municipality has motor vehicle module enabled
    if (!this.municipality.hasModule('motorVehicle')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error(
        'Motor Vehicle module is not available for this municipality',
      );
    }
  }

  async model() {
    // Load motor vehicle data
    return {
      registrations: [], // Would come from API
      renewals: [],
      inspections: [],
    };
  }
}
