const mongoose = require('mongoose');

const landLadderSchema = new mongoose.Schema(
  {
    acreage: {
      type: Number,
      required: [true, 'Acreage is required'],
      min: [0, 'Acreage must be positive'],
    },
    value: {
      type: Number,
      required: [true, 'Land value is required'],
      min: [0, 'Land value must be positive'],
    },
    order: {
      type: Number,
      required: [true, 'Order is required'],
      min: [0, 'Order must be non-negative'],
    },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      required: [true, 'Zone ID is required'],
      index: true,
    },
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: [true, 'Municipality ID is required'],
      index: true,
    },
    effective_year: {
      type: Number,
      required: [true, 'Effective year is required'],
      index: true,
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
      ref: 'LandLadder',
      default: null,
    },
    next_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LandLadder',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Index for zone-specific queries, ordered by order field
landLadderSchema.index({ zoneId: 1, order: 1 });
landLadderSchema.index({ municipalityId: 1, zoneId: 1 });
landLadderSchema.index({ municipalityId: 1, effective_year: 1 });

// Ensure unique acreage per zone per year
landLadderSchema.index(
  { zoneId: 1, acreage: 1, effective_year: 1 },
  { unique: true },
);

// Static method to find land ladder tiers for a zone (legacy - uses current year)
landLadderSchema.statics.findByZone = function (zoneId) {
  return this.find({ zoneId, isActive: true }).sort({ order: 1 });
};

// Static method to find land ladder tiers for a zone for a specific year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
landLadderSchema.statics.findByZoneForYear = async function (zoneId, year) {
  // Find all tiers that are effective for this year
  // A tier is effective if:
  // 1. effective_year <= requested year (it has started)
  // 2. effective_year_end is null OR > requested year (it hasn't ended)
  return this.find({
    zoneId,
    effective_year: { $lte: year },
    $or: [
      { effective_year_end: null },
      { effective_year_end: { $exists: false } },
      { effective_year_end: { $gt: year } },
    ],
    isActive: true,
  }).sort({ order: 1 });
};

// Static method to find all land ladders for a municipality (legacy)
landLadderSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true })
    .populate('zoneId', 'name')
    .sort({ zoneId: 1, order: 1 });
};

// Static method to find all land ladders for a municipality for a specific year
landLadderSchema.statics.findByMunicipalityForYear = function (
  municipalityId,
  year,
) {
  return this.find({ municipalityId, effective_year: year, isActive: true })
    .populate('zoneId', 'name')
    .sort({ zoneId: 1, order: 1 });
};

// Static method to find land ladders grouped by zone for a municipality (legacy)
landLadderSchema.statics.findGroupedByZone = function (municipalityId) {
  // Convert string to ObjectId properly for newer mongoose versions
  const objectId = mongoose.Types.ObjectId.isValid(municipalityId)
    ? new mongoose.Types.ObjectId(municipalityId)
    : municipalityId;

  return this.aggregate([
    { $match: { municipalityId: objectId, isActive: true } },
    { $sort: { order: 1 } },
    {
      $group: {
        _id: '$zoneId',
        tiers: {
          $push: {
            id: '$_id',
            acreage: '$acreage',
            value: '$value',
            order: '$order',
          },
        },
      },
    },
    {
      $lookup: {
        from: 'zones',
        localField: '_id',
        foreignField: '_id',
        as: 'zone',
      },
    },
    {
      $unwind: '$zone',
    },
    {
      $project: {
        id: { $toString: '$_id' },
        zoneId: { $toString: '$_id' },
        zoneName: '$zone.name',
        tiers: 1,
        _id: 0,
      },
    },
  ]);
};

// Static method to find land ladders grouped by zone for a specific year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
landLadderSchema.statics.findGroupedByZoneForYear = async function (
  municipalityId,
  year,
) {
  const objectId = mongoose.Types.ObjectId.isValid(municipalityId)
    ? new mongoose.Types.ObjectId(municipalityId)
    : municipalityId;

  // Find all tiers that are effective for this year using temporal range
  // A tier is effective if:
  // 1. effective_year <= requested year (it has started)
  // 2. effective_year_end is null OR > requested year (it hasn't ended)
  const allTiers = await this.find({
    municipalityId: objectId,
    isActive: true,
    effective_year: { $lte: year },
    $or: [
      { effective_year_end: null },
      { effective_year_end: { $exists: false } },
      { effective_year_end: { $gt: year } },
    ],
  })
    .populate('zoneId', 'name')
    .sort({ order: 1 })
    .lean();

  // Group by zone
  const zoneGroups = {};
  allTiers.forEach((tier) => {
    if (!tier.zoneId) return; // Skip if zone was deleted
    const zoneIdStr = tier.zoneId._id.toString();
    if (!zoneGroups[zoneIdStr]) {
      zoneGroups[zoneIdStr] = {
        id: zoneIdStr,
        zoneId: zoneIdStr,
        zoneName: tier.zoneId.name,
        effectiveYear: tier.effective_year,
        tiers: [],
      };
    }
    zoneGroups[zoneIdStr].tiers.push({
      id: tier._id.toString(),
      acreage: tier.acreage,
      value: tier.value,
      order: tier.order,
      effective_year: tier.effective_year,
    });
  });

  // Sort tiers by order within each zone
  Object.values(zoneGroups).forEach((zone) => {
    zone.tiers.sort((a, b) => a.order - b.order);
  });

  return Object.values(zoneGroups);
};

// Get distinct years that have land ladder data for a municipality
landLadderSchema.statics.getAvailableYears = async function (municipalityId) {
  const objectId = mongoose.Types.ObjectId.isValid(municipalityId)
    ? new mongoose.Types.ObjectId(municipalityId)
    : municipalityId;

  return this.distinct('effective_year', {
    municipalityId: objectId,
    isActive: true,
  });
};

module.exports = mongoose.model('LandLadder', landLadderSchema);
