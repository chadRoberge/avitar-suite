import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WaterBodyEditModalComponent extends Component {
  @tracked name = '';
  @tracked description = '';
  @tracked waterBodyType = '';
  @tracked baseWaterValue = '';
  @tracked isSaving = false;
  @tracked nameError = null;
  @tracked descriptionError = null;
  @tracked typeError = null;
  @tracked baseWaterValueError = null;
  @tracked generalError = null;

  // Store the previous values to detect changes
  _previousWaterBodyId = null;
  _previousIsOpen = false;

  constructor() {
    super(...arguments);
  }

  // Getter that triggers form update checks - called from template
  get formInitializer() {
    const currentWaterBodyId =
      this.args.waterBody?.id || this.args.waterBody?._id;
    const isOpen = this.args.isOpen;

    // Check if water body changed or modal just opened
    const waterBodyChanged = currentWaterBodyId !== this._previousWaterBodyId;
    const modalJustOpened = isOpen && !this._previousIsOpen;

    if (waterBodyChanged || modalJustOpened) {
      // Use setTimeout to avoid updating during render
      setTimeout(() => {
        this.initializeForm();
      }, 0);
      this._previousWaterBodyId = currentWaterBodyId;
    }

    this._previousIsOpen = isOpen;
    return null; // Don't render anything
  }

  initializeForm() {
    if (this.args.waterBody) {
      // Edit mode - populate existing values
      this.name = this.args.waterBody.name || '';
      this.description = this.args.waterBody.description || '';
      this.waterBodyType = this.args.waterBody.waterBodyType || '';
      this.baseWaterValue =
        this.args.waterBody.baseWaterValue?.toString() || '0';
    } else {
      // Create mode - clear values
      this.name = '';
      this.description = '';
      this.waterBodyType = '';
      this.baseWaterValue = '0';
    }
    this.clearErrors();
  }

  clearErrors() {
    this.nameError = null;
    this.descriptionError = null;
    this.typeError = null;
    this.baseWaterValueError = null;
    this.generalError = null;
  }

  validateForm() {
    let isValid = true;
    this.clearErrors();

    // Validate name
    if (!this.name || !this.name.trim()) {
      this.nameError = 'Water body name is required';
      isValid = false;
    } else if (this.name.trim().length > 100) {
      this.nameError = 'Water body name must be 100 characters or less';
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

    // Validate type
    if (!this.waterBodyType || !this.waterBodyType.trim()) {
      this.typeError = 'Water body type is required';
      isValid = false;
    }

    // Validate base water value
    const baseValue = parseFloat(this.baseWaterValue);
    if (
      this.baseWaterValue === '' ||
      this.baseWaterValue === null ||
      this.baseWaterValue === undefined
    ) {
      this.baseWaterValueError = 'Base waterfront value is required';
      isValid = false;
    } else if (isNaN(baseValue)) {
      this.baseWaterValueError = 'Base waterfront value must be a valid number';
      isValid = false;
    } else if (baseValue < 0) {
      this.baseWaterValueError = 'Base waterfront value cannot be negative';
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
  updateType(event) {
    this.waterBodyType = event.target.value;
    if (this.typeError) {
      this.typeError = null;
    }
  }

  @action
  updateBaseWaterValue(event) {
    this.baseWaterValue = event.target.value;
    if (this.baseWaterValueError) {
      this.baseWaterValueError = null;
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
      const waterBodyData = {
        name: this.name.trim(),
        description: this.description.trim(),
        waterBodyType: this.waterBodyType,
        baseWaterValue: parseFloat(this.baseWaterValue),
      };

      // Add ID if editing existing water body
      const waterBodyId = this.args.waterBody?.id || this.args.waterBody?._id;
      if (waterBodyId) {
        waterBodyData.id = waterBodyId;
      }

      console.log('Sending water body data:', waterBodyData);
      console.log('Edit mode:', !!waterBodyId);
      console.log('Original water body object:', this.args.waterBody);
      await this.args.onSave?.(waterBodyData);
    } catch (error) {
      console.error('Error saving water body:', error);
      this.generalError = 'Failed to save water body. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }
}
