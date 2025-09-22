const mongoose = require('mongoose');

const sketchSubAreaFactorSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    displayText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 15,
    },
    points: {
      type: Number,
      required: true,
      min: -1000,
      max: 1000,
    },
    livingSpace: {
      type: Boolean,
      required: true,
      default: false,
    },
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index to ensure unique display text per municipality
sketchSubAreaFactorSchema.index(
  { displayText: 1, municipalityId: 1 },
  { unique: true },
);

// Static method to find all factors for a municipality
sketchSubAreaFactorSchema.statics.findByMunicipality = function (
  municipalityId,
) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    isActive: true,
  }).sort({ displayText: 1 });
};

module.exports = mongoose.model(
  'SketchSubAreaFactor',
  sketchSubAreaFactorSchema,
);
