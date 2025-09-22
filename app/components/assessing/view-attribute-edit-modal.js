import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class ViewAttributeEditModalComponent extends Component {
  @service api;

  @tracked name = '';
  @tracked description = '';
  @tracked displayText = '';
  @tracked factor = 100;
  @tracked validationErrors = [];
  @tracked isSaving = false;

  constructor() {
    super(...arguments);
    this.initializeFields();
  }

  get hasValidationErrors() {
    return this.validationErrors.length > 0;
  }

  initializeFields() {
    if (this.args.attribute) {
      // Editing existing attribute
      this.name = this.args.attribute.name || '';
      this.description = this.args.attribute.description || '';
      this.displayText = this.args.attribute.displayText || '';
      this.factor = this.args.attribute.factor || 100;
    } else {
      // Creating new attribute - set defaults
      this.name = '';
      this.description = '';
      this.displayText = '';
      this.factor = 100;
    }
    this.validationErrors = [];
  }

  clearFields() {
    this.name = '';
    this.description = '';
    this.displayText = '';
    this.factor = 100;
    this.validationErrors = [];
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  updateName(event) {
    this.name = event.target.value;
    this.clearValidationErrors();
  }

  @action
  updateDescription(event) {
    this.description = event.target.value;
    this.clearValidationErrors();
  }

  @action
  updateDisplayText(event) {
    this.displayText = event.target.value;
    this.clearValidationErrors();
  }

  @action
  updateFactor(event) {
    this.factor = event.target.value;
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
      this.clearFields();
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
