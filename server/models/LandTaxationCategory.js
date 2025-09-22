const mongoose = require('mongoose');

const landTaxationCategorySchema = new mongoose.Schema(
  {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    taxPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 100,
    },
    order: {
      type: Number,
      default: 0,
    },
    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient queries by municipality
landTaxationCategorySchema.index({ municipalityId: 1, order: 1 });

// Ensure category names are unique within a municipality
landTaxationCategorySchema.index(
  { municipalityId: 1, name: 1 },
  { unique: true },
);

module.exports = mongoose.model(
  'LandTaxationCategory',
  landTaxationCategorySchema,
);
