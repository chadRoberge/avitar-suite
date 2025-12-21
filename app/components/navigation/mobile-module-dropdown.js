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

    // Navigate to the module's route
    this.router.transitionTo(module.route);
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
