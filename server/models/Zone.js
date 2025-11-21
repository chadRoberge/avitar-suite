const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Zone name is required'],
      trim: true,
      maxlength: [50, 'Zone name cannot exceed 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Zone description cannot exceed 200 characters'],
    },
    minimumAcreage: {
      type: Number,
      required: false,
      default: 0,
      min: [0, 'Minimum acreage must be positive'],
    },
    minimumFrontage: {
      type: Number,
      required: false,
      default: 0,
      min: [0, 'Minimum frontage must be positive'],
    },
    // Land valuation rates
    excessLandCostPerAcre: {
      type: Number,
      default: 0,
      min: [0, 'Excess land cost must be positive'],
    },
    excessFrontageCostPerFoot: {
      type: Number,
      default: 0,
      min: [0, 'Excess frontage cost must be positive'],
    },
    // View assessment base value
    baseViewValue: {
      type: Number,
      default: 0,
      min: [0, 'Base view value must be positive'],
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
zoneSchema.index({ municipalityId: 1, name: 1 }, { unique: true });

// Static method to find zones for a municipality
zoneSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true }).sort({ name: 1 });
};

module.exports = mongoose.model('Zone', zoneSchema);
