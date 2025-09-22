const mongoose = require('mongoose');

const buildingMiscellaneousPointsSchema = new mongoose.Schema(
  {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      unique: true,
      index: true,
    },
    airConditioningPoints: {
      type: Number,
      default: 0,
      min: -1000,
      max: 1000,
    },
    extraKitchenPoints: {
      type: Number,
      default: 0,
      min: -1000,
      max: 1000,
    },
    generatorPoints: {
      type: Number,
      default: 0,
      min: -1000,
      max: 1000,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'building_miscellaneous_points',
  },
);

// Update the updatedAt field before saving
buildingMiscellaneousPointsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get or create miscellaneous points for a municipality
buildingMiscellaneousPointsSchema.statics.getOrCreateForMunicipality =
  async function (municipalityId) {
    let points = await this.findOne({ municipalityId });

    if (!points) {
      points = await this.create({
        municipalityId,
        airConditioningPoints: 0,
        extraKitchenPoints: 0,
        generatorPoints: 0,
      });
    }

    return points;
  };

module.exports = mongoose.model(
  'BuildingMiscellaneousPoints',
  buildingMiscellaneousPointsSchema,
);
