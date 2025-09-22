const mongoose = require('mongoose');

const acreageDiscountSettingsSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
    unique: true,
    index: true,
  },
  minimumQualifyingAcreage: {
    type: Number,
    required: true,
    default: 10,
    min: [0.1, 'Minimum qualifying acreage must be at least 0.1 acres'],
    max: [1000, 'Minimum qualifying acreage cannot exceed 1000 acres'],
  },
  maximumQualifyingAcreage: {
    type: Number,
    required: true,
    default: 200,
    min: [1, 'Maximum qualifying acreage must be at least 1 acre'],
    max: [10000, 'Maximum qualifying acreage cannot exceed 10,000 acres'],
  },
  maximumDiscountPercentage: {
    type: Number,
    required: true,
    default: 75,
    min: [1, 'Maximum discount percentage must be at least 1%'],
    max: [95, 'Maximum discount percentage cannot exceed 95%'],
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

// Index for efficient queries
acreageDiscountSettingsSchema.index({ municipalityId: 1, isActive: 1 });

// Validation: Maximum acreage must be greater than minimum
acreageDiscountSettingsSchema.pre('save', function (next) {
  if (this.maximumQualifyingAcreage <= this.minimumQualifyingAcreage) {
    const error = new Error(
      'Maximum qualifying acreage must be greater than minimum qualifying acreage',
    );
    return next(error);
  }

  // Update the updatedAt field
  this.updatedAt = new Date();
  next();
});

// Method to calculate discount for a given acreage
acreageDiscountSettingsSchema.methods.calculateDiscount = function (acreage) {
  // If below minimum, no discount
  if (acreage < this.minimumQualifyingAcreage) {
    return 0;
  }

  // If above maximum, use maximum discount
  if (acreage >= this.maximumQualifyingAcreage) {
    return this.maximumDiscountPercentage;
  }

  // Linear interpolation between minimum and maximum
  const acreageRange =
    this.maximumQualifyingAcreage - this.minimumQualifyingAcreage;
  const acreageAboveMin = acreage - this.minimumQualifyingAcreage;
  const discountRatio = acreageAboveMin / acreageRange;

  return Math.round(discountRatio * this.maximumDiscountPercentage * 100) / 100;
};

// Static method to find by municipality
acreageDiscountSettingsSchema.statics.findByMunicipality = function (
  municipalityId,
) {
  return this.findOne({ municipalityId, isActive: true });
};

// Static method to create default settings
acreageDiscountSettingsSchema.statics.createDefault = function (
  municipalityId,
) {
  return this.create({
    municipalityId,
    minimumQualifyingAcreage: 10,
    maximumQualifyingAcreage: 200,
    maximumDiscountPercentage: 75,
  });
};

module.exports = mongoose.model(
  'AcreageDiscountSettings',
  acreageDiscountSettingsSchema,
);
