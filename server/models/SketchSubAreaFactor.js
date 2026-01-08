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
    effective_year: {
      type: Number,
      required: true,
      index: true,
    },
    // The first year where this factor is NO LONGER effective (null = still active)
    effective_year_end: {
      type: Number,
      default: null,
      index: true,
    },
    // Version chain for tracking changes across years
    previous_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SketchSubAreaFactor',
      default: null,
    },
    next_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SketchSubAreaFactor',
      default: null,
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

// Compound index to ensure unique display text per municipality per year
sketchSubAreaFactorSchema.index(
  { displayText: 1, municipalityId: 1, effective_year: 1 },
  { unique: true },
);
sketchSubAreaFactorSchema.index({ municipalityId: 1, effective_year: 1 });

// Static method to find all factors for a municipality (legacy)
sketchSubAreaFactorSchema.statics.findByMunicipality = function (
  municipalityId,
) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    isActive: true,
  }).sort({ displayText: 1 });
};

// Static method to find all factors for a municipality for a specific year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
sketchSubAreaFactorSchema.statics.findByMunicipalityForYear = async function (
  municipalityId,
  year,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);

  // Find all factors that are effective for this year
  // A factor is effective if:
  // 1. effective_year <= requested year (it has started)
  // 2. effective_year_end is null OR > requested year (it hasn't ended)
  return this.find({
    municipalityId: objectId,
    effective_year: { $lte: year },
    $or: [
      { effective_year_end: null },
      { effective_year_end: { $exists: false } },
      { effective_year_end: { $gt: year } },
    ],
    isActive: true,
  }).sort({ displayText: 1 });
};

// Find a specific factor by display text for a year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
sketchSubAreaFactorSchema.statics.findByDisplayTextForYear = async function (
  municipalityId,
  displayText,
  year,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);

  // Find the factor that is effective for this year
  return this.findOne({
    municipalityId: objectId,
    displayText,
    effective_year: { $lte: year },
    $or: [
      { effective_year_end: null },
      { effective_year_end: { $exists: false } },
      { effective_year_end: { $gt: year } },
    ],
    isActive: true,
  }).sort({ effective_year: -1 });
};

// Get distinct years that have sketch sub-area factor data for a municipality
sketchSubAreaFactorSchema.statics.getAvailableYears = async function (
  municipalityId,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);
  return this.distinct('effective_year', {
    municipalityId: objectId,
    isActive: true,
  });
};

module.exports = mongoose.model(
  'SketchSubAreaFactor',
  sketchSubAreaFactorSchema,
);
