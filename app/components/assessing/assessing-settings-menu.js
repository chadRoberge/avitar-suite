import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class AssessingSettingsMenuComponent extends Component {
  @tracked showAdvancedDropdown = false;

  constructor() {
    super(...arguments);
    // Bind the handler once in constructor so we can properly add/remove it
    this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);
  }

  @action
  toggleAdvancedDropdown(event) {
    event.stopPropagation(); // Prevent immediate outside click
    this.showAdvancedDropdown = !this.showAdvancedDropdown;

    if (this.showAdvancedDropdown) {
      // Add click listener to close dropdown when clicking outside
      setTimeout(() => {
        document.addEventListener('click', this.boundHandleOutsideClick);
      }, 0);
    } else {
      document.removeEventListener('click', this.boundHandleOutsideClick);
    }
  }

  @action
  closeAdvancedDropdown() {
    this.showAdvancedDropdown = false;
    document.removeEventListener('click', this.boundHandleOutsideClick);
  }

  @action
  handleOutsideClick() {
    this.closeAdvancedDropdown();
  }

  willDestroy() {
    super.willDestroy();
    // Clean up event listener when component is destroyed
    document.removeEventListener('click', this.boundHandleOutsideClick);
  }
}
