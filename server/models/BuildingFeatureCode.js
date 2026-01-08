const mongoose = require('mongoose');

const buildingFeatureCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    displayText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    points: {
      type: Number,
      required: true,
      min: -1000,
      max: 1000,
    },
    featureType: {
      type: String,
      required: true,
      enum: [
        'interior_wall',
        'exterior_wall',
        'roofing',
        'roof_style',
        'flooring',
        'heating_fuel',
        'heating_type',
        'quality',
        'story_height',
        'frame',
        'ceiling_height',
      ],
      lowercase: true,
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
    // The first year where this code is NO LONGER effective (null = still active)
    // Used for copy-on-write: when a code is superseded, set this to the year the new code starts
    effective_year_end: {
      type: Number,
      default: null,
      index: true,
    },
    // Version chain for tracking changes across years
    // Points to the code this one replaced (set on the NEW code)
    previous_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
      default: null,
    },
    // Points to the code that replaced this one (set on the OLD code)
    next_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
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

// Compound index to ensure unique code per feature type per municipality per year
buildingFeatureCodeSchema.index(
  { code: 1, featureType: 1, municipalityId: 1, effective_year: 1 },
  { unique: true },
);
buildingFeatureCodeSchema.index({ municipalityId: 1, effective_year: 1 });

// Static method to find all codes for a municipality by feature type (legacy)
buildingFeatureCodeSchema.statics.findByMunicipalityAndType = function (
  municipalityId,
  featureType,
) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    featureType,
    isActive: true,
  }).sort({ displayText: 1 });
};

// Static method to find all codes for a municipality by feature type for a specific year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
buildingFeatureCodeSchema.statics.findByMunicipalityAndTypeForYear =
  async function (municipalityId, featureType, year) {
    const objectId = new mongoose.Types.ObjectId(municipalityId);

    // Find all codes that are effective for this year
    // A code is effective if:
    // 1. effective_year <= requested year (it has started)
    // 2. effective_year_end is null OR > requested year (it hasn't ended)
    return this.find({
      municipalityId: objectId,
      featureType,
      effective_year: { $lte: year },
      $or: [
        { effective_year_end: null },
        { effective_year_end: { $exists: false } },
        { effective_year_end: { $gt: year } },
      ],
      isActive: true,
    }).sort({ displayText: 1 });
  };

// Static method to find all codes for a municipality (legacy)
buildingFeatureCodeSchema.statics.findByMunicipality = function (
  municipalityId,
) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    isActive: true,
  }).sort({ featureType: 1, displayText: 1 });
};

// Static method to find all codes for a municipality for a specific year
// Uses temporal range: effective_year <= year AND (effective_year_end is null OR effective_year_end > year)
buildingFeatureCodeSchema.statics.findByMunicipalityForYear = async function (
  municipalityId,
  year,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);

  // Find all codes that are effective for this year
  return this.find({
    municipalityId: objectId,
    effective_year: { $lte: year },
    $or: [
      { effective_year_end: null },
      { effective_year_end: { $exists: false } },
      { effective_year_end: { $gt: year } },
    ],
    isActive: true,
  }).sort({ featureType: 1, displayText: 1 });
};

// Get distinct years that have feature code data for a municipality
buildingFeatureCodeSchema.statics.getAvailableYears = async function (
  municipalityId,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);
  return this.distinct('effective_year', {
    municipalityId: objectId,
    isActive: true,
  });
};

module.exports = mongoose.model(
  'BuildingFeatureCode',
  buildingFeatureCodeSchema,
);
