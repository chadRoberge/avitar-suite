const mongoose = require('mongoose');

const roadTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Road type name is required'],
      trim: true,
      maxlength: [50, 'Road type name cannot exceed 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Road type description cannot exceed 200 characters'],
    },
    adjustmentFactor: {
      type: Number,
      default: 1.0,
      min: [0.8, 'Adjustment factor must be at least 0.8'],
      max: [1.2, 'Adjustment factor cannot exceed 1.2'],
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
roadTypeSchema.index({ municipalityId: 1, name: 1 }, { unique: true });

// Static method to find road types for a municipality
roadTypeSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true }).sort({ name: 1 });
};

module.exports = mongoose.model('RoadType', roadTypeSchema);
