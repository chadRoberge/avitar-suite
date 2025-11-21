import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsRoute extends Route {
  @service municipality;
  @service('current-user') currentUser;
  @service router;

  async model() {
    // Check if user has read access to building permits module
    // hasModulePermission already checks for Avitar staff and returns true for them
    if (!this.currentUser.hasModulePermission('buildingPermits', 'read')) {
      return {
        accessDenied: true,
        moduleName: 'Building Permits',
        requiredPermission: 'read',
      };
    }

    // User has access - return empty object for parent route
    // Child routes will load their own data
    return {
      accessDenied: false,
    };
  }
}
