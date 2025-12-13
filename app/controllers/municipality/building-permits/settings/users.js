import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MunicipalityBuildingPermitsSettingsUsersController extends Controller {
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
  @tracked formPermissions = [];
  @tracked formSpecialties = [];
  @tracked formCertifications = '';

  // Role hierarchy (lower number = higher privilege)
  roleHierarchy = {
    admin: 1,
    supervisor: 2,
    staff: 3,
    readonly: 4,
    data_entry: 5,
  };

  get roleOptions() {
    return [
      {
        value: 'admin',
        label: 'Administrator',
        description: 'Full access to all features',
      },
      {
        value: 'supervisor',
        label: 'Supervisor',
        description: 'Can approve permits and manage staff',
      },
      {
        value: 'staff',
        label: 'Staff',
        description: 'Can process permits and inspections',
      },
      {
        value: 'readonly',
        label: 'Read Only',
        description: 'View-only access',
      },
      {
        value: 'data_entry',
        label: 'Data Entry',
        description: 'Limited data entry only',
      },
    ];
  }

  get permissionOptions() {
    return [
      { value: 'create', label: 'Create Permits' },
      { value: 'read', label: 'View Permits' },
      { value: 'update', label: 'Update Permits' },
      { value: 'delete', label: 'Delete Permits' },
      { value: 'approve', label: 'Approve/Reject Permits' },
      { value: 'inspect', label: 'Conduct Inspections' },
      { value: 'export', label: 'Export Data' },
      { value: 'manage_users', label: 'Manage Users' },
    ];
  }

  get specialtyOptions() {
    return [
      'Building Structural',
      'Electrical',
      'Plumbing',
      'Mechanical/HVAC',
      'Fire Safety',
      'Energy Code',
      'Accessibility',
      'Zoning',
    ];
  }

  get currentUserRole() {
    if (!this.municipalityId) return 'readonly';

    const currentUserPerm = this.currentUser.user?.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.municipalityId,
    );
    return (
      currentUserPerm?.module_permissions?.['building-permits']?.role ||
      'readonly'
    );
  }

  get currentUserRoleLevel() {
    return this.roleHierarchy[this.currentUserRole] || 999;
  }

  get totalUsers() {
    return (this.users || []).length;
  }

  get inspectorCount() {
    if (!this.municipalityId) return 0;

    return (this.users || []).filter((user) => {
      const userPerm = user.municipal_permissions?.find(
        (perm) => perm.municipality_id === this.municipalityId,
      );
      const userRole = userPerm?.module_permissions?.['building-permits']?.role;
      return userRole === 'staff';
    }).length;
  }

  get adminCount() {
    if (!this.municipalityId) return 0;

    return (this.users || []).filter((user) => {
      const userPerm = user.municipal_permissions?.find(
        (perm) => perm.municipality_id === this.municipalityId,
      );
      const userRole = userPerm?.module_permissions?.['building-permits']?.role;
      return userRole === 'admin';
    }).length;
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
        const userRole =
          userPerm?.module_permissions?.['building-permits']?.role;
        return userRole === this.filterRole;
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
    // Access as plain object (no longer a Map)
    const modulePerms =
      targetUserPerm?.module_permissions?.['building-permits'];
    const targetRole = modulePerms?.role || 'readonly';
    const targetRoleLevel = this.roleHierarchy[targetRole] || 999;

    // Can only modify users with lower privilege level
    return this.currentUserRoleLevel < targetRoleLevel;
  };

  getUserRole(user) {
    if (!this.municipalityId) return 'readonly';

    const userPerm = user.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.municipalityId,
    );
    // Access as plain object (no longer a Map)
    const modulePerms = userPerm?.module_permissions?.['building-permits'];
    return modulePerms?.role || 'readonly';
  }

  getUserSpecialties(user) {
    if (!this.municipalityId) return null;

    const userPerm = user.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.municipalityId,
    );
    // Access as plain object (no longer a Map)
    const modulePerms = userPerm?.module_permissions?.['building-permits'];
    const specialties = modulePerms?.restrictions?.specialties;

    return specialties && specialties.length > 0 ? specialties : null;
  }

  getUserRoleBadgeClass(role) {
    const badgeMap = {
      admin: 'avitar-badge--danger',
      supervisor: 'avitar-badge--warning',
      staff: 'avitar-badge--primary',
      readonly: 'avitar-badge--secondary',
      data_entry: 'avitar-badge--info',
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
    const modulePerms =
      userPerm?.module_permissions?.['building-permits'] || {};

    this.formEmail = user.email || '';
    this.formFirstName = user.first_name || '';
    this.formLastName = user.last_name || '';
    this.formPhone = user.phone || '';
    this.formRole = modulePerms.role || 'staff';
    this.formPermissions = modulePerms.permissions || [];
    this.formSpecialties = modulePerms.restrictions?.get('specialties') || [];
    this.formCertifications =
      modulePerms.restrictions?.get('certifications') || '';

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
    this.formPermissions = [];
    this.formSpecialties = [];
    this.formCertifications = '';
  }

  @action
  updateFormField(field, event) {
    this[field] = event.target.value;
  }

  @action
  togglePermission(permission) {
    if (this.formPermissions.includes(permission)) {
      this.formPermissions = this.formPermissions.filter(
        (p) => p !== permission,
      );
    } else {
      this.formPermissions = [...this.formPermissions, permission];
    }
  }

  @action
  toggleSpecialty(specialty) {
    if (this.formSpecialties.includes(specialty)) {
      this.formSpecialties = this.formSpecialties.filter(
        (s) => s !== specialty,
      );
    } else {
      this.formSpecialties = [...this.formSpecialties, specialty];
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
          module: 'building-permits',
          module_permissions: {
            role: this.formRole,
            permissions: this.formPermissions,
            restrictions: {
              specialties: this.formSpecialties,
              certifications: this.formCertifications,
            },
          },
        },
      };

      const response = await this.api.post(
        '/municipalities/' + this.municipalityId + '/users',
        userData,
      );

      // Show different messages based on whether user was new or existing
      if (response.isNewUser) {
        this.notifications.success(
          `New user account created for ${this.formEmail}. Welcome email with credentials has been sent.`,
        );
      } else {
        this.notifications.info(
          `${this.formEmail} already has an Avitar Suite account. They have been granted access to Building Permits and notified via email.`,
        );
      }

      this.closeAddUserModal();
      // Refresh the route to reload users
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
        module_permissions: {
          role: this.formRole,
          permissions: this.formPermissions,
          restrictions: {
            specialties: this.formSpecialties,
            certifications: this.formCertifications,
          },
        },
      };

      const url =
        '/municipalities/' +
        this.municipalityId +
        '/users/' +
        this.selectedUser._id;
      await this.api.put(url, updates);

      this.notifications.success('User updated successfully');
      this.closeEditUserModal();
      // Refresh the route to reload users
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
      ' from the building permits module?';
    if (!confirm(confirmMsg)) {
      return;
    }

    this.isLoading = true;

    try {
      const url =
        '/municipalities/' +
        this.municipalityId +
        '/users/' +
        user._id +
        '/modules/building-permits';
      await this.api.delete(url);

      this.notifications.success('User removed from building permits');
      // Refresh the route to reload users
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
