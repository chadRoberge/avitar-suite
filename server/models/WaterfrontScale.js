const mongoose = require('mongoose');

const waterfrontScaleSchema = new mongoose.Schema(
  {
    frontage: {
      type: Number,
      required: [true, 'Frontage is required'],
      min: [0, 'Frontage must be positive'],
    },
    factor: {
      type: Number,
      required: [true, 'Frontage factor is required'],
      min: [0, 'Frontage factor must be positive'],
    },
    order: {
      type: Number,
      required: [true, 'Order is required'],
      min: [0, 'Order must be non-negative'],
    },
    waterBodyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WaterBody',
      required: [true, 'Water Body ID is required'],
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

// Index for water body-specific queries, ordered by order field
waterfrontScaleSchema.index({ waterBodyId: 1, order: 1 });
waterfrontScaleSchema.index({ municipalityId: 1, waterBodyId: 1 });

// Ensure unique frontage per water body
waterfrontScaleSchema.index({ waterBodyId: 1, frontage: 1 }, { unique: true });

// Static method to find waterfront scale tiers for a water body
waterfrontScaleSchema.statics.findByWaterBody = function (waterBodyId) {
  return this.find({ waterBodyId, isActive: true }).sort({ order: 1 });
};

// Static method to find all waterfront scales for a municipality
waterfrontScaleSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true })
    .populate('waterBodyId', 'name')
    .sort({ waterBodyId: 1, order: 1 });
};

// Static method to find waterfront scales grouped by water body for a municipality
waterfrontScaleSchema.statics.findGroupedByWaterBody = function (
  municipalityId,
) {
  // Convert string to ObjectId properly for newer mongoose versions
  const objectId = mongoose.Types.ObjectId.isValid(municipalityId)
    ? new mongoose.Types.ObjectId(municipalityId)
    : municipalityId;

  return this.aggregate([
    { $match: { municipalityId: objectId, isActive: true } },
    { $sort: { order: 1 } },
    {
      $group: {
        _id: '$waterBodyId',
        tiers: {
          $push: {
            id: '$_id',
            frontage: '$frontage',
            factor: '$factor',
            order: '$order',
          },
        },
      },
    },
    {
      $lookup: {
        from: 'waterbodies',
        localField: '_id',
        foreignField: '_id',
        as: 'waterBody',
      },
    },
    {
      $unwind: '$waterBody',
    },
    {
      $project: {
        id: { $toString: '$_id' },
        waterBodyId: { $toString: '$_id' },
        waterBodyName: '$waterBody.name',
        tiers: 1,
        _id: 0,
      },
    },
  ]);
};

module.exports = mongoose.model('WaterfrontScale', waterfrontScaleSchema);
