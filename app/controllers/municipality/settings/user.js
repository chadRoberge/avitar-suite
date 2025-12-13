import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsUserController extends Controller {
  @service router;
  @service notifications;
  @service api;

  @tracked activeTab = 'overview'; // overview, login-history, permission-history
  @tracked showEditModal = false;

  get displayedPermission() {
    return this.model.user.municipal_permission || {};
  }

  get modulePermissions() {
    const permission = this.displayedPermission;
    if (!permission.module_permissions) return [];

    const modules = [];
    for (const [moduleName, moduleData] of Object.entries(
      permission.module_permissions,
    )) {
      if (moduleData.enabled) {
        modules.push({
          name: moduleName,
          displayName: this.formatModuleName(moduleName),
          role: moduleData.role || 'User',
          permissions: moduleData.permissions || [],
        });
      }
    }
    return modules;
  }

  get recentLoginSessions() {
    return this.model.user.loginSessions || [];
  }

  get permissionHistory() {
    return this.model.user.permissionHistory || [];
  }

  get activeSessionsCount() {
    return this.recentLoginSessions.filter((s) => s.sessionActive).length;
  }

  get totalLoginsCount() {
    return this.recentLoginSessions.length;
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

  formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  }

  getSessionDuration(session) {
    if (!session.logoutDate) {
      return 'Active';
    }
    const duration = new Date(session.logoutDate) - new Date(session.loginDate);
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  getChangeTypeBadgeClass(changeType) {
    const badgeMap = {
      module_added: 'avitar-badge--success',
      module_removed: 'avitar-badge--danger',
      module_updated: 'avitar-badge--info',
      role_changed: 'avitar-badge--warning',
      department_changed: 'avitar-badge--info',
      permission_granted: 'avitar-badge--success',
      permission_revoked: 'avitar-badge--danger',
      municipality_added: 'avitar-badge--success',
      municipality_removed: 'avitar-badge--danger',
    };
    return `avitar-badge ${badgeMap[changeType] || 'avitar-badge--secondary'}`;
  }

  formatChangeType(changeType) {
    const labels = {
      module_added: 'Module Added',
      module_removed: 'Module Removed',
      module_updated: 'Module Updated',
      role_changed: 'Role Changed',
      department_changed: 'Department Changed',
      permission_granted: 'Permission Granted',
      permission_revoked: 'Permission Revoked',
      municipality_added: 'Municipality Added',
      municipality_removed: 'Municipality Removed',
    };
    return labels[changeType] || changeType;
  }

  @action
  setActiveTab(tab) {
    this.activeTab = tab;
  }

  @action
  backToUsers() {
    this.router.transitionTo('municipality.settings.users');
  }

  @action
  openEditModal() {
    this.showEditModal = true;
  }

  @action
  closeEditModal() {
    this.showEditModal = false;
  }

  @action
  async saveUserChanges() {
    // This would be implemented when editing functionality is needed
    this.notifications.success('User updated successfully');
    this.closeEditModal();
  }
}
