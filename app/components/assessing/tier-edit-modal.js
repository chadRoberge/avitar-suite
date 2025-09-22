import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class TierEditModalComponent extends Component {
  @tracked acreage = '';
  @tracked value = '';

  constructor(owner, args) {
    super(owner, args);
    this.initializeForm();
  }

  initializeForm() {
    if (this.args.tier) {
      this.acreage = this.args.tier.acreage || '';
      this.value = this.args.tier.value || '';
    } else {
      this.acreage = '';
      this.value = '';
    }
  }

  // Update form when modal opens with new data
  get modalData() {
    if (this.args.isOpen) {
      this.initializeForm();
    }
    return this.args.tier;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  updateAcreage(event) {
    this.acreage = event.target.value;
  }

  @action
  updateValue(event) {
    this.value = event.target.value;
  }

  @action
  handleSubmit(event) {
    event.preventDefault();

    const tierData = {
      acreage: parseFloat(this.acreage),
      value: parseFloat(this.value),
    };

    // Include ID if editing existing tier
    if (this.args.tier?.id) {
      tierData.id = this.args.tier.id;
    }

    if (this.args.onSave) {
      this.args.onSave(tierData);
    }
  }
}
