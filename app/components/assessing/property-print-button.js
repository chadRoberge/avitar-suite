import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class PropertyPrintButtonComponent extends Component {
  @service('property-selection') propertySelection;

  get isDisabled() {
    return !this.propertySelection.selectedProperty;
  }

  get buttonTitle() {
    const selectedProperty = this.propertySelection.selectedProperty;
    if (!selectedProperty) {
      return 'No property selected';
    }

    return `Print property record card for ${selectedProperty.pid_formatted || selectedProperty.pid || selectedProperty.id}`;
  }

  @action
  openPrintModal(event) {
    event.preventDefault(); // Prevent default link behavior
    if (this.args.onOpenPrint) {
      this.args.onOpenPrint();
    }
  }
}
