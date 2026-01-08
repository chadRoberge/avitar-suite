import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

/**
 * Mobile Module Dropdown Component
 *
 * A dropdown selector for switching between modules on mobile devices.
 * Replaces the horizontal module navigation on small screens.
 */
export default class MobileModuleDropdownComponent extends Component {
  @service municipality;
  @service router;
  @service('property-selection') propertySelection;

  @tracked isOpen = false;

  get modules() {
    return this.municipality.moduleNavigation || [];
  }

  get currentModule() {
    return this.modules.find(
      (item) =>
        this.router.isActive(item.route) ||
        item.children?.some((child) => this.router.isActive(child.route)),
    );
  }

  get currentModuleTitle() {
    return this.currentModule?.title || 'Select Module';
  }

  get currentModuleIcon() {
    return this.currentModule?.icon || 'menu';
  }

  get dropdownClass() {
    let classes = 'mobile-module-dropdown';
    if (this.isOpen) {
      classes += ' mobile-module-dropdown--open';
    }
    return classes;
  }

  @action
  toggleDropdown(event) {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  @action
  selectModule(module, event) {
    event.stopPropagation();
    this.isOpen = false;

    const selectedProperty = this.propertySelection.selectedProperty;
    const moduleRoute = module.route;

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
  closeDropdown() {
    this.isOpen = false;
  }

  @action
  isModuleActive(module) {
    return (
      this.router.isActive(module.route) ||
      module.children?.some((child) => this.router.isActive(child.route))
    );
  }
}
