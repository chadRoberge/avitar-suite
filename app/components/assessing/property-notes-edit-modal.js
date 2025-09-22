import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PropertyNotesEditModalComponent extends Component {
  @tracked notes = '';

  constructor(owner, args) {
    super(owner, args);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.notes) {
      this.notes = this.args.notes.notes || '';
    } else {
      this.notes = '';
    }
  }

  // Update form when modal opens with new data
  get modalData() {
    if (this.args.isOpen) {
      this.initializeForm();
    }
    return this.args.notes;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  updateNotes(event) {
    this.notes = event.target.value;
  }

  @action
  handleSubmit(event) {
    event.preventDefault();

    const notesData = {
      notes: this.notes,
    };

    if (this.args.onSave) {
      this.args.onSave(notesData);
    }
  }
}
