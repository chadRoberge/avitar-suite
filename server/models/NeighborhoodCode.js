const mongoose = require('mongoose');

const neighborhoodCodeSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 1,
      maxlength: 10,
      trim: true,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
      max: 1000,
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
      min: 2000,
      max: 2099,
    },
    // The first year where this code is NO LONGER effective (null = still active)
    effective_year_end: {
      type: Number,
      default: null,
      index: true,
    },
    // Version chain for tracking changes across years
    previous_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NeighborhoodCode',
      default: null,
    },
    next_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NeighborhoodCode',
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

// Compound index to ensure unique codes per municipality per year
neighborhoodCodeSchema.index(
  { code: 1, municipalityId: 1, effective_year: 1 },
  { unique: true },
);
neighborhoodCodeSchema.index({ municipalityId: 1, effective_year: 1 });

// Static method to find all codes for a municipality (legacy)
neighborhoodCodeSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    isActive: true,
  }).sort({ code: 1 });
};

// Static method to find all codes for a municipality for a specific year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
neighborhoodCodeSchema.statics.findByMunicipalityForYear = async function (
  municipalityId,
  year,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);

  // Find all codes that are effective for this year
  // A code is effective if:
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
  }).sort({ code: 1 });
};

// Find a specific neighborhood code by code string for a year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
neighborhoodCodeSchema.statics.findByCodeForYear = async function (
  municipalityId,
  code,
  year,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);

  // Find the code that is effective for this year
  return this.findOne({
    municipalityId: objectId,
    code: code.toUpperCase(),
    effective_year: { $lte: year },
    $or: [
      { effective_year_end: null },
      { effective_year_end: { $exists: false } },
      { effective_year_end: { $gt: year } },
    ],
    isActive: true,
  }).sort({ effective_year: -1 });
};

// Get distinct years that have neighborhood code data for a municipality
neighborhoodCodeSchema.statics.getAvailableYears = async function (
  municipalityId,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);
  return this.distinct('effective_year', {
    municipalityId: objectId,
    isActive: true,
  });
};

module.exports = mongoose.model('NeighborhoodCode', neighborhoodCodeSchema);
