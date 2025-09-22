import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class PropertyQueueButtonComponent extends Component {
  @service('property-queue') propertyQueue;
  @service('property-selection') propertySelection;

  get isDisabled() {
    return !this.propertySelection.selectedProperty;
  }

  get buttonTitle() {
    const selectedProperty = this.propertySelection.selectedProperty;
    if (!selectedProperty) {
      return 'No property selected';
    }

    const isInQueue = this.propertyQueue.isInQueue(selectedProperty.id);
    return isInQueue
      ? 'Property already in queue'
      : `Add ${selectedProperty.pid_formatted || selectedProperty.pid || selectedProperty.id} to queue`;
  }

  @action
  addToQueue(event) {
    event.preventDefault(); // Prevent default link behavior
    if (this.args.onAddToQueue) {
      this.args.onAddToQueue();
    }
  }
}
