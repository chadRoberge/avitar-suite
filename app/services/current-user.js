// app/services/current-user.js
import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { observer } from '@ember/object';
import {
  GLOBAL_ROLE_LEVELS,
  MODULE_ROLE_LEVELS,
  getGlobalRoleLevel,
  getModuleRoleLevel,
} from '../constants/role-hierarchy';

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

    console.log('🔍 [_updateCurrentPermissions] User data:', {
      user_id: this.user._id,
      global_role: this.user.global_role,
      municipal_permissions: this.user.municipal_permissions,
      looking_for_municipality_id: this.municipality.currentMunicipality.id,
    });

    // Helper to convert MongoDB ObjectId to string
    const getIdString = (id) => {
      if (!id) return null;
      // If it's already a string, return it
      if (typeof id === 'string') return id;
      // If it has a toString method (MongoDB ObjectId), use it
      if (id.toString && typeof id.toString === 'function') {
        const str = id.toString();
        // toString() on ObjectId returns the hex string
        return str !== '[object Object]' ? str : id._id || id.$oid || null;
      }
      // If it's an object with _id or $oid property
      return id._id || id.$oid || null;
    };

    // Convert both to strings for comparison (handles ObjectId vs string)
    const targetMunicipalityId = getIdString(
      this.municipality.currentMunicipality.id,
    );

    console.log(
      '🔍 [_updateCurrentPermissions] Looking for municipality:',
      targetMunicipalityId,
    );

    const foundPermissions = this.user.municipal_permissions?.find((perm) => {
      const permMunicipalityId = getIdString(perm.municipality_id);
      const matches = permMunicipalityId === targetMunicipalityId;

      console.log(`🔍 [_updateCurrentPermissions] Comparing:`, {
        perm_municipality_id: permMunicipalityId,
        target_municipality_id: targetMunicipalityId,
        matches,
        role: perm.role,
      });

      return matches;
    });

    console.log(
      '🔍 [_updateCurrentPermissions] Found permissions:',
      foundPermissions,
    );

    // Always create a new object reference to trigger reactivity
    this.currentMunicipalPermissions = foundPermissions
      ? { ...foundPermissions }
      : null;
    this._permissionsLoadedAt = new Date();

    console.log('🔍 [_updateCurrentPermissions] Final permissions:', {
      municipalityId: this.municipality.currentMunicipality.id,
      hasPermissions: !!this.currentMunicipalPermissions,
      isAvitarStaff: this.isAvitarStaff,
      currentMunicipalPermissions: this.currentMunicipalPermissions,
      timestamp: this._permissionsLoadedAt,
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

  // Check if user has a linked citizen account
  get hasCitizenAccount() {
    return this.isCitizen && !!this.user?.citizen_id;
  }

  // Check if user has a linked contractor account
  get hasContractorAccount() {
    return this.isContractor && !!this.user?.contractor_id;
  }

  get isMunicipalStaff() {
    return this.isMunicipalUser || this.isAvitarStaff;
  }

  // Numeric role level getters for permission comparisons
  get globalRoleLevel() {
    return getGlobalRoleLevel(this.user?.global_role);
  }

  get roleLevel() {
    // Alias for globalRoleLevel for easier template usage
    return this.globalRoleLevel;
  }

  // Get numeric role level for current municipality
  get currentMunicipalRoleLevel() {
    // Avitar admins always have admin level
    if (this.isAvitarAdmin) {
      return MODULE_ROLE_LEVELS.ADMIN;
    }

    // Avitar staff have reviewer level by default
    if (this.isAvitarStaff) {
      return MODULE_ROLE_LEVELS.REVIEWER;
    }

    // Get role from current municipal permissions
    const role = this.currentMunicipalPermissions?.role;
    return getModuleRoleLevel(role);
  }

  // Get numeric role level for a specific module
  getModuleRoleLevel(moduleName) {
    // Avitar admins always have admin level
    if (this.isAvitarAdmin) {
      return MODULE_ROLE_LEVELS.ADMIN;
    }

    // Get the module role string
    const roleString = this.getModuleRole(moduleName);
    return getModuleRoleLevel(roleString);
  }

  // Check if user has at least a certain global role level
  hasGlobalRoleLevel(requiredLevel) {
    return this.globalRoleLevel >= requiredLevel;
  }

  // Check if user has at least a certain municipal role level
  hasMunicipalRoleLevel(requiredLevel) {
    return this.currentMunicipalRoleLevel >= requiredLevel;
  }

  // Check if user has at least a certain module role level
  hasModuleRoleLevel(moduleName, requiredLevel) {
    return this.getModuleRoleLevel(moduleName) >= requiredLevel;
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

    // Support both Map (from Mongoose) and plain object (from JSON API)
    const modulePerms =
      this.currentMunicipalPermissions?.module_permissions?.get?.(moduleName) ||
      this.currentMunicipalPermissions?.module_permissions?.[moduleName];

    return modulePerms?.enabled || false;
  }

  hasModulePermission(moduleName, permission) {
    if (this.isAvitarStaff) return true; // Avitar staff have all permissions

    // Citizens and contractors have implicit read access to building permits
    // They can view the module, submit permits, and view their own permits
    if (this.isContractorOrCitizen) {
      if (moduleName === 'building_permit') {
        // Grant read and create access for permit submission
        return ['read', 'create'].includes(permission);
      }
      // Citizens/contractors don't have access to other modules (assessing, tax, etc.)
      return false;
    }

    console.log('🔍 [hasModulePermission] Checking permission:', {
      moduleName,
      permission,
      hasCurrentPermissions: !!this.currentMunicipalPermissions,
      module_permissions: this.currentMunicipalPermissions?.module_permissions,
      module_permissions_type:
        typeof this.currentMunicipalPermissions?.module_permissions,
      module_permissions_keys: this.currentMunicipalPermissions
        ?.module_permissions
        ? Object.keys(this.currentMunicipalPermissions.module_permissions)
        : null,
    });

    // Support both Map (from Mongoose) and plain object (from JSON API)
    const modulePerms =
      this.currentMunicipalPermissions?.module_permissions?.get?.(moduleName) ||
      this.currentMunicipalPermissions?.module_permissions?.[moduleName];

    console.log('🔍 [hasModulePermission] Module permissions:', {
      moduleName,
      modulePerms,
      enabled: modulePerms?.enabled,
      permissions: modulePerms?.permissions,
    });

    if (!modulePerms?.enabled) return false;

    return modulePerms.permissions?.includes(permission) || false;
  }

  getModuleRole(moduleName) {
    if (this.isAvitarAdmin) return 'admin';

    // Support both Map (from Mongoose) and plain object (from JSON API)
    const modulePerms =
      this.currentMunicipalPermissions?.module_permissions?.get?.(moduleName) ||
      this.currentMunicipalPermissions?.module_permissions?.[moduleName];

    return modulePerms?.role || 'readonly';
  }

  getModuleRestrictions(moduleName) {
    // Support both Map (from Mongoose) and plain object (from JSON API)
    const modulePerms =
      this.currentMunicipalPermissions?.module_permissions?.get?.(moduleName) ||
      this.currentMunicipalPermissions?.module_permissions?.[moduleName];

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
    return this.hasModulePermission('building_permit', 'create');
  }

  canInspectBuildings() {
    return this.hasModulePermission('building_permit', 'inspect');
  }

  canApproveCommercialPermits() {
    const restrictions = this.getModuleRestrictions('building_permit');
    // Support both Map and plain object
    return (
      this.hasModulePermission('building_permit', 'approve') &&
      (restrictions.get?.('can_approve_commercial') ||
        restrictions?.can_approve_commercial)
    );
  }

  // Data filtering based on restrictions
  shouldFilterAssignedProperties() {
    const restrictions = this.getModuleRestrictions('assessing');
    // Support both Map and plain object
    return (
      (restrictions.get?.('can_only_update_assigned_properties') ||
        restrictions?.can_only_update_assigned_properties) === true
    );
  }

  getAssignedNeighborhoods() {
    const restrictions = this.getModuleRestrictions('assessing');
    // Support both Map and plain object
    return (
      restrictions.get?.('assigned_neighborhoods') ||
      restrictions?.assigned_neighborhoods ||
      []
    );
  }

  requiresSupervisorApproval(moduleName) {
    const restrictions = this.getModuleRestrictions(moduleName);
    // Support both Map and plain object
    return (
      (restrictions.get?.('requires_supervisor_approval') ||
        restrictions?.requires_supervisor_approval) === true
    );
  }

  // Legacy compatibility methods
  getAvailableModules() {
    if (!this.currentMunicipalPermissions) return [];

    const availableModules = [];
    const modulePerms = this.currentMunicipalPermissions.module_permissions;

    if (modulePerms) {
      // Handle both Map (has entries method) and plain object
      const entries = modulePerms.entries
        ? Array.from(modulePerms.entries())
        : Object.entries(modulePerms);

      for (const [moduleName, moduleConfig] of entries) {
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
