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

  // Store the previous values to detect changes
  _previousEntryId = null;
  _previousIsOpen = false;

  constructor() {
    super(...arguments);
  }

  // Getter that triggers form update checks - called from template
  get formInitializer() {
    const currentEntryId = this.args.ladderEntry?.id || this.args.ladderEntry?._id;
    const isOpen = this.args.isOpen;

    // Check if entry changed or modal just opened
    const entryChanged = currentEntryId !== this._previousEntryId;
    const modalJustOpened = isOpen && !this._previousIsOpen;

    if (entryChanged || modalJustOpened) {
      // Use setTimeout to avoid updating during render
      setTimeout(() => {
        this.initializeForm();
      }, 0);
      this._previousEntryId = currentEntryId;
    }

    this._previousIsOpen = isOpen;
    return null; // Don't render anything
  }

  initializeForm() {
    if (this.args.ladderEntry) {
      // Edit mode - populate existing values
      this.frontage = this.args.ladderEntry.frontage?.toString() || '';
      // Server stores as 'factor', but we may also get 'value' from legacy data
      this.value = (this.args.ladderEntry.factor || this.args.ladderEntry.value)?.toString() || '';
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

    // Validate factor
    const valueNum = parseFloat(this.value);
    if (!this.value || this.value.trim() === '') {
      this.valueError = 'Factor is required';
      isValid = false;
    } else if (isNaN(valueNum)) {
      this.valueError = 'Factor must be a valid number';
      isValid = false;
    } else if (valueNum < 0) {
      this.valueError = 'Factor cannot be negative';
      isValid = false;
    } else if (valueNum > 1000) {
      this.valueError = 'Factor cannot exceed 1,000';
      isValid = false;
    }

    return isValid;
  }

  @action
  checkForUpdates() {
    this.updateFormIfNeeded();
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
        factor: parseFloat(this.value), // Server expects 'factor' not 'value'
        order: this.args.ladderEntry?.order || 0,
      };

      // Add ID if editing existing entry (check both id and _id)
      const entryId = this.args.ladderEntry?.id || this.args.ladderEntry?._id;
      if (entryId) {
        entryData.id = entryId;
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
