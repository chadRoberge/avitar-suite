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

// Ensure unique acreage per zone
landLadderSchema.index({ zoneId: 1, acreage: 1 }, { unique: true });

// Static method to find land ladder tiers for a zone
landLadderSchema.statics.findByZone = function (zoneId) {
  return this.find({ zoneId, isActive: true }).sort({ order: 1 });
};

// Static method to find all land ladders for a municipality
landLadderSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true })
    .populate('zoneId', 'name')
    .sort({ zoneId: 1, order: 1 });
};

// Static method to find land ladders grouped by zone for a municipality
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

module.exports = mongoose.model('LandLadder', landLadderSchema);
