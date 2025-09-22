const mongoose = require('mongoose');

const buildingFeatureCodeSchema = new mongoose.Schema(
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
      ],
      lowercase: true,
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

// Compound index to ensure unique display text per feature type per municipality
buildingFeatureCodeSchema.index(
  { displayText: 1, featureType: 1, municipalityId: 1 },
  { unique: true },
);

// Static method to find all codes for a municipality by feature type
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

// Static method to find all codes for a municipality
buildingFeatureCodeSchema.statics.findByMunicipality = function (
  municipalityId,
) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    isActive: true,
  }).sort({ featureType: 1, displayText: 1 });
};

module.exports = mongoose.model(
  'BuildingFeatureCode',
  buildingFeatureCodeSchema,
);
