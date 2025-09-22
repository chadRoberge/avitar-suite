import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class SaveableCardComponent extends Component {
  @tracked hasChanges = false;
  @tracked isSaving = false;
  @tracked originalValues = {};

  constructor() {
    super(...arguments);
    this.captureOriginalValues();
  }

  captureOriginalValues() {
    this.originalValues = JSON.parse(JSON.stringify(this.args.data || {}));
  }

  @action
  onInputChange(field, value) {
    if (this.args.onInputChange) {
      this.args.onInputChange(field, value);
    }
    this.checkForChanges();
  }

  @action
  checkForChanges() {
    const currentValues = this.args.data || {};
    this.hasChanges =
      JSON.stringify(currentValues) !== JSON.stringify(this.originalValues);
  }

  @action
  async save() {
    if (!this.hasChanges || this.isSaving) return;

    this.isSaving = true;

    try {
      if (this.args.onSave) {
        await this.args.onSave(this.args.data);
      }

      // Update original values after successful save
      this.captureOriginalValues();
      this.hasChanges = false;
    } catch (error) {
      console.error('Save failed:', error);
      // Could add error handling/notification here
    } finally {
      this.isSaving = false;
    }
  }

  @action
  reset() {
    if (this.args.onReset) {
      this.args.onReset(this.originalValues);
    }
    this.hasChanges = false;
  }
}
