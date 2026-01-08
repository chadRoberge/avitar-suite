import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class SubAreaFactorEditModalComponent extends Component {
  @tracked description = '';
  @tracked displayText = '';
  @tracked points = '';
  @tracked livingSpace = '';

  constructor(owner, args) {
    super(owner, args);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.factor) {
      this.description = this.args.factor.description || '';
      this.displayText = this.args.factor.displayText || '';
      this.points = this.args.factor.points?.toString() || '';
      this.livingSpace = this.args.factor.livingSpace?.toString() || '';
    } else {
      this.description = '';
      this.displayText = '';
      this.points = '';
      this.livingSpace = '';
    }
  }

  // Update form when modal opens with new data
  get modalData() {
    if (this.args.isOpen) {
      this.initializeForm();
    }
    return this.args.factor;
  }

  get isEditing() {
    return !!this.args.factor?._id || !!this.args.factor?.id;
  }

  get isValid() {
    return (
      this.description.trim() &&
      this.displayText.trim() &&
      this.points !== '' &&
      !isNaN(parseFloat(this.points)) &&
      parseFloat(this.points) >= -1000 &&
      parseFloat(this.points) <= 1000 &&
      this.livingSpace !== ''
    );
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  updateDescription(event) {
    this.description = event.target.value;
  }

  @action
  updateDisplayText(event) {
    const value = event.target.value.slice(0, 15);
    this.displayText = value;
    event.target.value = value;
  }

  @action
  updatePoints(event) {
    this.points = event.target.value;
  }

  @action
  updateLivingSpace(event) {
    this.livingSpace = event.target.value;
  }

  @action
  handleSubmit(event) {
    event.preventDefault();

    if (!this.isValid) {
      return;
    }

    const factorData = {
      description: this.description.trim(),
      displayText: this.displayText.trim(),
      points: parseFloat(this.points),
      livingSpace: this.livingSpace === 'true',
    };

    // Include ID if editing existing factor
    if (this.args.factor?._id || this.args.factor?.id) {
      factorData.id = this.args.factor._id || this.args.factor.id;
    }

    if (this.args.onSave) {
      this.args.onSave(factorData);
    }
  }
}
