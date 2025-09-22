import Model, { attr, belongsTo } from '@ember-data/model';

export default class UserModel extends Model {
  // Basic Info
  @attr('string') firstName;
  @attr('string') lastName;
  @attr('string') email;
  @attr('string') userType; // 'residential', 'commercial', 'municipal', 'system'

  // Municipality Relationship
  @belongsTo('municipality', { async: true }) municipality;

  // Permission System
  @attr('number') permissionLevel; // 0-999 hierarchy
  @attr('string') department; // For municipal users
  @attr('string') jobTitle;

  // Business Info (commercial users)
  @attr('string') businessName;
  @attr('string') businessType;

  // Contact Info
  @attr() address; // JSON object
  @attr('string') phone;

  // System Fields
  @attr('boolean') isActive;
  @attr('boolean') isEmailVerified;
  @attr('date') lastLogin;
  @attr() preferences; // JSON object
  @attr('date') createdAt;
  @attr('date') updatedAt;

  // === Computed Properties ===

  get fullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get displayName() {
    if (this.userType === 'commercial' && this.businessName) {
      return `${this.businessName} (${this.fullName})`;
    }
    return this.fullName;
  }

  get fullAddress() {
    const addr = this.address;
    if (!addr) return null;
    return `${addr.street}, ${addr.city}, ${addr.state} ${addr.zipCode}`;
  }

  get userTypeBadge() {
    const badges = {
      residential: { text: 'Residential', class: 'badge-primary' },
      commercial: { text: 'Commercial', class: 'badge-success' },
      municipal: { text: 'Municipal', class: 'badge-info' },
      system: { text: 'System', class: 'badge-dark' },
    };
    return badges[this.userType] || badges.residential;
  }

  get permissionLevelName() {
    const level = this.permissionLevel;

    if (level >= 900) return 'System Admin';
    if (level >= 80) return 'Municipal Super Admin';
    if (level >= 60) return 'Municipal Admin';
    if (level >= 40) return 'Municipal User';
    if (level >= 30) return 'Commercial Power';
    if (level >= 20) return 'Commercial Basic';
    if (level >= 10) return 'Residential';
    return 'None';
  }

  get departmentDisplayName() {
    const departments = {
      assessing: 'Assessment Department',
      tax: 'Tax Collection',
      building: 'Building Department',
      clerk: 'Town Clerk',
      motor_vehicle: 'Motor Vehicle',
      finance: 'Finance Department',
      code_enforcement: 'Code Enforcement',
      planning: 'Planning Department',
      it: 'Information Technology',
      general: 'General Administration',
    };
    return departments[this.department] || this.department;
  }

  // === Module Access Methods ===

  async canAccessModule(moduleName) {
    // System users can access all modules
    if (this.userType === 'system') return true;

    const municipality = await this.municipality;
    if (!municipality) return false;

    // Check if municipality has the module and user has department access
    return municipality.canAccessModule(
      moduleName,
      this.userType,
      this.department,
    );
  }

  async hasModuleFeature(moduleName, featureName) {
    if (this.userType === 'system') return true;

    const municipality = await this.municipality;
    if (!municipality) return false;

    return municipality.hasFeature(moduleName, featureName);
  }

  async hasModulePermission(moduleName, permission) {
    if (this.userType === 'system') return true;

    const municipality = await this.municipality;
    if (!municipality) return false;

    return municipality.hasPermission(moduleName, this.department, permission);
  }

  async getAvailableModules() {
    const municipality = await this.municipality;
    if (!municipality) return [];

    return municipality.enabledModules.filter((module) =>
      municipality.canAccessModule(module.name, this.userType, this.department),
    );
  }

  async getModuleNavigation() {
    const availableModules = await this.getAvailableModules();
    const municipality = await this.municipality;

    return availableModules.map((module) => ({
      name: module.name,
      displayName: municipality.getModuleDisplayName(module.name),
      path: `/${module.name}`,
      tier: module.tier,
      color: municipality.getModuleColor(module.name),
      icon: municipality.getModuleIcon(module.name),
      features: module.features,
    }));
  }

  // === Permission Level Checks ===

  hasPermissionLevel(requiredLevel) {
    return this.permissionLevel >= requiredLevel;
  }

  canAccessDepartment(department, action = 'view') {
    // System users can access all departments
    if (this.userType === 'system') return true;

    // Users can always access their own department
    if (this.department === department) return true;

    // IT and general admin can access all departments
    if (['it', 'general'].includes(this.department)) return true;

    // Check permission level for cross-department access
    const requiredLevels = {
      view: 40,
      edit: 60,
      admin: 80,
    };

    return (
      this.permissionLevel >= (requiredLevels[action] || requiredLevels.view)
    );
  }

  canManageUsers() {
    return this.permissionLevel >= 60; // Municipal Admin and above
  }

  canManageModules() {
    return this.permissionLevel >= 900; // System Admin only
  }

  // === User Type Specific Methods ===

  get isResidential() {
    return this.userType === 'residential';
  }

  get isCommercial() {
    return this.userType === 'commercial';
  }

  get isMunicipal() {
    return this.userType === 'municipal';
  }

  get isSystem() {
    return this.userType === 'system';
  }

  get isPublicUser() {
    return ['residential', 'commercial'].includes(this.userType);
  }

  get isStaffUser() {
    return ['municipal', 'system'].includes(this.userType);
  }

  // === Display Helpers ===

  get avatarInitials() {
    const first = this.firstName?.charAt(0) || '';
    const last = this.lastName?.charAt(0) || '';
    return (first + last).toUpperCase();
  }

  get statusText() {
    if (!this.isActive) return 'Inactive';
    if (!this.isEmailVerified) return 'Pending Verification';
    return 'Active';
  }

  get statusClass() {
    if (!this.isActive) return 'text-danger';
    if (!this.isEmailVerified) return 'text-warning';
    return 'text-success';
  }

  // === Preferences Helpers ===

  getPreference(key, defaultValue = null) {
    return this.preferences?.[key] ?? defaultValue;
  }

  get darkMode() {
    return this.getPreference('darkMode', false);
  }

  get defaultDashboard() {
    return this.getPreference('defaultDashboard', 'overview');
  }

  get language() {
    return this.getPreference('language', 'en');
  }

  get notificationSettings() {
    return this.getPreference('notifications', {
      email: true,
      permitUpdates: true,
      taxReminders: true,
      generalUpdates: false,
    });
  }
}
