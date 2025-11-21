const mongoose = require('mongoose');

const landUseDetailSchema = new mongoose.Schema(
  {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Municipality',
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 10,
    },
    displayText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    landUseType: {
      type: String,
      required: true,
      enum: [
        'residential',
        'residential_waterfront',
        'commercial',
        'residential_multifamily',
        'utility',
        'exempt',
        'mixed_use',
      ],
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

// Compound index to ensure unique codes per municipality
landUseDetailSchema.index({ municipalityId: 1, code: 1 }, { unique: true });

// Virtual for formatted land use type
landUseDetailSchema.virtual('formattedLandUseType').get(function () {
  const typeMap = {
    residential: 'Residential',
    residential_waterfront: 'Residential Waterfront',
    commercial: 'Commercial',
    residential_multifamily: 'Residential Multifamily',
    utility: 'Utility',
    exempt: 'Exempt',
    mixed_use: 'Mixed Use',
  };
  return typeMap[this.landUseType] || this.landUseType;
});

module.exports = mongoose.model('LandUseDetail', landUseDetailSchema);
