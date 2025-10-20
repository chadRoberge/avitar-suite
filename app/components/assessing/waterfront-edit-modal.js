import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class AssessingWaterfrontEditModalComponent extends Component {
  @tracked formData = {
    water_body_id: '',
    frontage: '',
    access: '',
    topography: '',
    location: '',
  };

  constructor() {
    super(...arguments);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.waterfront) {
      this.formData = {
        water_body_id: this.args.waterfront.water_body_id || '',
        frontage: this.args.waterfront.frontage || '',
        access: this.args.waterfront.access || '',
        topography: this.args.waterfront.topography || '',
        location: this.args.waterfront.location || '',
      };
    } else {
      this.formData = {
        water_body_id: '',
        frontage: '',
        access: '',
        topography: '',
        location: '',
      };
    }
  }

  get selectedWaterBody() {
    if (!this.formData.water_body_id || !this.args.waterBodies) {
      return null;
    }
    return this.args.waterBodies.find(
      (body) => body.id === this.formData.water_body_id,
    );
  }

  get waterBodyBaseValue() {
    if (!this.selectedWaterBody) {
      return 0;
    }
    return this.selectedWaterBody.base_value || 0;
  }

  get accessFactor() {
    const factorMap = {
      direct: 1.0,
      easement: 0.8,
      right_of_way: 0.7,
      restricted: 0.5,
      none: 0.1,
    };
    return factorMap[this.formData.access] || 1.0;
  }

  get topographyFactor() {
    const factorMap = {
      level: 1.0,
      sloping: 0.9,
      steep: 0.7,
      rocky: 0.8,
      sandy: 1.1,
      marshy: 0.6,
    };
    return factorMap[this.formData.topography] || 1.0;
  }

  get locationFactor() {
    const factorMap = {
      prime: 1.2,
      good: 1.0,
      average: 0.8,
      poor: 0.6,
      cove: 0.9,
      point: 1.1,
      island: 1.3,
    };
    return factorMap[this.formData.location] || 1.0;
  }

  get totalFactor() {
    return this.accessFactor * this.topographyFactor * this.locationFactor;
  }

  get calculatedValue() {
    const baseValue = this.waterBodyBaseValue;
    const frontage = parseFloat(this.formData.frontage) || 0;
    const totalFactor = this.totalFactor;

    return baseValue * frontage * totalFactor;
  }

  get isValid() {
    return (
      this.formData.water_body_id &&
      this.formData.frontage &&
      this.formData.access &&
      this.formData.topography &&
      this.formData.location &&
      parseFloat(this.formData.frontage) > 0
    );
  }

  @action
  updateWaterBody(event) {
    this.formData.water_body_id = event.target.value;
  }

  @action
  updateFrontage(event) {
    this.formData.frontage = event.target.value;
  }

  @action
  updateAccess(event) {
    this.formData.access = event.target.value;
  }

  @action
  updateTopography(event) {
    this.formData.topography = event.target.value;
  }

  @action
  updateLocation(event) {
    this.formData.location = event.target.value;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  handleSubmit(event) {
    event.preventDefault();

    if (!this.isValid) {
      return;
    }

    const waterfrontData = {
      water_body_id: this.formData.water_body_id,
      water_body_name: this.selectedWaterBody?.name || '',
      frontage: parseFloat(this.formData.frontage),
      access: this.formData.access,
      topography: this.formData.topography,
      location: this.formData.location,
      base_value: this.waterBodyBaseValue,
      calculated_value: this.calculatedValue,
    };

    this.args.onSave(waterfrontData);
  }
}
