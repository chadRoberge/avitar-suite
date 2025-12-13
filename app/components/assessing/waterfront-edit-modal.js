import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import LadderInterpolator from '../../utils/ladder-interpolator';

export default class AssessingWaterfrontEditModalComponent extends Component {
  @tracked userModifications = {};

  constructor() {
    super(...arguments);
  }

  get waterfrontData() {
    // Reset user modifications when args.waterfront changes (when switching between add/edit modes)
    if (this._lastArgsWaterfront !== this.args.waterfront) {
      this._lastArgsWaterfront = this.args.waterfront;
      this.userModifications = {}; // Reset modifications when waterfront changes
    }

    // Start with data from args.waterfront or defaults
    let baseData;
    if (this.args.waterfront) {
      baseData = {
        water_body_id: this.args.waterfront.water_body_id || '',
        frontage: this.args.waterfront.frontage || '',
        access_id: this.args.waterfront.access_id || '',
        topography_id: this.args.waterfront.topography_id || '',
        location_id: this.args.waterfront.location_id || '',
        condition: this.args.waterfront.condition ?? 100,
        current_use: this.args.waterfront.current_use || false,
      };
    } else {
      // Empty data for new waterfront
      baseData = {
        water_body_id: '',
        frontage: '',
        access_id: '',
        topography_id: '',
        location_id: '',
        condition: 100,
        current_use: false,
      };
    }

    // Apply any user modifications on top of base data
    return { ...baseData, ...this.userModifications };
  }

  get formData() {
    return this.waterfrontData;
  }

  // Get attributes by type from the passed-in waterfrontAttributes
  get accessAttributes() {
    const attrs = this.args.waterfrontAttributes?.water_access || [];
    console.log('🌊 Access Attributes:', attrs);
    return attrs;
  }

  get topographyAttributes() {
    const attrs = this.args.waterfrontAttributes?.topography || [];
    console.log('🌊 Topography Attributes:', attrs);
    return attrs;
  }

  get locationAttributes() {
    const attrs = this.args.waterfrontAttributes?.water_location || [];
    console.log('🌊 Location Attributes:', attrs);
    return attrs;
  }

  get selectedWaterBody() {
    if (!this.formData.water_body_id || !this.args.waterBodies) {
      return null;
    }
    const selectedId = String(this.formData.water_body_id);
    return this.args.waterBodies.find(
      (body) => String(body.id || body._id) === selectedId,
    );
  }

  get waterBodyBaseValue() {
    if (!this.selectedWaterBody) {
      return 0;
    }
    return this.selectedWaterBody.baseWaterValue || 0;
  }

  get selectedAccessAttribute() {
    if (!this.formData.access_id) return null;
    const selectedId = String(this.formData.access_id);
    return this.accessAttributes.find(
      (attr) => String(attr._id) === selectedId,
    );
  }

  get selectedTopographyAttribute() {
    if (!this.formData.topography_id) return null;
    const selectedId = String(this.formData.topography_id);
    return this.topographyAttributes.find(
      (attr) => String(attr._id) === selectedId,
    );
  }

  get selectedLocationAttribute() {
    if (!this.formData.location_id) return null;
    const selectedId = String(this.formData.location_id);
    return this.locationAttributes.find(
      (attr) => String(attr._id) === selectedId,
    );
  }

  get accessFactor() {
    const factor = this.selectedAccessAttribute?.factor;
    if (!factor) return 1.0;
    // Convert percentage to decimal (95 -> 0.95)
    return factor / 100;
  }

  get topographyFactor() {
    const factor = this.selectedTopographyAttribute?.factor;
    if (!factor) return 1.0;
    // Convert percentage to decimal (95 -> 0.95)
    return factor / 100;
  }

  get locationFactor() {
    const factor = this.selectedLocationAttribute?.factor;
    if (!factor) return 1.0;
    // Convert percentage to decimal (95 -> 0.95)
    return factor / 100;
  }

  get conditionFactor() {
    const condition = parseFloat(this.formData.condition) || 100;
    return condition / 100; // Convert percentage to decimal factor
  }

  get frontageFactor() {
    // Get ladder data for the selected water body
    if (!this.selectedWaterBody || !this.selectedWaterBody.ladders) {
      return 1.0; // Default factor if no ladder data
    }

    const frontage = parseFloat(this.formData.frontage) || 0;
    if (frontage <= 0) {
      return 1.0;
    }

    const ladders = this.selectedWaterBody.ladders;
    if (!Array.isArray(ladders) || ladders.length === 0) {
      return 1.0; // No ladder data, use default factor
    }

    // Use the LadderInterpolator to calculate the frontage factor
    // with monotone cubic interpolation
    return LadderInterpolator.interpolateWaterfrontFactor(ladders, frontage);
  }

  get totalFactor() {
    return (
      this.frontageFactor *
      this.accessFactor *
      this.topographyFactor *
      this.locationFactor *
      this.conditionFactor
    );
  }

  get calculatedValue() {
    const baseValue = this.waterBodyBaseValue;
    const totalFactor = this.totalFactor;

    // Frontage is only used to calculate the frontage factor from the ladder
    // The actual value is: base value × frontage factor × other factors
    return baseValue * totalFactor;
  }

  get assessedValue() {
    // If current use, assessed value is 0; otherwise use calculated value
    return this.formData.current_use ? 0 : this.calculatedValue;
  }

  get isValid() {
    return (
      this.formData.water_body_id &&
      this.formData.frontage &&
      this.formData.access_id &&
      this.formData.topography_id &&
      this.formData.location_id &&
      parseFloat(this.formData.frontage) > 0
    );
  }

  @action
  updateWaterBody(event) {
    console.log('🌊 updateWaterBody:', event.target.value);
    this.userModifications = {
      ...this.userModifications,
      water_body_id: event.target.value,
    };
  }

  @action
  updateFrontage(event) {
    console.log('🌊 updateFrontage:', event.target.value);
    this.userModifications = {
      ...this.userModifications,
      frontage: event.target.value,
    };
  }

  @action
  updateAccess(event) {
    console.log('🌊 updateAccess:', event.target.value);
    this.userModifications = {
      ...this.userModifications,
      access_id: event.target.value,
    };
  }

  @action
  updateTopography(event) {
    console.log('🌊 updateTopography:', event.target.value);
    this.userModifications = {
      ...this.userModifications,
      topography_id: event.target.value,
    };
  }

  @action
  updateLocation(event) {
    console.log('🌊 updateLocation:', event.target.value);
    this.userModifications = {
      ...this.userModifications,
      location_id: event.target.value,
    };
  }

  @action
  updateCondition(event) {
    this.userModifications = {
      ...this.userModifications,
      condition: event.target.value,
    };
  }

  @action
  updateCurrentUse(event) {
    this.userModifications = {
      ...this.userModifications,
      current_use: event.target.checked,
    };
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

    console.log('🌊 Waterfront Form Data:', this.formData);
    console.log('🌊 Selected Water Body:', this.selectedWaterBody);
    console.log('🌊 Selected Access:', this.selectedAccessAttribute);
    console.log(
      '🌊 Selected Access ID:',
      this.selectedAccessAttribute?.id,
      'vs _id:',
      this.selectedAccessAttribute?._id,
    );
    console.log('🌊 Selected Topography:', this.selectedTopographyAttribute);
    console.log(
      '🌊 Selected Topography ID:',
      this.selectedTopographyAttribute?.id,
      'vs _id:',
      this.selectedTopographyAttribute?._id,
    );
    console.log('🌊 Selected Location:', this.selectedLocationAttribute);
    console.log(
      '🌊 Selected Location ID:',
      this.selectedLocationAttribute?.id,
      'vs _id:',
      this.selectedLocationAttribute?._id,
    );

    const waterfrontData = {
      water_body_id: this.formData.water_body_id,
      water_body_name: this.selectedWaterBody?.name || '',
      frontage: parseFloat(this.formData.frontage),
      frontage_factor: this.frontageFactor,
      access_id: this.formData.access_id,
      access_name: this.selectedAccessAttribute?.name || '',
      access_factor: this.accessFactor,
      topography_id: this.formData.topography_id,
      topography_name: this.selectedTopographyAttribute?.name || '',
      topography_factor: this.topographyFactor,
      location_id: this.formData.location_id,
      location_name: this.selectedLocationAttribute?.name || '',
      location_factor: this.locationFactor,
      condition: parseFloat(this.formData.condition),
      condition_factor: this.conditionFactor,
      current_use: this.formData.current_use,
      base_value: this.waterBodyBaseValue,
      calculated_value: this.calculatedValue,
      assessed_value: this.assessedValue,
    };

    console.log('🌊 Waterfront Data to Save:', waterfrontData);

    this.args.onSave(waterfrontData);
  }
}
