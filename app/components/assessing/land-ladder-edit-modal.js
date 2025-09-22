import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { cached } from '@glimmer/tracking';

export default class LandLadderEditModalComponent extends Component {
  @tracked tiers = [];
  @tracked validationErrors = [];

  constructor(owner, args) {
    super(owner, args);
    this.initializeTiers();
  }

  initializeTiers() {
    if (this.args.ladder?.tiers) {
      // Clone the existing tiers
      this.tiers = this.args.ladder.tiers.map((tier) => ({
        id: tier.id,
        acreage: tier.acreage,
        value: tier.value,
        order: tier.order,
      }));
    } else {
      this.tiers = [];
    }
  }

  // Track when the ladder changes to reinitialize tiers
  @cached
  get ladderTracker() {
    if (this.args.isOpen) {
      const ladderId = this.args.ladder?.id || this.args.zone?.id || 'new';
      const currentLadderId = this._lastLadderId;

      if (ladderId !== currentLadderId) {
        this._lastLadderId = ladderId;
        // Use setTimeout to avoid updating during render
        setTimeout(() => {
          if (this.args.isOpen) {
            this.initializeTiers();
          }
        }, 0);
      }

      return ladderId;
    }
    return null;
  }

  get hasValidationErrors() {
    return this.validationErrors.length > 0;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  addTier() {
    const newTier = {
      id: null, // New tier, no ID yet
      acreage: '',
      value: '',
      order: this.tiers.length,
    };
    this.tiers = [...this.tiers, newTier];
  }

  @action
  removeTier(index) {
    const newTiers = [...this.tiers];
    newTiers.splice(index, 1);

    // Update order for remaining tiers
    newTiers.forEach((tier, idx) => {
      tier.order = idx;
    });

    this.tiers = newTiers;
  }

  @action
  updateTierAcreage(index, event) {
    const newTiers = [...this.tiers];
    newTiers[index].acreage = parseFloat(event.target.value) || '';
    this.tiers = newTiers;
  }

  @action
  updateTierValue(index, event) {
    const newTiers = [...this.tiers];
    newTiers[index].value = parseFloat(event.target.value) || '';
    this.tiers = newTiers;
  }

  @action
  moveTierUp(index) {
    if (index === 0) return;

    const newTiers = [...this.tiers];
    // Swap with previous tier
    [newTiers[index - 1], newTiers[index]] = [
      newTiers[index],
      newTiers[index - 1],
    ];

    // Update order values
    newTiers.forEach((tier, idx) => {
      tier.order = idx;
    });

    this.tiers = newTiers;
  }

  @action
  moveTierDown(index) {
    if (index === this.tiers.length - 1) return;

    const newTiers = [...this.tiers];
    // Swap with next tier
    [newTiers[index], newTiers[index + 1]] = [
      newTiers[index + 1],
      newTiers[index],
    ];

    // Update order values
    newTiers.forEach((tier, idx) => {
      tier.order = idx;
    });

    this.tiers = newTiers;
  }

  @action
  validateTiers() {
    const errors = [];

    if (this.tiers.length === 0) {
      errors.push('At least one tier is required');
      this.validationErrors = errors;
      return false;
    }

    // Check for empty values
    this.tiers.forEach((tier, index) => {
      if (!tier.acreage || tier.acreage <= 0) {
        errors.push(
          `Tier ${index + 1}: Acreage is required and must be greater than 0`,
        );
      }
      if (!tier.value || tier.value <= 0) {
        errors.push(
          `Tier ${index + 1}: Land value is required and must be greater than 0`,
        );
      }
    });

    // Check for duplicate acreage values
    const acreageValues = this.tiers.map((t) => t.acreage).filter((a) => a);
    const duplicateAcreage = acreageValues.filter(
      (value, index) => acreageValues.indexOf(value) !== index,
    );

    if (duplicateAcreage.length > 0) {
      errors.push('Duplicate acreage values are not allowed');
    }

    this.validationErrors = errors;
    return errors.length === 0;
  }

  @action
  async saveLadder() {
    // Clear previous validation errors
    this.validationErrors = [];

    if (!this.validateTiers()) {
      return;
    }

    try {
      // Sort tiers by acreage before saving
      const sortedTiers = [...this.tiers].sort((a, b) => a.acreage - b.acreage);

      // Update order based on sorted position
      sortedTiers.forEach((tier, index) => {
        tier.order = index;
      });

      const ladderData = {
        zoneId: this.args.zone.id,
        zoneName: this.args.zone.name,
        tiers: sortedTiers,
      };

      if (this.args.onSave) {
        await this.args.onSave(ladderData);
      }
    } catch (error) {
      // Handle server-side validation errors
      if (error.message) {
        this.validationErrors = [error.message];
      } else {
        this.validationErrors = [
          'Failed to save land ladder. Please try again.',
        ];
      }
    }
  }
}
