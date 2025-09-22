import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class LadderEntryEditModalComponent extends Component {
  @tracked frontage = '';
  @tracked value = '';
  @tracked isSaving = false;
  @tracked frontageError = null;
  @tracked valueError = null;
  @tracked generalError = null;

  constructor() {
    super(...arguments);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.ladderEntry) {
      // Edit mode - populate existing values
      this.frontage = this.args.ladderEntry.frontage?.toString() || '';
      this.value = this.args.ladderEntry.value?.toString() || '';
    } else {
      // Create mode - clear values
      this.frontage = '';
      this.value = '';
    }
    this.clearErrors();
  }

  clearErrors() {
    this.frontageError = null;
    this.valueError = null;
    this.generalError = null;
  }

  validateForm() {
    let isValid = true;
    this.clearErrors();

    // Validate frontage
    const frontageNum = parseFloat(this.frontage);
    if (!this.frontage || this.frontage.trim() === '') {
      this.frontageError = 'Frontage is required';
      isValid = false;
    } else if (isNaN(frontageNum)) {
      this.frontageError = 'Frontage must be a valid number';
      isValid = false;
    } else if (frontageNum < 1) {
      this.frontageError = 'Frontage must be at least 1 foot';
      isValid = false;
    } else if (frontageNum > 10000) {
      this.frontageError = 'Frontage cannot exceed 10,000 feet';
      isValid = false;
    }

    // Validate value
    const valueNum = parseFloat(this.value);
    if (!this.value || this.value.trim() === '') {
      this.valueError = 'Value is required';
      isValid = false;
    } else if (isNaN(valueNum)) {
      this.valueError = 'Value must be a valid number';
      isValid = false;
    } else if (valueNum < 0) {
      this.valueError = 'Value cannot be negative';
      isValid = false;
    } else if (valueNum > 100000000) {
      this.valueError = 'Value cannot exceed $100,000,000';
      isValid = false;
    }

    return isValid;
  }

  @action
  updateFrontage(event) {
    this.frontage = event.target.value;
    if (this.frontageError) {
      this.frontageError = null;
    }
  }

  @action
  updateValue(event) {
    this.value = event.target.value;
    if (this.valueError) {
      this.valueError = null;
    }
  }

  @action
  handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      this.args.onClose?.();
    }
  }

  @action
  async handleSubmit(event) {
    event?.preventDefault();

    if (!this.validateForm()) {
      return;
    }

    this.isSaving = true;
    this.generalError = null;

    try {
      const entryData = {
        frontage: parseFloat(this.frontage),
        value: parseFloat(this.value),
        order: this.args.ladderEntry?.order || 0,
      };

      // Add ID if editing existing entry
      if (this.args.ladderEntry?.id) {
        entryData.id = this.args.ladderEntry.id;
      }

      await this.args.onSave?.(entryData);
    } catch (error) {
      console.error('Error saving ladder entry:', error);
      this.generalError = 'Failed to save ladder entry. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }
}
