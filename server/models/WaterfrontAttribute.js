const mongoose = require('mongoose');

const waterfrontAttributeSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true,
  },
  attributeType: {
    type: String,
    required: true,
    enum: ['water_access', 'water_location', 'topography'],
    lowercase: true,
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
  displayText: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  factor: {
    type: Number,
    required: true,
    min: 0,
    max: 1000,
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

// Compound index for unique attribute names per municipality (across all types)
waterfrontAttributeSchema.index(
  { municipalityId: 1, name: 1, isActive: 1 },
  { unique: true },
);
// Compound index for unique display text per municipality (across all types)
waterfrontAttributeSchema.index(
  { municipalityId: 1, displayText: 1, isActive: 1 },
  { unique: true },
);

// Update the updatedAt field on save
waterfrontAttributeSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find by municipality and type
waterfrontAttributeSchema.statics.findByMunicipalityAndType = function (
  municipalityId,
  attributeType,
) {
  return this.findOne({ municipalityId, attributeType, isActive: true });
};

// Static method to find all by municipality
waterfrontAttributeSchema.statics.findByMunicipality = function (
  municipalityId,
) {
  return this.find({ municipalityId, isActive: true }).sort({
    attributeType: 1,
  });
};

// Static method to create default attributes for all types
waterfrontAttributeSchema.statics.createDefaults = async function (
  municipalityId,
) {
  const defaults = [
    // Water Access Types
    {
      municipalityId,
      attributeType: 'water_access',
      name: 'Beach',
      description: 'Direct beach access to waterfront',
      displayText: 'Beach Access',
      factor: 110,
    },
    {
      municipalityId,
      attributeType: 'water_access',
      name: 'Seawall',
      description: 'Concrete or stone seawall access',
      displayText: 'Seawall',
      factor: 105,
    },
    {
      municipalityId,
      attributeType: 'water_access',
      name: 'Grass/Landscaped',
      description: 'Grassy or landscaped waterfront area',
      displayText: 'Grass/Landscaped',
      factor: 105,
    },
    {
      municipalityId,
      attributeType: 'water_access',
      name: 'Rocky/Natural',
      description: 'Natural rocky or undeveloped access',
      displayText: 'Rocky/Natural',
      factor: 90,
    },
    // Water Location Types
    {
      municipalityId,
      attributeType: 'water_location',
      name: 'Open Water',
      description: 'Direct open water frontage',
      displayText: 'Open Water',
      factor: 100,
    },
    {
      municipalityId,
      attributeType: 'water_location',
      name: 'Cove/Protected',
      description: 'Protected cove or inlet location',
      displayText: 'Cove/Protected',
      factor: 105,
    },
    {
      municipalityId,
      attributeType: 'water_location',
      name: 'Channel',
      description: 'Channel or narrow waterway',
      displayText: 'Channel',
      factor: 95,
    },
    {
      municipalityId,
      attributeType: 'water_location',
      name: 'Island',
      description: 'Island waterfront location',
      displayText: 'Island',
      factor: 60,
    },
    // Topography Types
    {
      municipalityId,
      attributeType: 'topography',
      name: 'Level',
      description: 'Level topography to water',
      displayText: 'Level',
      factor: 100,
    },
    {
      municipalityId,
      attributeType: 'topography',
      name: 'Gentle Slope',
      description: 'Gentle slope down to water',
      displayText: 'Gentle Slope',
      factor: 95,
    },
    {
      municipalityId,
      attributeType: 'topography',
      name: 'Steep Slope',
      description: 'Steep slope or bluff to water',
      displayText: 'Steep Slope',
      factor: 90,
    },
    {
      municipalityId,
      attributeType: 'topography',
      name: 'Elevated',
      description: 'Elevated position above water',
      displayText: 'Elevated',
      factor: 80,
    },
  ];

  const results = [];
  for (const defaultAttr of defaults) {
    try {
      const existing = await this.findOne({
        municipalityId,
        attributeType: defaultAttr.attributeType,
        name: defaultAttr.name,
        isActive: true,
      });

      if (!existing) {
        const created = await this.create(defaultAttr);
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

module.exports = mongoose.model(
  'WaterfrontAttribute',
  waterfrontAttributeSchema,
);
