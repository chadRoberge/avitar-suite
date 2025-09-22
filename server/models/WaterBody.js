const mongoose = require('mongoose');

const waterBodySchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  waterBodyType: {
    type: String,
    required: true,
    enum: ['lake', 'river', 'ocean', 'pond', 'stream', 'bay', 'other'],
    lowercase: true,
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

// Compound index for unique water body names per municipality
waterBodySchema.index(
  { municipalityId: 1, name: 1, isActive: 1 },
  { unique: true },
);

// Update the updatedAt field on save
waterBodySchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find by municipality
waterBodySchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true }).sort({ name: 1 });
};

// Static method to find by municipality and ID
waterBodySchema.statics.findByMunicipalityAndId = function (
  municipalityId,
  waterBodyId,
) {
  return this.findOne({ _id: waterBodyId, municipalityId, isActive: true });
};

// Static method to create default water bodies
waterBodySchema.statics.createDefaults = async function (municipalityId) {
  const defaults = [
    {
      municipalityId,
      name: 'Main Lake',
      description: 'Primary lake in the area',
      waterBodyType: 'lake',
    },
    {
      municipalityId,
      name: 'River',
      description: 'Main river running through the area',
      waterBodyType: 'river',
    },
    {
      municipalityId,
      name: 'Ocean',
      description: 'Ocean frontage',
      waterBodyType: 'ocean',
    },
  ];

  const results = [];
  for (const defaultWaterBody of defaults) {
    try {
      const existing = await this.findOne({
        municipalityId,
        name: defaultWaterBody.name,
        isActive: true,
      });

      if (!existing) {
        const created = await this.create(defaultWaterBody);
        results.push(created);
      } else {
        results.push(existing);
      }
    } catch (error) {
      // Skip if duplicate name error occurs
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  return results;
};

module.exports = mongoose.model('WaterBody', waterBodySchema);
