const mongoose = require('mongoose');

const viewAttributeSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true,
  },
  attributeType: {
    type: String,
    required: true,
    enum: ['subject', 'width', 'distance', 'depth'],
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

// Compound index for unique attribute names per type per municipality
viewAttributeSchema.index(
  { municipalityId: 1, attributeType: 1, name: 1, isActive: 1 },
  { unique: true },
);

// Update the updatedAt field on save
viewAttributeSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find by municipality, type, and ID
viewAttributeSchema.statics.findByMunicipalityAndId = function (
  municipalityId,
  attributeId,
) {
  return this.findOne({ _id: attributeId, municipalityId, isActive: true });
};

// Static method to find all by municipality and type
viewAttributeSchema.statics.findByMunicipalityAndType = function (
  municipalityId,
  attributeType,
) {
  return this.find({ municipalityId, attributeType, isActive: true }).sort({
    name: 1,
  });
};

// Static method to find all by municipality
viewAttributeSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true }).sort({
    attributeType: 1,
    name: 1,
  });
};

// Static method to create default attributes for all types
viewAttributeSchema.statics.createDefaults = async function (municipalityId) {
  const defaults = [
    {
      municipalityId,
      attributeType: 'subject',
      name: 'Mountains',
      description:
        'View of mountain regions that extend 100+ feet out of the ground',
      displayText: 'Mountains',
      factor: 100,
    },
    {
      municipalityId,
      attributeType: 'subject',
      name: 'Ocean',
      description: 'View of open ocean water',
      displayText: 'Ocean View',
      factor: 120,
    },
    {
      municipalityId,
      attributeType: 'width',
      name: 'Panoramic',
      description: 'Wide panoramic view covering 180 degrees or more',
      displayText: 'Panoramic',
      factor: 150,
    },
    {
      municipalityId,
      attributeType: 'width',
      name: 'Partial',
      description: 'Limited view covering less than 90 degrees',
      displayText: 'Partial View',
      factor: 80,
    },
    {
      municipalityId,
      attributeType: 'distance',
      name: 'Close',
      description: 'View subject is within 1 mile',
      displayText: 'Close Distance',
      factor: 130,
    },
    {
      municipalityId,
      attributeType: 'distance',
      name: 'Distant',
      description: 'View subject is more than 5 miles away',
      displayText: 'Distant View',
      factor: 90,
    },
    {
      municipalityId,
      attributeType: 'depth',
      name: 'Deep',
      description: 'Extensive depth with multiple layers of view',
      displayText: 'Deep View',
      factor: 110,
    },
    {
      municipalityId,
      attributeType: 'depth',
      name: 'Shallow',
      description: 'Limited depth with obstructed or shallow view',
      displayText: 'Shallow View',
      factor: 85,
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

module.exports = mongoose.model('ViewAttribute', viewAttributeSchema);
