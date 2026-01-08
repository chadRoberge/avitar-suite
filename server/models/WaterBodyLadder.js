const mongoose = require('mongoose');

const waterBodyLadderSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true,
  },
  waterBodyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WaterBody',
    required: true,
    index: true,
  },
  frontage: {
    type: Number,
    required: true,
    min: 0,
    max: 10000,
  },
  factor: {
    type: Number,
    required: true,
    min: 0,
    max: 1000,
  },
  order: {
    type: Number,
    required: true,
    min: 0,
  },
  effective_year: {
    type: Number,
    required: true,
    index: true,
    min: 2000,
    max: 2099,
  },
  // The first year where this tier is NO LONGER effective (null = still active)
  effective_year_end: {
    type: Number,
    default: null,
    index: true,
  },
  // Version chain for tracking changes across years
  previous_version_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WaterBodyLadder',
    default: null,
  },
  next_version_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WaterBodyLadder',
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for unique frontage per water body per year
waterBodyLadderSchema.index(
  { waterBodyId: 1, frontage: 1, effective_year: 1, isActive: 1 },
  { unique: true },
);

// Index for ordering within water body
waterBodyLadderSchema.index({ waterBodyId: 1, order: 1 });
waterBodyLadderSchema.index({ municipalityId: 1, effective_year: 1 });

// Update the updatedAt field on save
waterBodyLadderSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find by water body (legacy)
waterBodyLadderSchema.statics.findByWaterBody = function (waterBodyId) {
  return this.find({ waterBodyId, isActive: true }).sort({ order: 1 });
};

// Static method to find by water body for a specific year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
waterBodyLadderSchema.statics.findByWaterBodyForYear = async function (
  waterBodyId,
  year,
) {
  // Find all tiers that are effective for this year
  // A tier is effective if:
  // 1. effective_year <= requested year (it has started)
  // 2. effective_year_end is null OR > requested year (it hasn't ended)
  return this.find({
    waterBodyId,
    effective_year: { $lte: year },
    $or: [
      { effective_year_end: null },
      { effective_year_end: { $exists: false } },
      { effective_year_end: { $gt: year } },
    ],
    isActive: true,
  }).sort({ order: 1 });
};

// Static method to find by municipality (legacy)
waterBodyLadderSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true })
    .populate('waterBodyId')
    .sort({ waterBodyId: 1, order: 1 });
};

// Static method to find by municipality for a specific year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
waterBodyLadderSchema.statics.findByMunicipalityForYear = async function (
  municipalityId,
  year,
) {
  // Find all tiers that are effective for this year using temporal range
  return this.find({
    municipalityId,
    effective_year: { $lte: year },
    $or: [
      { effective_year_end: null },
      { effective_year_end: { $exists: false } },
      { effective_year_end: { $gt: year } },
    ],
    isActive: true,
  })
    .populate('waterBodyId')
    .sort({ waterBodyId: 1, order: 1 })
    .lean();
};

// Static method to find by municipality and water body (legacy)
waterBodyLadderSchema.statics.findByMunicipalityAndWaterBody = function (
  municipalityId,
  waterBodyId,
) {
  return this.find({ municipalityId, waterBodyId, isActive: true }).sort({
    order: 1,
  });
};

// Static method to find by municipality and water body for a specific year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
waterBodyLadderSchema.statics.findByMunicipalityAndWaterBodyForYear =
  async function (municipalityId, waterBodyId, year) {
    // Find all tiers that are effective for this year
    return this.find({
      municipalityId,
      waterBodyId,
      effective_year: { $lte: year },
      $or: [
        { effective_year_end: null },
        { effective_year_end: { $exists: false } },
        { effective_year_end: { $gt: year } },
      ],
      isActive: true,
    }).sort({ order: 1 });
  };

// Instance method to calculate value for a given frontage using interpolation (legacy)
waterBodyLadderSchema.statics.calculateValue = async function (
  waterBodyId,
  frontage,
) {
  const tiers = await this.findByWaterBody(waterBodyId);

  return this._interpolateValue(tiers, frontage);
};

// Instance method to calculate value for a given frontage for a specific year
waterBodyLadderSchema.statics.calculateValueForYear = async function (
  waterBodyId,
  frontage,
  year,
) {
  const tiers = await this.findByWaterBodyForYear(waterBodyId, year);

  return this._interpolateValue(tiers, frontage);
};

// Private helper method for interpolation
waterBodyLadderSchema.statics._interpolateValue = function (tiers, frontage) {

  if (tiers.length === 0) {
    return 0;
  }

  // Sort by frontage to ensure proper interpolation
  const sortedTiers = tiers.sort((a, b) => a.frontage - b.frontage);

  // If frontage is less than or equal to the smallest tier
  if (frontage <= sortedTiers[0].frontage) {
    return sortedTiers[0].value;
  }

  // If frontage is greater than or equal to the largest tier
  if (frontage >= sortedTiers[sortedTiers.length - 1].frontage) {
    return sortedTiers[sortedTiers.length - 1].value;
  }

  // Find the two tiers to interpolate between
  let lowerTier = sortedTiers[0];
  let upperTier = sortedTiers[sortedTiers.length - 1];

  for (let i = 0; i < sortedTiers.length - 1; i++) {
    if (
      frontage >= sortedTiers[i].frontage &&
      frontage <= sortedTiers[i + 1].frontage
    ) {
      lowerTier = sortedTiers[i];
      upperTier = sortedTiers[i + 1];
      break;
    }
  }

  // Linear interpolation
  const frontageRange = upperTier.frontage - lowerTier.frontage;
  const valueRange = upperTier.value - lowerTier.value;
  const frontageOffset = frontage - lowerTier.frontage;
  const interpolatedValue =
    lowerTier.value + (frontageOffset / frontageRange) * valueRange;

  return Math.round(interpolatedValue);
};

// Static method to create default ladder for a water body
waterBodyLadderSchema.statics.createDefaults = async function (
  municipalityId,
  waterBodyId,
) {
  const defaults = [
    { frontage: 50, value: 80, order: 1 },
    { frontage: 100, value: 100, order: 2 },
    { frontage: 200, value: 120, order: 3 },
    { frontage: 500, value: 150, order: 4 },
  ];

  const results = [];
  for (const defaultTier of defaults) {
    try {
      const existing = await this.findOne({
        municipalityId,
        waterBodyId,
        frontage: defaultTier.frontage,
        isActive: true,
      });

      if (!existing) {
        const created = await this.create({
          municipalityId,
          waterBodyId,
          ...defaultTier,
        });
        results.push(created);
      } else {
        results.push(existing);
      }
    } catch (error) {
      // Skip if duplicate frontage error occurs
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  return results;
};

// Get distinct years that have water body ladder data for a municipality
waterBodyLadderSchema.statics.getAvailableYears = async function (
  municipalityId,
) {
  return this.distinct('effective_year', {
    municipalityId,
    isActive: true,
  });
};

module.exports = mongoose.model('WaterBodyLadder', waterBodyLadderSchema);
