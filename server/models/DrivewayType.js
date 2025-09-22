const mongoose = require('mongoose');

const drivewayTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Driveway type name is required'],
      trim: true,
      maxlength: [50, 'Driveway type name cannot exceed 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [
        200,
        'Driveway type description cannot exceed 200 characters',
      ],
    },
    adjustmentFactor: {
      type: Number,
      default: 1.0,
      min: [0.5, 'Adjustment factor must be at least 0.5'],
      max: [1.5, 'Adjustment factor cannot exceed 1.5'],
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
drivewayTypeSchema.index({ municipalityId: 1, name: 1 }, { unique: true });

// Static method to find driveway types for a municipality
drivewayTypeSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true }).sort({ name: 1 });
};

module.exports = mongoose.model('DrivewayType', drivewayTypeSchema);
