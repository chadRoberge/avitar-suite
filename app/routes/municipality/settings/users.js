import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsUsersRoute extends Route {
  @service api;
  @service municipality;
  @service('current-user') currentUser;
  @service notifications;

  async model() {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        return {
          users: [],
          municipalityId: null,
          currentUser: this.currentUser.user,
          municipality: null,
          availableDepartments: [],
          enabledModules: [],
        };
      }

      // Fetch all users for this municipality (no module filter)
      const usersResponse = await this.api.get(
        `/municipalities/${municipalityId}/users`,
      );

      // Fetch municipality details for departments and modules
      const municipalityResponse = await this.api.get(
        `/municipalities/${municipalityId}`,
      );

      // Extract enabled modules
      const enabledModules = [];

      if (municipalityResponse.municipality?.module_config?.modules) {
        const modulesObj =
          municipalityResponse.municipality.module_config.modules;

        // module_config.modules is a Map on the backend, comes as object in JSON
        for (const [moduleName, moduleConfig] of Object.entries(modulesObj)) {
          if (moduleConfig.enabled) {
            enabledModules.push({
              name: moduleName,
              displayName: this.formatModuleName(moduleName),
              tier: moduleConfig.tier,
            });
          }
        }
      }

      // Department list (from User schema enum)
      const availableDepartments = [
        'Building Inspector',
        'Fire Marshal',
        'Health Department',
        'Planning & Zoning',
        'Engineering',
        'Public Works',
        'Conservation',
        'Electrical',
        'Plumbing',
        'Other',
      ];

      return {
        users: usersResponse.users || [],
        municipalityId,
        currentUser: this.currentUser.user,
        municipality: municipalityResponse,
        availableDepartments,
        enabledModules,
      };
    } catch (error) {
      console.error('Error loading users:', error);
      this.notifications.error('Failed to load users');
      return {
        users: [],
        municipalityId: this.municipality.currentMunicipality?.id,
        currentUser: this.currentUser.user,
        municipality: null,
        availableDepartments: [],
        enabledModules: [],
      };
    }
  }

  formatModuleName(moduleName) {
    // Convert module names to display format
    const nameMap = {
      assessing: 'Assessing',
      'building-permits': 'Building Permits',
      building_permit: 'Building Permits',
      buildingPermits: 'Building Permits',
      'code-enforcement': 'Code Enforcement',
      licensing: 'Licensing',
      'animal-control': 'Animal Control',
      utilities: 'Utilities',
      'tax-collection': 'Tax Collection',
      gis: 'GIS',
    };
    return nameMap[moduleName] || moduleName;
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.users = model.users;
    controller.municipalityId = model.municipalityId;
  }
}
