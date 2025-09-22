const mongoose = require('mongoose');

const siteConditionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Site condition name is required'],
      trim: true,
      maxlength: [50, 'Site condition name cannot exceed 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [
        200,
        'Site condition description cannot exceed 200 characters',
      ],
    },
    adjustmentFactor: {
      type: Number,
      default: 1.0,
      min: [0.1, 'Adjustment factor must be at least 0.1'],
      max: [2.0, 'Adjustment factor cannot exceed 2.0'],
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

// Index for municipality-specific queries
siteConditionSchema.index({ municipalityId: 1, name: 1 }, { unique: true });

// Static method to find site conditions for a municipality
siteConditionSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true }).sort({ name: 1 });
};

module.exports = mongoose.model('SiteCondition', siteConditionSchema);
