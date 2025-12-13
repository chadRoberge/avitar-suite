import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class SharedUsersTableComponent extends Component {
  @service router;
  @service municipality;

  // Args:
  // @users - array of user objects
  // @municipalityId - current municipality ID
  // @context - 'module' or 'municipal' (determines what role/info to show)
  // @module - module name (e.g., 'building-permits') when context is 'module'
  // @onEdit - callback for edit action
  // @onRemove - callback for remove action
  // @canModifyUser - callback to check if user can be modified
  // @searchText - search filter text
  // @filterRole - role filter
  // @onSearchUpdate - callback for search updates
  // @onFilterUpdate - callback for filter updates
  // @roleOptions - array of role options for filter

  getUserRole = (user) => {
    if (!this.args || !this.args.municipalityId || !user) {
      return 'readonly';
    }

    const userPerm = user.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.args.municipalityId,
    );

    if (this.args.context === 'module' && this.args.module) {
      // For module context, show module-specific role
      const modulePerms = userPerm?.module_permissions?.[this.args.module];
      return modulePerms?.role || 'readonly';
    } else {
      // For municipal context, show municipal role
      return userPerm?.role || 'readonly';
    }
  };

  getUserRoleBadgeClass = (role) => {
    const badgeMap = {
      admin: 'avitar-badge--danger',
      supervisor: 'avitar-badge--warning',
      department_head: 'avitar-badge--warning',
      staff: 'avitar-badge--primary',
      readonly: 'avitar-badge--secondary',
      data_entry: 'avitar-badge--info',
    };
    const colorClass = badgeMap[role] || 'avitar-badge--secondary';
    return 'avitar-badge avitar-badge--sm avitar-badge--pill ' + colorClass;
  };

  getUserSpecialties = (user) => {
    if (!this.args || !this.args.municipalityId || !user) {
      return null;
    }

    if (this.args.context !== 'module' || !this.args.module) {
      return null;
    }

    const userPerm = user.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.args.municipalityId,
    );
    const modulePerms = userPerm?.module_permissions?.[this.args.module];
    const specialties = modulePerms?.restrictions?.specialties;

    return specialties && specialties.length > 0 ? specialties : null;
  };

  getUserModules = (user) => {
    if (!this.args || !this.args.municipalityId || !user) {
      return [];
    }

    if (this.args.context !== 'municipal') {
      return [];
    }

    const userPerm = user.municipal_permissions?.find(
      (perm) => perm.municipality_id === this.args.municipalityId,
    );

    if (!userPerm?.module_permissions) return [];

    // Get all module names the user has access to
    return Object.keys(userPerm.module_permissions);
  };

  formatModuleName = (moduleName) => {
    if (!moduleName) return '';
    // Convert 'building-permits' to 'Building Permits'
    return moduleName
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  @action
  handleEdit(user) {
    this.args.onEdit?.(user);
  }

  @action
  handleRemove(user) {
    this.args.onRemove?.(user);
  }

  @action
  viewUser(user) {
    console.log('viewUser called', {
      context: this.args.context,
      userId: user._id,
      user: user,
      currentRoute: this.router.currentRouteName,
    });

    if (this.args.context === 'municipal') {
      // Get the current municipality slug from the municipality service
      const municipalitySlug = this.municipality.currentMunicipality?.slug;

      console.log('Municipality slug from service:', municipalitySlug);
      console.log('Transitioning to user detail page:', user._id);

      if (municipalitySlug) {
        this.router.transitionTo(
          'municipality.settings.user',
          municipalitySlug,
          user._id,
        );
      } else {
        console.error(
          'Could not find municipality slug in municipality service',
        );
      }
    } else {
      console.log('Not in municipal context, skipping navigation');
    }
  }

  @action
  handleSearchUpdate(event) {
    this.args.onSearchUpdate?.(event);
  }

  @action
  handleFilterUpdate(event) {
    this.args.onFilterUpdate?.(event);
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
