const mongoose = require('mongoose');

const buildingCodeSchema = new mongoose.Schema(
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
      maxlength: 4,
      trim: true,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    buildingType: {
      type: String,
      required: true,
      enum: [
        'residential',
        'commercial',
        'exempt',
        'manufactured',
        'industrial',
        'utility',
      ],
      lowercase: true,
    },
    sizeAdjustmentCategory: {
      type: String,
      required: true,
      enum: [
        'residential',
        'commercial',
        'exempt',
        'manufactured',
        'industrial',
        'utility',
      ],
      lowercase: true,
    },
    depreciation: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
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

// Compound index to ensure unique codes per municipality
buildingCodeSchema.index({ code: 1, municipalityId: 1 }, { unique: true });

// Static method to find all codes for a municipality
buildingCodeSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    isActive: true,
  }).sort({ code: 1 });
};

module.exports = mongoose.model('BuildingCode', buildingCodeSchema);
