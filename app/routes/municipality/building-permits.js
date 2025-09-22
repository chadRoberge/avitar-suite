import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsRoute extends Route {
  @service municipality;
  @service router;

  beforeModel() {
    // Check if municipality has building permits module enabled
    if (!this.municipality.hasModule('buildingPermits')) {
      this.router.transitionTo('municipality.dashboard');
      throw new Error(
        'Building Permits module is not available for this municipality',
      );
    }
  }

  async model() {
    // Load building permits data
    return {
      permits: [], // Would come from API
      recentApplications: [],
      pendingInspections: [],
    };
  }
}
