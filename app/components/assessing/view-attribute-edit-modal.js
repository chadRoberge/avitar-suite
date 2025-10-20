import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class ViewAttributeEditModalComponent extends Component {
  @service api;

  @tracked userModifications = {};
  @tracked validationErrors = [];
  @tracked isSaving = false;

  constructor() {
    super(...arguments);
  }

  get attributeData() {
    // Reset user modifications when args.attribute changes (when switching between add/edit modes)
    if (this._lastArgsAttribute !== this.args.attribute) {
      this._lastArgsAttribute = this.args.attribute;
      this.userModifications = {}; // Reset modifications when attribute changes
    }

    // Start with data from args.attribute or defaults
    let baseData;
    if (this.args.attribute) {
      baseData = {
        name: this.args.attribute.name || '',
        description: this.args.attribute.description || '',
        displayText: this.args.attribute.displayText || '',
        factor: this.args.attribute.factor || 100,
      };
    } else {
      // Empty data for new attribute
      baseData = {
        name: '',
        description: '',
        displayText: '',
        factor: 100,
      };
    }

    // Apply any user modifications on top of base data
    return { ...baseData, ...this.userModifications };
  }

  get name() {
    return this.attributeData.name;
  }

  get description() {
    return this.attributeData.description;
  }

  get displayText() {
    return this.attributeData.displayText;
  }

  get factor() {
    return this.attributeData.factor;
  }

  get hasValidationErrors() {
    return this.validationErrors.length > 0;
  }

  @action
  resetForm() {
    this.userModifications = {};
    this.validationErrors = [];
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  updateName(event) {
    this.userModifications = {
      ...this.userModifications,
      name: event.target.value,
    };
    this.clearValidationErrors();
  }

  @action
  updateDescription(event) {
    this.userModifications = {
      ...this.userModifications,
      description: event.target.value,
    };
    this.clearValidationErrors();
  }

  @action
  updateDisplayText(event) {
    this.userModifications = {
      ...this.userModifications,
      displayText: event.target.value,
    };
    this.clearValidationErrors();
  }

  @action
  updateFactor(event) {
    this.userModifications = {
      ...this.userModifications,
      factor: event.target.value,
    };
    this.clearValidationErrors();
  }

  clearValidationErrors() {
    this.validationErrors = [];
  }

  validateFields() {
    const errors = [];

    if (!this.name || this.name.trim().length === 0) {
      errors.push('Name is required');
    } else if (this.name.length > 100) {
      errors.push('Name must be 100 characters or less');
    }

    if (!this.description || this.description.trim().length === 0) {
      errors.push('Description is required');
    } else if (this.description.length > 200) {
      errors.push('Description must be 200 characters or less');
    }

    if (!this.displayText || this.displayText.trim().length === 0) {
      errors.push('Display text is required');
    } else if (this.displayText.length > 50) {
      errors.push('Display text must be 50 characters or less');
    }

    const factorNum = parseFloat(this.factor);
    if (isNaN(factorNum)) {
      errors.push('Factor must be a valid number');
    } else if (factorNum < 0 || factorNum > 1000) {
      errors.push('Factor must be between 0 and 1000');
    }

    this.validationErrors = errors;
    return errors.length === 0;
  }

  @action
  async saveAttribute() {
    if (!this.validateFields()) {
      return;
    }

    this.isSaving = true;

    try {
      const attributeData = {
        attributeType: this.args.attributeType,
        name: this.name.trim(),
        description: this.description.trim(),
        displayText: this.displayText.trim(),
        factor: parseFloat(this.factor),
      };

      console.log('Sending view attribute data:', attributeData);
      await this.args.onSave(attributeData);

      // Clear fields after successful save
      this.resetForm();
    } catch (error) {
      console.error('Error saving view attribute:', error);
      this.validationErrors = [
        error.message || 'Failed to save view attribute. Please try again.',
      ];
    } finally {
      this.isSaving = false;
    }
  }
}
