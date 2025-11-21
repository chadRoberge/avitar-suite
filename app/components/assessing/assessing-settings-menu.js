import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class AssessingSettingsMenuComponent extends Component {
  @tracked showAdvancedDropdown = false;

  @action
  toggleAdvancedDropdown() {
    this.showAdvancedDropdown = !this.showAdvancedDropdown;
  }

  @action
  closeAdvancedDropdown() {
    this.showAdvancedDropdown = false;
  }
}
