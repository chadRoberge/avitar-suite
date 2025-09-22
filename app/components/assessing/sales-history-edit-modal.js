import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class SalesHistoryEditModalComponent extends Component {
  @tracked saleDate = '';
  @tracked salePrice = '';
  @tracked buyer = '';
  @tracked seller = '';
  @tracked saleType = '';
  @tracked verified = false;
  @tracked notes = '';

  constructor(owner, args) {
    super(owner, args);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.entry) {
      this.saleDate = this.args.entry.saleDate
        ? new Date(this.args.entry.saleDate).toISOString().split('T')[0]
        : '';
      this.salePrice = this.args.entry.salePrice || '';
      this.buyer = this.args.entry.buyer || '';
      this.seller = this.args.entry.seller || '';
      this.saleType = this.args.entry.saleType || '';
      this.verified = this.args.entry.verified || false;
      this.notes = this.args.entry.notes || '';
    } else {
      this.saleDate = '';
      this.salePrice = '';
      this.buyer = '';
      this.seller = '';
      this.saleType = '';
      this.verified = false;
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
  updateSaleDate(event) {
    this.saleDate = event.target.value;
  }

  @action
  updateSalePrice(event) {
    this.salePrice = event.target.value;
  }

  @action
  updateBuyer(event) {
    this.buyer = event.target.value;
  }

  @action
  updateSeller(event) {
    this.seller = event.target.value;
  }

  @action
  updateSaleType(event) {
    this.saleType = event.target.value;
  }

  @action
  updateVerified(event) {
    this.verified = event.target.checked;
  }

  @action
  updateNotes(event) {
    this.notes = event.target.value;
  }

  @action
  handleSubmit(event) {
    event.preventDefault();

    const entryData = {
      saleDate: this.saleDate,
      salePrice: parseFloat(this.salePrice),
      buyer: this.buyer,
      seller: this.seller,
      saleType: this.saleType,
      verified: this.verified,
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
