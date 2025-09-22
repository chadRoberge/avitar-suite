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
  value: {
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

// Compound index for unique frontage per water body
waterBodyLadderSchema.index(
  { waterBodyId: 1, frontage: 1, isActive: 1 },
  { unique: true },
);

// Index for ordering within water body
waterBodyLadderSchema.index({ waterBodyId: 1, order: 1 });

// Update the updatedAt field on save
waterBodyLadderSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find by water body
waterBodyLadderSchema.statics.findByWaterBody = function (waterBodyId) {
  return this.find({ waterBodyId, isActive: true }).sort({ order: 1 });
};

// Static method to find by municipality
waterBodyLadderSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true })
    .populate('waterBodyId')
    .sort({ waterBodyId: 1, order: 1 });
};

// Static method to find by municipality and water body
waterBodyLadderSchema.statics.findByMunicipalityAndWaterBody = function (
  municipalityId,
  waterBodyId,
) {
  return this.find({ municipalityId, waterBodyId, isActive: true }).sort({
    order: 1,
  });
};

// Instance method to calculate value for a given frontage using interpolation
waterBodyLadderSchema.statics.calculateValue = async function (
  waterBodyId,
  frontage,
) {
  const tiers = await this.findByWaterBody(waterBodyId);

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

module.exports = mongoose.model('WaterBodyLadder', waterBodyLadderSchema);
