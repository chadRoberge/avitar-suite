import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { cached } from '@glimmer/tracking';

export default class ZoneEditModalComponent extends Component {
  @tracked zoneName = '';
  @tracked zoneDescription = '';
  @tracked minimumAcreage = '';
  @tracked minimumFrontage = '';
  @tracked excessLandCostPerAcre = '';
  @tracked baseViewValue = '';

  constructor(owner, args) {
    super(owner, args);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.zone) {
      this.zoneName = this.args.zone.name || '';
      this.zoneDescription = this.args.zone.description || '';
      this.minimumAcreage = this.args.zone.minimumAcreage || '';
      this.minimumFrontage = this.args.zone.minimumFrontage || '';
      this.excessLandCostPerAcre = this.args.zone.excessLandCostPerAcre || '';
      this.baseViewValue = this.args.zone.baseViewValue || '';
    } else {
      this.zoneName = '';
      this.zoneDescription = '';
      this.minimumAcreage = '';
      this.minimumFrontage = '';
      this.excessLandCostPerAcre = '';
      this.baseViewValue = '';
    }
  }

  @action
  updateZoneName(event) {
    this.zoneName = event.target.value;
  }

  @action
  updateZoneDescription(event) {
    this.zoneDescription = event.target.value;
  }

  @action
  updateMinimumAcreage(event) {
    this.minimumAcreage = event.target.value;
  }

  @action
  updateMinimumFrontage(event) {
    this.minimumFrontage = event.target.value;
  }

  @action
  updateExcessLandCostPerAcre(event) {
    this.excessLandCostPerAcre = event.target.value;
  }

  @action
  updateBaseViewValue(event) {
    this.baseViewValue = event.target.value;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  // Track when the zone changes to reinitialize form
  @cached
  get zoneTracker() {
    if (this.args.isOpen && this.args.zone) {
      // Initialize form when zone changes and modal is open
      const zoneId = this.args.zone.id || 'new';
      const currentZoneId = this._lastZoneId;

      if (zoneId !== currentZoneId) {
        this._lastZoneId = zoneId;
        // Use setTimeout to avoid updating during render
        setTimeout(() => {
          if (this.args.isOpen) {
            this.initializeForm();
          }
        }, 0);
      }

      return zoneId;
    }
    return null;
  }

  @action
  handleSubmit(event) {
    event.preventDefault();

    const zoneData = {
      name: this.zoneName.trim(),
      description: this.zoneDescription.trim(),
      minimumAcreage: parseFloat(this.minimumAcreage),
      minimumFrontage: parseInt(this.minimumFrontage, 10),
      excessLandCostPerAcre: parseFloat(this.excessLandCostPerAcre) || 0,
      baseViewValue: parseFloat(this.baseViewValue) || 0,
    };

    // Include ID if editing existing zone
    if (this.args.zone?.id) {
      zoneData.id = this.args.zone.id;
    }

    if (this.args.onSave) {
      this.args.onSave(zoneData);
    }
  }
}
