const mongoose = require('mongoose');

// Building Assessment Calculation Configuration
// These are the changeable parameters for building value calculations
const buildingCalculationConfigSchema = new mongoose.Schema(
  {
    municipality_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      unique: true, // One config per municipality
      index: true,
    },

    // Assessment year this config applies to
    effective_year: { type: Number, required: true, index: true },

    // Bedroom/Bathroom rate calculator configuration
    bedroom_bath_config: {
      base: { type: Number, default: 5 },
      perBedroom: { type: Number, default: 3 },
      perFullBath: { type: Number, default: 2 },
      perHalfBath: { type: Number, default: 0.8 },
    },

    // Building feature point multipliers
    calculation_factors: {
      pointMultiplier: { type: Number, default: 1.0 }, // How much each point is worth
      baseRate: { type: Number, default: 100 }, // Base rate per square foot or building unit
    },

    // Ratio adjustment factors
    ratio_adjustments: {
      luxury_threshold: { type: Number, default: 1.0 }, // Bathroom to bedroom ratio for luxury modifier
      luxury_modifier: { type: Number, default: 1.1 },
      good_ratio_threshold: { type: Number, default: 0.75 },
      good_ratio_modifier: { type: Number, default: 1.05 },
      poor_ratio_threshold: { type: Number, default: 0.5 },
      poor_ratio_modifier: { type: Number, default: 0.95 },
    },

    // Common sense adjustment factors
    special_adjustments: {
      three_br_no_half_bath_modifier: { type: Number, default: 0.97 },
      two_br_one_half_bath_ideal_modifier: { type: Number, default: 1.03 },
    },

    // Miscellaneous item points
    miscellaneous_points: {
      air_conditioning: {
        points_per_10_percent: { type: Number, default: 1 }, // 100% = 10 points, 80% = 8 points, etc.
      },
      generator: {
        default_points: { type: Number, default: 5 },
      },
      extra_kitchen: {
        points_per_kitchen: { type: Number, default: 1 }, // Direct points per extra kitchen
      },
    },

    // Economies of scale configuration
    economies_of_scale: {
      residential: {
        median_size: { type: Number, default: 1800 }, // Square feet
        smallest_size: { type: Number, default: 100 }, // Smallest size threshold
        smallest_factor: { type: Number, default: 3.0 }, // Factor for smallest buildings
        largest_size: { type: Number, default: 15000 }, // Largest size threshold
        largest_factor: { type: Number, default: 0.75 }, // Factor for largest buildings
      },
      commercial: {
        median_size: { type: Number, default: 5000 }, // Square feet
        smallest_size: { type: Number, default: 500 }, // Smallest size threshold
        smallest_factor: { type: Number, default: 2.5 }, // Factor for smallest buildings
        largest_size: { type: Number, default: 50000 }, // Largest size threshold
        largest_factor: { type: Number, default: 0.8 }, // Factor for largest buildings
      },
      industrial: {
        median_size: { type: Number, default: 10000 }, // Square feet
        smallest_size: { type: Number, default: 1000 }, // Smallest size threshold
        smallest_factor: { type: Number, default: 2.0 }, // Factor for smallest buildings
        largest_size: { type: Number, default: 100000 }, // Largest size threshold
        largest_factor: { type: Number, default: 0.85 }, // Factor for largest buildings
      },
      manufactured: {
        median_size: { type: Number, default: 1200 }, // Square feet
        smallest_size: { type: Number, default: 50 }, // Smallest size threshold
        smallest_factor: { type: Number, default: 4.0 }, // Factor for smallest buildings
        largest_size: { type: Number, default: 3000 }, // Largest size threshold
        largest_factor: { type: Number, default: 0.7 }, // Factor for largest buildings
      },
    },

    // Audit trail
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_at: { type: Date, default: Date.now },

    // Change tracking
    last_changed: { type: Date, default: Date.now },
    change_reason: {
      type: String,
      enum: [
        'initial_setup',
        'rate_adjustment',
        'revaluation',
        'policy_change',
        'annual_update',
        'economies_of_scale_update',
      ],
      default: 'initial_setup',
    },
  },
  {
    collection: 'building_calculation_configs',
  },
);

// Compound index for municipality + year uniqueness
buildingCalculationConfigSchema.index(
  { municipality_id: 1, effective_year: 1 },
  { unique: true },
);

// Update the updated_at field on save
buildingCalculationConfigSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
    this.last_changed = new Date();
  }
  next();
});

// Static method to get or create config for a municipality
buildingCalculationConfigSchema.statics.getOrCreateForMunicipality =
  async function (municipalityId, year = null) {
    const currentYear = year || new Date().getFullYear();

    let config = await this.findOne({
      municipality_id: municipalityId,
      effective_year: currentYear,
    });

    if (!config) {
      config = new this({
        municipality_id: municipalityId,
        effective_year: currentYear,
      });
      await config.save();
    }

    return config;
  };

// Instance method to convert to calculation config object
buildingCalculationConfigSchema.methods.toCalculationConfig = function () {
  return {
    // Bedroom/Bathroom rate calculator config
    base: this.bedroom_bath_config.base,
    perBedroom: this.bedroom_bath_config.perBedroom,
    perFullBath: this.bedroom_bath_config.perFullBath,
    perHalfBath: this.bedroom_bath_config.perHalfBath,

    // Building feature point multipliers
    pointMultiplier: this.calculation_factors.pointMultiplier,
    baseRate: this.calculation_factors.baseRate,

    // Ratio adjustments
    ratioAdjustments: this.ratio_adjustments,
    specialAdjustments: this.special_adjustments,
    miscellaneousPoints: this.miscellaneous_points,

    // Economies of scale
    economiesOfScale: this.economies_of_scale,
  };
};

module.exports = mongoose.model(
  'BuildingCalculationConfig',
  buildingCalculationConfigSchema,
);
