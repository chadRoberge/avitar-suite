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
neighborhoodCodeSchema.index({ code: 1, municipalityId: 1 }, { unique: true });

// Static method to find all codes for a municipality
neighborhoodCodeSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    isActive: true,
  }).sort({ code: 1 });
};

module.exports = mongoose.model('NeighborhoodCode', neighborhoodCodeSchema);
