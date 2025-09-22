import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WaterfrontAttributeEditModalComponent extends Component {
  @tracked name = '';
  @tracked description = '';
  @tracked displayText = '';
  @tracked factor = '';
  @tracked isSaving = false;
  @tracked nameError = null;
  @tracked descriptionError = null;
  @tracked displayTextError = null;
  @tracked factorError = null;
  @tracked generalError = null;

  constructor() {
    super(...arguments);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.attribute) {
      // Edit mode - populate existing values
      this.name = this.args.attribute.name || '';
      this.description = this.args.attribute.description || '';
      this.displayText = this.args.attribute.displayText || '';
      this.factor = this.args.attribute.factor?.toString() || '';
    } else {
      // Create mode - clear values
      this.name = '';
      this.description = '';
      this.displayText = '';
      this.factor = '';
    }
    this.clearErrors();
  }

  clearErrors() {
    this.nameError = null;
    this.descriptionError = null;
    this.displayTextError = null;
    this.factorError = null;
    this.generalError = null;
  }

  validateForm() {
    let isValid = true;
    this.clearErrors();

    // Validate name
    if (!this.name || !this.name.trim()) {
      this.nameError = 'Attribute name is required';
      isValid = false;
    } else if (this.name.trim().length > 100) {
      this.nameError = 'Attribute name must be 100 characters or less';
      isValid = false;
    }

    // Validate description
    if (!this.description || !this.description.trim()) {
      this.descriptionError = 'Description is required';
      isValid = false;
    } else if (this.description.trim().length > 200) {
      this.descriptionError = 'Description must be 200 characters or less';
      isValid = false;
    }

    // Validate display text
    if (!this.displayText || !this.displayText.trim()) {
      this.displayTextError = 'Display text is required';
      isValid = false;
    } else if (this.displayText.trim().length > 50) {
      this.displayTextError = 'Display text must be 50 characters or less';
      isValid = false;
    }

    // Validate factor
    const factorNum = parseFloat(this.factor);
    if (!this.factor || this.factor.trim() === '') {
      this.factorError = 'Factor is required';
      isValid = false;
    } else if (isNaN(factorNum)) {
      this.factorError = 'Factor must be a valid number';
      isValid = false;
    } else if (factorNum < 0) {
      this.factorError = 'Factor cannot be negative';
      isValid = false;
    } else if (factorNum > 1000) {
      this.factorError = 'Factor cannot exceed 1000';
      isValid = false;
    }

    return isValid;
  }

  @action
  updateName(event) {
    this.name = event.target.value;
    if (this.nameError) {
      this.nameError = null;
    }
  }

  @action
  updateDescription(event) {
    this.description = event.target.value;
    if (this.descriptionError) {
      this.descriptionError = null;
    }
  }

  @action
  updateDisplayText(event) {
    this.displayText = event.target.value;
    if (this.displayTextError) {
      this.displayTextError = null;
    }
  }

  @action
  updateFactor(event) {
    this.factor = event.target.value;
    if (this.factorError) {
      this.factorError = null;
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
      const attributeData = {
        attributeType: this.args.attributeType,
        name: this.name.trim(),
        description: this.description.trim(),
        displayText: this.displayText.trim(),
        factor: parseFloat(this.factor),
      };

      // Add ID if editing existing attribute
      if (this.args.attribute?.id) {
        attributeData.id = this.args.attribute.id;
      }

      console.log('Sending waterfront attribute data:', attributeData);
      await this.args.onSave?.(attributeData);
    } catch (error) {
      console.error('Error saving waterfront attribute:', error);
      this.generalError = 'Failed to save attribute. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }
}
