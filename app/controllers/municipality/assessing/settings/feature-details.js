import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class FeatureDetailsController extends Controller {
  @service api;

  // Feature code tracking
  @tracked isAddingFeatureCode = false;
  @tracked isEditingFeatureCode = false;
  @tracked editingFeatureCode = null;
  @tracked newFeatureCode = '';
  @tracked newFeatureDescription = '';
  @tracked newFeatureRate = '';
  @tracked newSizeAdjustment = '';
  @tracked newMeasurementType = '';

  // Update counter for reactivity
  @tracked featureCodeUpdateCounter = 0;

  // Size adjustment options
  sizeAdjustmentOptions = [
    { value: 'normal', label: 'Normal' },
    { value: 'zero', label: 'Zero' },
  ];

  // Measurement type options
  measurementTypeOptions = [
    { value: 'length_width', label: 'Length & Width' },
    { value: 'units', label: 'Units Only' },
  ];

  // Computed property for reactive feature codes
  get reactiveFeatureCodes() {
    this.featureCodeUpdateCounter;
    return this.model?.featureCodes || [];
  }

  // Feature code actions
  @action
  startAddingFeatureCode() {
    this.isAddingFeatureCode = true;
    this.isEditingFeatureCode = false;
    this.editingFeatureCode = null;
    this.newFeatureCode = '';
    this.newFeatureDescription = '';
    this.newFeatureRate = '';
    this.newSizeAdjustment = '';
    this.newMeasurementType = '';
  }

  @action
  cancelAddingFeatureCode() {
    this.isAddingFeatureCode = false;
    this.newFeatureCode = '';
    this.newFeatureDescription = '';
    this.newFeatureRate = '';
    this.newSizeAdjustment = '';
    this.newMeasurementType = '';
  }

  @action
  startEditingFeatureCode(featureCode) {
    console.log('Editing feature code:', featureCode);
    this.isEditingFeatureCode = true;
    this.isAddingFeatureCode = false;
    this.editingFeatureCode = featureCode;
    this.newFeatureCode = featureCode.code;
    this.newFeatureDescription = featureCode.description;
    this.newFeatureRate = featureCode.rate.toString();

    // Set dropdowns with slight delay to ensure DOM updates
    setTimeout(() => {
      this.newSizeAdjustment = featureCode.sizeAdjustment;
      this.newMeasurementType = featureCode.measurementType;
      console.log('Set sizeAdjustment to:', this.newSizeAdjustment);
      console.log('Set measurementType to:', this.newMeasurementType);
    }, 10);
  }

  @action
  cancelEditingFeatureCode() {
    this.isEditingFeatureCode = false;
    this.editingFeatureCode = null;
    this.newFeatureCode = '';
    this.newFeatureDescription = '';
    this.newFeatureRate = '';
    this.newSizeAdjustment = '';
    this.newMeasurementType = '';
  }

  @action
  updateFeatureCode(event) {
    this.newFeatureCode = event.target.value;
  }

  @action
  updateFeatureDescription(event) {
    this.newFeatureDescription = event.target.value;
  }

  @action
  updateFeatureRate(event) {
    this.newFeatureRate = event.target.value;
  }

  @action
  updateSizeAdjustment(event) {
    this.newSizeAdjustment = event.target.value;
  }

  @action
  updateMeasurementType(event) {
    this.newMeasurementType = event.target.value;
  }

  @action
  async saveFeatureCode() {
    if (
      !this.newFeatureCode.trim() ||
      !this.newFeatureDescription.trim() ||
      !this.newFeatureRate ||
      !this.newSizeAdjustment ||
      !this.newMeasurementType
    ) {
      alert('Please fill in all required fields');
      return;
    }

    const rate = parseFloat(this.newFeatureRate);
    if (isNaN(rate) || rate < 0) {
      alert('Please enter a valid rate (must be a positive number)');
      return;
    }

    try {
      const municipalityId = this.model.municipality.id;
      const codeData = {
        code: this.newFeatureCode.toUpperCase().trim(),
        description: this.newFeatureDescription.trim(),
        rate: rate,
        sizeAdjustment: this.newSizeAdjustment,
        measurementType: this.newMeasurementType,
      };

      let savedCode;
      if (this.isEditingFeatureCode) {
        // Update existing feature code
        const response = await this.api.put(
          `/municipalities/${municipalityId}/feature-codes/${this.editingFeatureCode._id || this.editingFeatureCode.id}`,
          codeData,
        );
        savedCode = response.featureCode;

        // Update in local model
        const codeIndex = this.model.featureCodes.findIndex(
          (c) =>
            (c._id || c.id) ===
            (this.editingFeatureCode._id || this.editingFeatureCode.id),
        );
        if (codeIndex !== -1) {
          this.model.featureCodes[codeIndex] = savedCode;
          this.model.featureCodes = [...this.model.featureCodes];
        }
      } else {
        // Create new feature code
        const response = await this.api.post(
          `/municipalities/${municipalityId}/feature-codes`,
          codeData,
        );
        savedCode = response.featureCode;

        // Add to local model
        if (!this.model.featureCodes) {
          this.model.featureCodes = [];
        }
        this.model.featureCodes.push(savedCode);
        this.model.featureCodes = [...this.model.featureCodes];
      }

      this.model = { ...this.model };

      // Force reactivity
      this.featureCodeUpdateCounter++;

      if (this.isEditingFeatureCode) {
        this.cancelEditingFeatureCode();
      } else {
        this.cancelAddingFeatureCode();
      }
    } catch (error) {
      console.error('Error saving feature code:', error);
      alert('Error saving feature code. Please try again.');
    }
  }

  @action
  async deleteFeatureCode(featureCode) {
    if (confirm('Are you sure you want to delete this feature code?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/feature-codes/${featureCode._id || featureCode.id}`,
        );

        // Remove from local model
        const codeIndex = this.model.featureCodes.findIndex(
          (c) => (c._id || c.id) === (featureCode._id || featureCode.id),
        );
        if (codeIndex !== -1) {
          this.model.featureCodes.splice(codeIndex, 1);
          this.model.featureCodes = [...this.model.featureCodes];
          this.model = { ...this.model };

          // Force reactivity
          this.featureCodeUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting feature code:', error);
        alert('Error deleting feature code. Please try again.');
      }
    }
  }
}
