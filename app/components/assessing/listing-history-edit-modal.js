import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class ListingHistoryEditModalComponent extends Component {
  @tracked visitDate = '';
  @tracked visitorCode = '';
  @tracked reasonCode = '';
  @tracked notes = '';

  constructor(owner, args) {
    super(owner, args);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.entry) {
      this.visitDate = this.args.entry.visitDate
        ? new Date(this.args.entry.visitDate).toISOString().split('T')[0]
        : '';
      this.visitorCode = this.args.entry.visitorCode || '';
      this.reasonCode = this.args.entry.reasonCode || '';
      this.notes = this.args.entry.notes || '';
    } else {
      this.visitDate = new Date().toISOString().split('T')[0];
      this.visitorCode = '';
      this.reasonCode = '';
      this.notes = '';
    }
  }

  // Update form when modal opens with new data
  get modalData() {
    if (this.args.isOpen) {
      this.initializeForm();
    }
    return this.args.entry;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  updateVisitDate(event) {
    this.visitDate = event.target.value;
  }

  @action
  updateVisitorCode(event) {
    this.visitorCode = event.target.value.toUpperCase().slice(0, 2);
  }

  @action
  updateReasonCode(event) {
    this.reasonCode = event.target.value.toUpperCase().slice(0, 2);
  }

  @action
  updateNotes(event) {
    this.notes = event.target.value;
  }

  @action
  handleSubmit(event) {
    event.preventDefault();

    const entryData = {
      visitDate: this.visitDate,
      visitorCode: this.visitorCode,
      reasonCode: this.reasonCode,
      notes: this.notes,
    };

    // Include ID if editing existing entry
    if (this.args.entry?._id) {
      entryData._id = this.args.entry._id;
    }

    if (this.args.onSave) {
      this.args.onSave(entryData);
    }
  }

  @action
  handleDelete() {
    if (this.args.onDelete && this.args.entry?._id) {
      this.args.onDelete(this.args.entry._id);
    }
  }
}
