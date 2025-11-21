// app/services/current-user.js
import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { observer } from '@ember/object';

export default class CurrentUserService extends Service {
  @service api;
  @service municipality;
  @service session;

  @tracked user = null;
  @tracked currentMunicipalPermissions = null;
  @tracked _permissionsLoadedAt = null; // Track when permissions were last updated

  async load() {
    if (this.session.isAuthenticated) {
      const response = await this.api.get('/auth/me');
      this.user = response.user;
      this._updateCurrentPermissions();
    }
  }

  _updateCurrentPermissions() {
    if (!this.user || !this.municipality.currentMunicipality) {
      this.currentMunicipalPermissions = null;
      this._permissionsLoadedAt = null;
      return;
    }

    const foundPermissions = this.user.municipal_permissions?.find(
      (perm) =>
        perm.municipality_id === this.municipality.currentMunicipality.id,
    );

    // Always create a new object reference to trigger reactivity
    this.currentMunicipalPermissions = foundPermissions ? { ...foundPermissions } : null;
    this._permissionsLoadedAt = new Date();

    console.log('Permissions updated:', {
      municipalityId: this.municipality.currentMunicipality.id,
      hasPermissions: !!this.currentMunicipalPermissions,
      isAvitarStaff: this.isAvitarStaff,
      timestamp: this._permissionsLoadedAt
    });
  }

  // Observer to update permissions when municipality changes
  municipalityObserver = observer(
    'municipality.currentMunicipality',
    function () {
      this._updateCurrentPermissions();
    },
  );

  // Permission readiness check
  get permissionsReady() {
    // For Avitar staff, permissions are always ready once user is loaded
    if (this.isAvitarStaff) {
      return !!this.user;
    }
    // For municipal users, wait for currentMunicipalPermissions to be loaded
    return !!this.user && !!this._permissionsLoadedAt;
  }

  // Global role checks
  get isAvitarStaff() {
    return ['avitar_staff', 'avitar_admin'].includes(this.user?.global_role);
  }

  get isAvitarAdmin() {
    return this.user?.global_role === 'avitar_admin';
  }

  get isMunicipalUser() {
    return this.user?.global_role === 'municipal_user';
  }

  // Contractor and citizen checks
  get isContractor() {
    return this.user?.global_role === 'contractor';
  }

  get isCitizen() {
    return this.user?.global_role === 'citizen';
  }

  get isContractorOrCitizen() {
    return this.isContractor || this.isCitizen;
  }

  get isMunicipalStaff() {
    return this.isMunicipalUser || this.isAvitarStaff;
  }

  // Legacy compatibility getters
  get isSystem() {
    return this.isAvitarStaff;
  }

  get isMunicipal() {
    return this.isMunicipalUser;
  }

  get canManageModules() {
    return (
      this.isAvitarAdmin || this.currentMunicipalPermissions?.role === 'admin'
    );
  }

  // Municipality-specific permission checks
  hasModuleAccess(moduleName) {
    if (this.isAvitarStaff) return true; // Avitar staff have access to everything

    return (
      this.currentMunicipalPermissions?.module_permissions?.get?.(moduleName)
        ?.enabled || false
    );
  }

  hasModulePermission(moduleName, permission) {
    if (this.isAvitarStaff) return true; // Avitar staff have all permissions

    const modulePerms =
      this.currentMunicipalPermissions?.module_permissions?.get?.(moduleName);
    if (!modulePerms?.enabled) return false;

    return modulePerms.permissions?.includes(permission) || false;
  }

  getModuleRole(moduleName) {
    if (this.isAvitarAdmin) return 'admin';

    return (
      this.currentMunicipalPermissions?.module_permissions?.get?.(moduleName)
        ?.role || 'readonly'
    );
  }

  getModuleRestrictions(moduleName) {
    const modulePerms =
      this.currentMunicipalPermissions?.module_permissions?.get?.(moduleName);
    return modulePerms?.restrictions || new Map();
  }

  // Specific permission helpers
  canCreateProperties() {
    return this.hasModulePermission('assessing', 'create');
  }

  canApproveAbatements() {
    return this.hasModulePermission('assessing', 'approve');
  }

  canProcessPermits() {
    return this.hasModulePermission('buildingPermits', 'create');
  }

  canInspectBuildings() {
    return this.hasModulePermission('buildingPermits', 'inspect');
  }

  canApproveCommercialPermits() {
    const restrictions = this.getModuleRestrictions('buildingPermits');
    return (
      this.hasModulePermission('buildingPermits', 'approve') &&
      restrictions.get?.('can_approve_commercial')
    );
  }

  // Data filtering based on restrictions
  shouldFilterAssignedProperties() {
    const restrictions = this.getModuleRestrictions('assessing');
    return restrictions.get?.('can_only_update_assigned_properties') === true;
  }

  getAssignedNeighborhoods() {
    const restrictions = this.getModuleRestrictions('assessing');
    return restrictions.get?.('assigned_neighborhoods') || [];
  }

  requiresSupervisorApproval(moduleName) {
    const restrictions = this.getModuleRestrictions(moduleName);
    return restrictions.get?.('requires_supervisor_approval') === true;
  }

  // Legacy compatibility methods
  getAvailableModules() {
    if (!this.currentMunicipalPermissions) return [];

    const availableModules = [];
    if (this.currentMunicipalPermissions.module_permissions) {
      for (const [moduleName, moduleConfig] of this.currentMunicipalPermissions
        .module_permissions) {
        if (moduleConfig.enabled) {
          availableModules.push({
            name: moduleName,
            role: moduleConfig.role,
            permissions: moduleConfig.permissions,
          });
        }
      }
    }

    return availableModules;
  }
}
