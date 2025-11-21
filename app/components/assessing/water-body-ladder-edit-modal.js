import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class WaterBodyLadderEditModalComponent extends Component {
  @service api;

  @tracked tiers = [];
  @tracked validationErrors = [];
  @tracked ladderTracker = 0;
  @tracked inputValues = {};

  constructor() {
    super(...arguments);
    this.initializeTiers();
  }

  get hasValidationErrors() {
    return this.validationErrors.length > 0;
  }

  @tracked graphData = [];

  updateGraphData() {
    this.graphData = this.tiers
      .filter((tier) => tier.frontage && tier.value)
      .map((tier) => ({
        frontage: parseFloat(tier.frontage),
        value: parseFloat(tier.value),
      }));
  }

  initializeTiers() {
    if (this.args.waterBodyLadder && this.args.waterBodyLadder.entries) {
      this.tiers = this.args.waterBodyLadder.entries.map((entry, index) => ({
        id: entry.id,
        frontage: entry.frontage,
        // Handle both 'factor' (current) and 'value' (legacy) field names
        value: entry.factor ?? entry.value,
        order: entry.order || index + 1,
      }));
    } else {
      this.tiers = [];
    }

    // Initialize input values
    this.inputValues = {};
    this.tiers.forEach((tier, index) => {
      this.inputValues[`frontage_${index}`] = tier.frontage;
      this.inputValues[`value_${index}`] = tier.value;
    });

    this.updateGraphData();
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  addTier() {
    const newOrder = this.tiers.length + 1;
    const newIndex = this.tiers.length;

    this.tiers = [
      ...this.tiers,
      {
        frontage: '',
        value: '',
        order: newOrder,
      },
    ];

    this.inputValues[`frontage_${newIndex}`] = '';
    this.inputValues[`value_${newIndex}`] = '';

    this.updateGraphData();
  }

  @action
  removeTier(index) {
    this.tiers = this.tiers.filter((_, i) => i !== index);
    // Reorder remaining tiers
    this.tiers = this.tiers.map((tier, i) => ({
      ...tier,
      order: i + 1,
    }));

    // Rebuild input values for remaining tiers
    const newInputValues = {};
    this.tiers.forEach((tier, i) => {
      newInputValues[`frontage_${i}`] = tier.frontage;
      newInputValues[`value_${i}`] = tier.value;
    });
    this.inputValues = newInputValues;

    this.updateGraphData();
  }

  @action
  moveTierUp(index) {
    if (index > 0) {
      const newTiers = [...this.tiers];
      [newTiers[index - 1], newTiers[index]] = [
        newTiers[index],
        newTiers[index - 1],
      ];

      // Update order values
      newTiers.forEach((tier, i) => {
        tier.order = i + 1;
      });

      this.tiers = newTiers;
      this.updateGraphData();
    }
  }

  @action
  moveTierDown(index) {
    if (index < this.tiers.length - 1) {
      const newTiers = [...this.tiers];
      [newTiers[index], newTiers[index + 1]] = [
        newTiers[index + 1],
        newTiers[index],
      ];

      // Update order values
      newTiers.forEach((tier, i) => {
        tier.order = i + 1;
      });

      this.tiers = newTiers;
      this.updateGraphData();
    }
  }

  @action
  updateTierFrontage(index, event) {
    this.inputValues[`frontage_${index}`] = event.target.value;
  }

  @action
  updateTierValue(index, event) {
    this.inputValues[`value_${index}`] = event.target.value;
  }

  @action
  syncTierData(index) {
    const frontage = this.inputValues[`frontage_${index}`];
    const value = this.inputValues[`value_${index}`];

    this.tiers[index].frontage = frontage;
    this.tiers[index].value = value;

    this.updateGraphData();
  }

  @action
  validateTiers() {
    const errors = [];
    const frontages = [];

    this.tiers.forEach((tier, index) => {
      const tierNum = index + 1;

      // Validate frontage
      if (!tier.frontage || tier.frontage === '') {
        errors.push(`Tier ${tierNum}: Frontage is required`);
      } else if (tier.frontage < 0) {
        errors.push(`Tier ${tierNum}: Frontage must be positive`);
      } else if (tier.frontage > 10000) {
        errors.push(`Tier ${tierNum}: Frontage must be 10,000 feet or less`);
      } else if (frontages.includes(tier.frontage)) {
        errors.push(`Tier ${tierNum}: Duplicate frontage value`);
      } else {
        frontages.push(tier.frontage);
      }

      // Validate factor (value field)
      if (!tier.value || tier.value === '') {
        errors.push(`Tier ${tierNum}: Factor is required`);
      } else if (tier.value < 0) {
        errors.push(`Tier ${tierNum}: Factor must be positive`);
      } else if (tier.value > 1000) {
        errors.push(`Tier ${tierNum}: Factor must be 1,000 or less`);
      }
    });

    this.validationErrors = errors;
    return errors.length === 0;
  }

  @action
  async saveLadder() {
    if (!this.validateTiers()) {
      return;
    }

    try {
      const municipalityId = this.args.municipalityId;
      const waterBodyId =
        this.args.waterBodyId ||
        this.args.waterBody?.id ||
        this.args.waterBody?._id;

      // Sort tiers by frontage for consistent ordering
      const sortedTiers = [...this.tiers].sort(
        (a, b) => a.frontage - b.frontage,
      );

      // Update order based on sorted frontage
      sortedTiers.forEach((tier, index) => {
        tier.order = index + 1;
      });

      const ladderData = {
        waterBodyId,
        entries: sortedTiers.map((tier) => ({
          id: tier.id,
          frontage: parseFloat(tier.frontage),
          factor: parseFloat(tier.value), // Server expects 'factor' not 'value'
          order: tier.order,
        })),
      };

      await this.args.onSave(ladderData);
    } catch (error) {
      console.error('Error saving water body ladder:', error);
      this.validationErrors = [
        'Failed to save water body ladder. Please try again.',
      ];
    }
  }
}
