import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityNavComponent extends Component {
  @service municipality;
  @service router;
  @service session;
  @service('property-selection') propertySelection;
  @service('property-queue') propertyQueue;

  @tracked activeModuleKey = null;
  @tracked assessmentYear = null;
  @tracked isPrintModalOpen = false;
  @tracked openDropdownIndex = null;

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

  get selectedProperty() {
    return this.propertySelection.selectedProperty;
  }

  get currentQueryParams() {
    // Get current query parameters to preserve them in navigation
    const currentRoute = this.router.currentRoute;
    return currentRoute ? currentRoute.queryParams : {};
  }

  @action
  setActiveModule(moduleKey) {
    this.activeModuleKey =
      this.activeModuleKey === moduleKey ? null : moduleKey;
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
      // Clear any selected property
      this.propertySelection.clearSelectedProperty();

      // Invalidate the session (this should handle clearing tokens and user data)
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
