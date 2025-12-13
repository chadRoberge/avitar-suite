import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalitySettingsUsersController extends Controller {
  @service api;
  @service notifications;
  @service router;
  @service('current-user') currentUser;

  @tracked users = [];
  @tracked municipalityId = null;
  @tracked searchText = '';
  @tracked filterRole = 'all';
  @tracked isLoading = false;

  // Modal states
  @tracked showAddUserModal = false;
  @tracked showEditUserModal = false;
  @tracked selectedUser = null;

  // Form fields for add/edit
  @tracked formEmail = '';
  @tracked formFirstName = '';
  @tracked formLastName = '';
  @tracked formPhone = '';
  @tracked formRole = 'staff';
  @tracked formDepartment = '';
  @tracked formModulePermissions = {}; // { moduleName: { enabled: true, role: 'staff', permissions: [] } }

  // Role hierarchy (lower number = higher privilege)
  roleHierarchy = {
    admin: 1,
    department_head: 2,
    staff: 3,
    readonly: 4,
  };

  get roleOptions() {
    return [
      {
        value: 'admin',
        label: 'Administrator',
        description: 'Full access to all municipality features',
      },
      {
        value: 'department_head',
        label: 'Department Head',
        description: 'Can manage department staff and approve actions',
      },
      {
        value: 'staff',
        label: 'Staff',
        description: 'Standard staff member access',
      },
      {
        value: 'readonly',
        label: 'Read Only',
        description: 'View-only access',
      },
    ];
  }

  get currentUserRole() {
    if (!this.municipalityId) return 'readonly';

    const currentUserPerm = this.currentUser.user?.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.municipalityId,
    );
    return currentUserPerm?.role || 'readonly';
  }

  get currentUserRoleLevel() {
    return this.roleHierarchy[this.currentUserRole] || 999;
  }

  get totalUsers() {
    return (this.users || []).length;
  }

  get adminCount() {
    if (!this.municipalityId) return 0;

    return (this.users || []).filter((user) => {
      const userPerm = user.municipal_permissions?.find(
        (perm) => perm.municipality_id === this.municipalityId,
      );
      return userPerm?.role === 'admin';
    }).length;
  }

  get staffCount() {
    if (!this.municipalityId) return 0;

    return (this.users || []).filter((user) => {
      const userPerm = user.municipal_permissions?.find(
        (perm) => perm.municipality_id === this.municipalityId,
      );
      return ['staff', 'department_head'].includes(userPerm?.role);
    }).length;
  }

  // Helper to get module role safely (needs to be a method, not getter, for fn helper)
  @action
  getModuleRole(moduleName) {
    return this.formModulePermissions?.[moduleName]?.role || '';
  }

  get filteredUsers() {
    if (!this.municipalityId) return [];

    let users = this.users || [];

    // Filter by role
    if (this.filterRole !== 'all') {
      users = users.filter((user) => {
        const userPerm = user.municipal_permissions?.find(
          (perm) => perm.municipality_id === this.municipalityId,
        );
        return userPerm?.role === this.filterRole;
      });
    }

    // Filter by search text
    if (this.searchText && this.searchText.trim().length > 0) {
      const search = this.searchText.toLowerCase();
      users = users.filter((user) => {
        return (
          user.first_name?.toLowerCase().includes(search) ||
          user.last_name?.toLowerCase().includes(search) ||
          user.email?.toLowerCase().includes(search)
        );
      });
    }

    return users;
  }

  // Check if current user can modify target user
  canModifyUser = (targetUser) => {
    if (!this.municipalityId) return false;

    // Avitar admins and staff can modify anyone
    if (this.currentUser.isAvitarAdmin || this.currentUser.isAvitarStaff) {
      return true;
    }

    const targetUserPerm = targetUser.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.municipalityId,
    );
    const targetRole = targetUserPerm?.role || 'readonly';
    const targetRoleLevel = this.roleHierarchy[targetRole] || 999;

    // Can only modify users with lower privilege level
    return this.currentUserRoleLevel < targetRoleLevel;
  };

  getUserRole(user) {
    if (!this.municipalityId) return 'readonly';

    const userPerm = user.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.municipalityId,
    );
    return userPerm?.role || 'readonly';
  }

  getUserModules(user) {
    if (!this.municipalityId) return [];

    const userPerm = user.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.municipalityId,
    );

    if (!userPerm?.module_permissions) return [];

    // Get all module names the user has access to
    return Object.keys(userPerm.module_permissions);
  }

  getUserRoleBadgeClass(role) {
    const badgeMap = {
      admin: 'avitar-badge--danger',
      department_head: 'avitar-badge--warning',
      staff: 'avitar-badge--primary',
      readonly: 'avitar-badge--secondary',
    };
    const colorClass = badgeMap[role] || 'avitar-badge--secondary';
    return 'avitar-badge avitar-badge--sm avitar-badge--pill ' + colorClass;
  }

  @action
  updateSearch(event) {
    this.searchText = event.target.value;
  }

  @action
  setFilterRole(event) {
    this.filterRole = event.target.value;
  }

  @action
  openAddUserModal() {
    this.resetForm();
    this.showAddUserModal = true;
  }

  @action
  closeAddUserModal() {
    this.showAddUserModal = false;
    this.resetForm();
  }

  @action
  openEditUserModal(user) {
    if (!this.municipalityId) return;

    if (!this.canModifyUser(user)) {
      this.notifications.warning(
        'You do not have permission to modify this user',
      );
      return;
    }

    this.selectedUser = user;
    const userPerm = user.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.municipalityId,
    );

    this.formEmail = user.email || '';
    this.formFirstName = user.first_name || '';
    this.formLastName = user.last_name || '';
    this.formPhone = user.phone || '';
    this.formRole = userPerm?.role || 'staff';
    this.formDepartment = userPerm?.department || '';

    // Load existing module permissions
    const modulePerms = {};
    if (userPerm?.module_permissions) {
      for (const [moduleName, moduleConfig] of Object.entries(
        userPerm.module_permissions,
      )) {
        modulePerms[moduleName] = {
          enabled: moduleConfig.enabled || false,
          role: moduleConfig.role || 'readonly',
          permissions: moduleConfig.permissions || [],
        };
      }
    }
    this.formModulePermissions = modulePerms;

    this.showEditUserModal = true;
  }

  @action
  closeEditUserModal() {
    this.showEditUserModal = false;
    this.selectedUser = null;
    this.resetForm();
  }

  resetForm() {
    this.formEmail = '';
    this.formFirstName = '';
    this.formLastName = '';
    this.formPhone = '';
    this.formRole = 'staff';
    this.formDepartment = '';
    this.formModulePermissions = {};
  }

  @action
  updateFormField(field, event) {
    this[field] = event.target.value;
  }

  @action
  toggleModuleAccess(moduleName) {
    const current = this.formModulePermissions[moduleName];
    if (current?.enabled) {
      // Disable module
      this.formModulePermissions = {
        ...this.formModulePermissions,
        [moduleName]: {
          ...current,
          enabled: false,
        },
      };
    } else {
      // Enable module with default settings
      this.formModulePermissions = {
        ...this.formModulePermissions,
        [moduleName]: {
          enabled: true,
          role: 'staff',
          permissions: ['read'],
        },
      };
    }
  }

  @action
  updateModuleRole(moduleName, event) {
    const role = event.target.value;

    // Map roles to default permissions
    const defaultPermissionsByRole = {
      admin: ['create', 'read', 'update', 'delete', 'approve', 'export'],
      supervisor: ['create', 'read', 'update', 'approve'],
      staff: ['create', 'read', 'update'],
      data_entry: ['create', 'read'],
      readonly: ['read'],
    };

    if (role === '' || !role) {
      // No Access selected - remove module permissions
      const newPerms = { ...this.formModulePermissions };
      delete newPerms[moduleName];
      this.formModulePermissions = newPerms;
    } else {
      // Role selected - set module permissions
      const newPerms = {
        ...this.formModulePermissions,
        [moduleName]: {
          enabled: true,
          role: role,
          permissions: defaultPermissionsByRole[role] || [],
        },
      };
      this.formModulePermissions = newPerms;
    }
  }

  @action
  async addUser() {
    if (!this.formEmail || !this.formFirstName || !this.formLastName) {
      this.notifications.warning('Please fill in all required fields');
      return;
    }

    this.isLoading = true;

    try {
      const userData = {
        email: this.formEmail,
        first_name: this.formFirstName,
        last_name: this.formLastName,
        phone: this.formPhone,
        municipal_permissions: {
          municipality_id: this.municipalityId,
          role: this.formRole,
          department: this.formDepartment || undefined,
          module_permissions: this.formModulePermissions,
        },
      };

      const response = await this.api.post(
        '/municipalities/' + this.municipalityId + '/users',
        userData,
      );

      if (response.isNewUser) {
        this.notifications.success(
          `New user account created for ${this.formEmail}.`,
        );
      } else {
        this.notifications.info(
          `${this.formEmail} already has an Avitar Suite account. They have been granted access to this municipality.`,
        );
      }

      this.closeAddUserModal();
      this.router.refresh();
    } catch (error) {
      console.error('Error adding user:', error);
      this.notifications.error(error.message || 'Failed to add user');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async updateUser() {
    if (!this.selectedUser) return;

    if (!this.canModifyUser(this.selectedUser)) {
      this.notifications.warning(
        'You do not have permission to modify this user',
      );
      return;
    }

    this.isLoading = true;

    try {
      const updates = {
        first_name: this.formFirstName,
        last_name: this.formLastName,
        phone: this.formPhone,
        role: this.formRole,
        department: this.formDepartment || undefined,
        module_permissions: this.formModulePermissions,
      };

      const url =
        '/municipalities/' +
        this.municipalityId +
        '/users/' +
        this.selectedUser._id;
      await this.api.put(url, updates);

      this.notifications.success('User updated successfully');
      this.closeEditUserModal();
      this.router.refresh();
    } catch (error) {
      console.error('Error updating user:', error);
      this.notifications.error(error.message || 'Failed to update user');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async removeUser(user) {
    if (!this.canModifyUser(user)) {
      this.notifications.warning(
        'You do not have permission to remove this user',
      );
      return;
    }

    const confirmMsg =
      'Are you sure you want to remove ' +
      user.first_name +
      ' ' +
      user.last_name +
      ' from this municipality?';
    if (!confirm(confirmMsg)) {
      return;
    }

    this.isLoading = true;

    try {
      const url =
        '/municipalities/' + this.municipalityId + '/users/' + user._id;
      await this.api.delete(url);

      this.notifications.success('User removed from municipality');
      this.router.refresh();
    } catch (error) {
      console.error('Error removing user:', error);
      this.notifications.error(error.message || 'Failed to remove user');
    } finally {
      this.isLoading = false;
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
