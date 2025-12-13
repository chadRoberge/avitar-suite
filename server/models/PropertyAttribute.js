const mongoose = require('mongoose');

// Base schema for property attributes
const propertyAttributeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: false, // Optional - using ObjectId as primary identifier
      trim: true,
      maxlength: 10,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    displayText: {
      type: String,
      required: true,
      maxlength: 50, // Increased to accommodate longer descriptions
      trim: true,
    },
    rate: {
      type: Number,
      required: true,
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
    discriminatorKey: 'attributeType',
  },
);

// Index for efficient queries
propertyAttributeSchema.index({
  municipalityId: 1,
  attributeType: 1,
  isActive: 1,
});

// Note: No unique index on code field - using ObjectId (_id) as primary identifier
// If code is provided in the future, uniqueness can be enforced at application level

// Static method to find all attributes for a municipality by type
propertyAttributeSchema.statics.findByMunicipalityAndType = function (
  municipalityId,
  attributeType,
) {
  return this.find({
    municipalityId: new mongoose.Types.ObjectId(municipalityId),
    attributeType: attributeType,
    isActive: true,
  }).sort({ displayText: 1 });
};

const PropertyAttribute = mongoose.model(
  'PropertyAttribute',
  propertyAttributeSchema,
);

// Site Attributes
const SiteAttribute = PropertyAttribute.discriminator(
  'SiteAttribute',
  new mongoose.Schema({}),
);

// Driveway Attributes
const DrivewayAttribute = PropertyAttribute.discriminator(
  'DrivewayAttribute',
  new mongoose.Schema({}),
);

// Road Attributes
const RoadAttribute = PropertyAttribute.discriminator(
  'RoadAttribute',
  new mongoose.Schema({}),
);

// Topology Attributes
const TopologyAttribute = PropertyAttribute.discriminator(
  'TopologyAttribute',
  new mongoose.Schema({}),
);

module.exports = {
  PropertyAttribute,
  SiteAttribute,
  DrivewayAttribute,
  RoadAttribute,
  TopologyAttribute,
};
