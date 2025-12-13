import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsUserRoute extends Route {
  @service api;
  @service municipality;
  @service('current-user') currentUser;
  @service notifications;
  @service router;

  async beforeModel() {
    console.log('User detail route beforeModel called');
    // Temporarily disable permission check to test if page loads
    console.log('Permission check temporarily disabled for testing');
  }

  async model(params) {
    try {
      const municipalityId = this.municipality.currentMunicipality?.id;
      const { user_id } = params;

      if (!municipalityId) {
        throw new Error('No municipality selected');
      }

      // Fetch detailed user information
      const userResponse = await this.api.get(
        `/municipalities/${municipalityId}/users/${user_id}`,
      );

      // Fetch municipality details for department list
      const municipalityResponse = await this.api.get(
        `/municipalities/${municipalityId}`,
      );

      // Extract enabled modules
      const enabledModules = [];

      if (municipalityResponse.municipality?.module_config?.modules) {
        const modulesObj =
          municipalityResponse.municipality.module_config.modules;

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

      // Department list
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

      // Check if user can edit (same logic as backend)
      const isAvitarStaff =
        this.currentUser.user?.global_role === 'avitar_staff' ||
        this.currentUser.user?.global_role === 'avitar_admin';
      const municipalPermission =
        this.currentUser.user?.municipal_permissions?.find(
          (perm) => perm.municipality_id === municipalityId,
        );
      const isAdmin =
        municipalPermission?.role === 'admin' ||
        municipalPermission?.role === 'supervisor';
      const canEdit = isAvitarStaff || isAdmin;

      return {
        user: userResponse.user,
        municipalityId,
        municipalitySlug: this.municipality.currentMunicipality?.slug,
        municipality: municipalityResponse.municipality,
        availableDepartments,
        enabledModules,
        canEdit,
      };
    } catch (error) {
      console.error('Error loading user details:', error);
      this.notifications.error(error.message || 'Failed to load user details');
      this.router.transitionTo('municipality.settings.users');
    }
  }

  formatModuleName(moduleName) {
    const nameMap = {
      assessing: 'Assessing',
      building_permit: 'Building Permits',
      buildingPermits: 'Building Permits',
      code_enforcement: 'Code Enforcement',
      licensing: 'Licensing',
      animal_control: 'Animal Control',
      utilities: 'Utilities',
      tax_collection: 'Tax Collection',
      gis: 'GIS',
    };
    return nameMap[moduleName] || moduleName;
  }
}
