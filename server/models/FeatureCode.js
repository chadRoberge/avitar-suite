const mongoose = require('mongoose');

const featureCodeSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true,
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    minlength: 1,
    maxlength: 10,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
  },
  sizeAdjustment: {
    type: String,
    required: true,
    enum: ['normal', 'zero'],
    lowercase: true,
  },
  measurementType: {
    type: String,
    required: true,
    enum: ['length_width', 'units'],
    lowercase: true,
  },
  effective_year: {
    type: Number,
    required: true,
    index: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for unique codes within municipality per year
featureCodeSchema.index(
  { municipalityId: 1, code: 1, effective_year: 1 },
  { unique: true },
);
featureCodeSchema.index({ municipalityId: 1, effective_year: 1 });

// Update the updatedAt field on save
featureCodeSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find all codes for a municipality (legacy)
featureCodeSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    isActive: true,
  }).sort({ code: 1 });
};

// Static method to find all codes for a municipality for a specific year
// Uses inheritance: finds most recent year <= requested year
featureCodeSchema.statics.findByMunicipalityForYear = async function (
  municipalityId,
  year,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);

  // Find the most recent effective year
  const latestCode = await this.findOne({
    municipalityId: objectId,
    effective_year: { $lte: year },
    isActive: true,
  })
    .sort({ effective_year: -1 })
    .select('effective_year');

  if (!latestCode) return [];

  return this.find({
    municipalityId: objectId,
    effective_year: latestCode.effective_year,
    isActive: true,
  }).sort({ code: 1 });
};

// Find a specific feature code by code string for a year
featureCodeSchema.statics.findByCodeForYear = async function (
  municipalityId,
  code,
  year,
) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);

  return this.findOne({
    municipalityId: objectId,
    code: code.toUpperCase(),
    effective_year: { $lte: year },
    isActive: true,
  }).sort({ effective_year: -1 });
};

// Get distinct years that have feature code data for a municipality
featureCodeSchema.statics.getAvailableYears = async function (municipalityId) {
  const objectId = new mongoose.Types.ObjectId(municipalityId);
  return this.distinct('effective_year', {
    municipalityId: objectId,
    isActive: true,
  });
};

module.exports = mongoose.model('FeatureCode', featureCodeSchema);
