import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PropertyQueueService extends Service {
  @tracked queuedProperties = [];

  constructor() {
    super(...arguments);
    this.loadFromLocalStorage();
  }

  get queueCount() {
    return this.queuedProperties.length;
  }

  get hasProperties() {
    return this.queuedProperties.length > 0;
  }

  @action
  addToQueue(property) {
    // Check if property is already in queue
    const existingIndex = this.queuedProperties.findIndex(
      (queuedProperty) => queuedProperty.id === property.id,
    );

    if (existingIndex === -1) {
      // Add to queue if not already present
      this.queuedProperties = [...this.queuedProperties, property];
      this.saveToLocalStorage();
      console.log(`Added property ${property.id} to queue`);
    } else {
      console.log(`Property ${property.id} already in queue`);
    }
  }

  @action
  addMultipleToQueue(properties) {
    const newProperties = properties.filter(
      (property) =>
        !this.queuedProperties.some(
          (queuedProperty) => queuedProperty.id === property.id,
        ),
    );

    if (newProperties.length > 0) {
      this.queuedProperties = [...this.queuedProperties, ...newProperties];
      this.saveToLocalStorage();
      console.log(`Added ${newProperties.length} properties to queue`);
    }
  }

  @action
  removeFromQueue(propertyId) {
    this.queuedProperties = this.queuedProperties.filter(
      (property) => property.id !== propertyId,
    );
    this.saveToLocalStorage();
    console.log(`Removed property ${propertyId} from queue`);
  }

  @action
  clearQueue() {
    this.queuedProperties = [];
    this.saveToLocalStorage();
    console.log('Cleared property queue');
  }

  @action
  getQueuedProperties() {
    return [...this.queuedProperties];
  }

  @action
  isInQueue(propertyId) {
    return this.queuedProperties.some((property) => property.id === propertyId);
  }

  // Local storage methods
  saveToLocalStorage() {
    try {
      const queueData = this.queuedProperties.map((property) => ({
        id: property.id,
        pid_formatted: property.pid_formatted || property.pid,
        location: property.location,
        owner: property.owner,
        property_class: property.property_class,
        assessed_value: property.assessed_value,
        // Store minimal data needed for display
        mapNumber: property.mapNumber,
        lotSubDisplay: property.lotSubDisplay,
        streetAddress: property.streetAddress,
        ownerName: property.ownerName,
      }));

      localStorage.setItem('avitar-property-queue', JSON.stringify(queueData));
    } catch (error) {
      console.error('Failed to save property queue to local storage:', error);
    }
  }

  loadFromLocalStorage() {
    try {
      const storedQueue = localStorage.getItem('avitar-property-queue');
      if (storedQueue) {
        const parsedQueue = JSON.parse(storedQueue);
        this.queuedProperties = parsedQueue;
        console.log(
          `Loaded ${this.queuedProperties.length} properties from queue`,
        );
      }
    } catch (error) {
      console.error('Failed to load property queue from local storage:', error);
      this.queuedProperties = [];
    }
  }
}
