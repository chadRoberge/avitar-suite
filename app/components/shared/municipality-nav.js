import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityNavComponent extends Component {
  @service municipality;
  @service router;
  @service session;
  @service('current-user') currentUser;
  @service('property-selection') propertySelection;
  @service('property-queue') propertyQueue;

  @tracked activeModuleKey = null;
  @tracked assessmentYear = null;
  @tracked isPrintModalOpen = false;
  @tracked openDropdownIndex = null;
  @tracked isPIDSheetOpen = false;

  get navigationItems() {
    // Access propertySelection to make this reactive to property changes
    this.propertySelection.selectedProperty;
    return this.municipality.moduleNavigation || [];
  }

  get currentMunicipalityName() {
    return (
      this.municipality.currentMunicipality?.displayName ||
      this.municipality.currentMunicipality?.name
    );
  }

  get municipalityInitial() {
    const name = this.currentMunicipalityName;
    return name ? name.charAt(0).toUpperCase() : '';
  }

  get brandingConfig() {
    return this.municipality.currentMunicipality?.branding_config || {};
  }

  get navStyles() {
    const branding = this.brandingConfig;
    if (!branding || !branding.primary_color) return htmlSafe('');

    return htmlSafe(`
      --municipality-primary: ${branding.primary_color};
      --municipality-secondary: ${branding.secondary_color || '#ffffff'};
    `);
  }

  get activeModule() {
    return this.navigationItems.find(
      (item) =>
        this.router.isActive(item.route) ||
        item.children?.some((child) => this.router.isActive(child.route)),
    );
  }

  get activeModuleChildren() {
    const active = this.activeModule;
    // Access propertySelection to make this reactive to property changes
    this.propertySelection.selectedProperty;
    return active?.children || [];
  }

  get hasActiveChildren() {
    return this.activeModuleChildren.length > 0;
  }

  /**
   * Show PID button for modules that use property selection
   * Mirrors the logic from municipality controller's shouldShowPropertySidebar
   */
  get showPIDButton() {
    const routeName = this.router.currentRouteName;
    if (!routeName) return false;

    // Show on assessing routes (excluding settings, reports, revaluation)
    const isAssessingRoute =
      routeName.startsWith('municipality.assessing') &&
      !routeName.startsWith('municipality.assessing.settings') &&
      !routeName.startsWith('municipality.assessing.reports') &&
      !routeName.startsWith('municipality.assessing.revaluation');

    // Show on building-permits find route
    const isBuildingPermitsFind =
      routeName === 'municipality.building-permits.find';

    // Show on tax-collection routes (future)
    const isTaxCollectionRoute = routeName.startsWith(
      'municipality.tax-collection',
    );

    return isAssessingRoute || isBuildingPermitsFind || isTaxCollectionRoute;
  }

  get selectedProperty() {
    return this.propertySelection.selectedProperty;
  }

  get currentMunicipalityId() {
    return this.municipality.currentMunicipality?.id;
  }

  get currentQueryParams() {
    // Get current query parameters to preserve them in navigation
    const currentRoute = this.router.currentRoute;
    return currentRoute ? currentRoute.queryParams : {};
  }

  get userRole() {
    // Get user's role for current municipality
    const municipalityId = this.municipality.currentMunicipality?.id;
    if (!municipalityId || !this.currentUser.user) {
      return null;
    }

    // Check if global avitar staff/admin
    const globalRole = this.currentUser.user.global_role;
    if (globalRole === 'avitar_admin') {
      return { role: 'Avitar Admin', badge: 'avitar-badge--danger' };
    }
    if (globalRole === 'avitar_staff') {
      return { role: 'Avitar Staff', badge: 'avitar-badge--warning' };
    }

    // Get municipal permission
    const permission = this.currentUser.user.municipal_permissions?.find(
      (perm) => perm.municipality_id === municipalityId,
    );

    if (!permission) {
      return null;
    }

    // Map roles to display names and badge colors
    const roleMap = {
      admin: { role: 'Administrator', badge: 'avitar-badge--danger' },
      supervisor: { role: 'Supervisor', badge: 'avitar-badge--warning' },
      department_head: { role: 'Department Head', badge: 'avitar-badge--info' },
      staff: { role: 'Staff', badge: 'avitar-badge--primary' },
      data_entry: { role: 'Data Entry', badge: 'avitar-badge--secondary' },
      readonly: { role: 'Read Only', badge: 'avitar-badge--secondary' },
    };

    return (
      roleMap[permission.role] || {
        role: permission.role,
        badge: 'avitar-badge--secondary',
      }
    );
  }

  get userDepartment() {
    const municipalityId = this.municipality.currentMunicipality?.id;
    if (!municipalityId || !this.currentUser.user) {
      return null;
    }

    const permission = this.currentUser.user.municipal_permissions?.find(
      (perm) => perm.municipality_id === municipalityId,
    );

    return permission?.department;
  }

  get userName() {
    const user = this.currentUser.user;
    if (!user) return null;

    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    } else if (user.first_name) {
      return user.first_name;
    } else if (user.email) {
      return user.email;
    }
    return null;
  }

  @action
  setActiveModule(moduleKey) {
    this.activeModuleKey =
      this.activeModuleKey === moduleKey ? null : moduleKey;
  }

  /**
   * Smart module navigation that preserves property context
   * When a property is selected, navigates to property-specific route in the target module
   * Property context is maintained via the propertySelection service (no query params needed)
   */
  @action
  navigateToModule(navItem, event) {
    event.preventDefault();

    const selectedProperty = this.propertySelection.selectedProperty;
    const moduleRoute = navItem.route;

    // If no property selected, just navigate to the default module route
    if (!selectedProperty) {
      this.router.transitionTo(moduleRoute);
      return;
    }

    const propertyId = selectedProperty.id || selectedProperty._id;

    // Map modules to their property-aware routes
    // Property context is preserved in the propertySelection service
    if (moduleRoute === 'municipality.assessing') {
      // Navigate to General/PID route with the selected property
      this.router.transitionTo(
        'municipality.assessing.general.property',
        propertyId,
      );
    } else if (moduleRoute === 'municipality.building-permits') {
      // Navigate to find route - property is already in propertySelection service
      this.router.transitionTo('municipality.building-permits.find');
    } else if (moduleRoute === 'municipality.tax-collection') {
      // Future: Navigate to tax collection property view
      this.router.transitionTo(moduleRoute);
    } else {
      // Default: just navigate to the module
      this.router.transitionTo(moduleRoute);
    }
  }

  @action
  isModuleActive(item) {
    return (
      this.router.isActive(item.route) ||
      item.children?.some((child) => this.router.isActive(child.route))
    );
  }

  @action
  goToMunicipalitySelection() {
    // Clear any selected property when switching municipalities
    this.propertySelection.clearSelectedProperty();

    // Navigate to municipality selection page
    this.router.transitionTo('municipality-select');
  }

  @action
  onAssessmentYearChange(newYear) {
    this.assessmentYear = newYear;
    // The AssessmentYearSelector component will handle the route transition
  }

  @action
  addSelectedToQueue() {
    const selectedProperty = this.propertySelection.selectedProperty;
    if (selectedProperty) {
      this.propertyQueue.addToQueue(selectedProperty);
    } else {
      console.warn('No property selected to add to queue');
    }
  }

  @action
  openPrintModal() {
    this.isPrintModalOpen = true;
  }

  @action
  closePrintModal() {
    this.isPrintModalOpen = false;
  }

  @action
  openPIDSheet() {
    this.isPIDSheetOpen = true;
  }

  @action
  closePIDSheet() {
    this.isPIDSheetOpen = false;
  }

  @action
  toggleDropdown(index) {
    this.openDropdownIndex = this.openDropdownIndex === index ? null : index;
  }

  @action
  closeDropdown() {
    this.openDropdownIndex = null;
  }

  @action
  isDropdownOpen(index) {
    return this.openDropdownIndex === index;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  async logout() {
    try {
      // Call backend logout endpoint to invalidate session on server
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
        }
      } catch (apiError) {
        console.warn(
          'Backend logout failed (continuing with local cleanup):',
          apiError,
        );
      }

      // Clear any selected property
      this.propertySelection.clearSelectedProperty();

      // Clear current user data
      if (this.currentUser) {
        this.currentUser.user = null;
        this.currentUser.currentMunicipalPermissions = null;
      }

      // Clear municipality data
      if (this.municipality) {
        this.municipality.currentMunicipality = null;
      }

      // Invalidate the session (clears localStorage tokens and user data)
      await this.session.invalidate();

      // Navigate to login page
      this.router.transitionTo('login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Force navigation to login even if logout fails
      this.router.transitionTo('login');
    }
  }
}
