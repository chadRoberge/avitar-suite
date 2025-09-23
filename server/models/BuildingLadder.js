const mongoose = require('mongoose');

const buildingLadderSchema = new mongoose.Schema(
  {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: [true, 'Municipality ID is required'],
      index: true,
    },

    // Building class/type this ladder applies to
    buildingClass: {
      type: String,
      required: [true, 'Building class is required'],
      trim: true,
      index: true,
    },

    // Point range for this ladder tier
    minPoints: {
      type: Number,
      required: [true, 'Minimum points is required'],
      min: [0, 'Minimum points must be non-negative'],
    },
    maxPoints: {
      type: Number,
      required: [true, 'Maximum points is required'],
      min: [0, 'Maximum points must be non-negative'],
    },

    // Rate per square foot for this tier
    rate: {
      type: Number,
      required: [true, 'Rate is required'],
      min: [0, 'Rate must be positive'],
    },

    // Description for this ladder tier
    description: {
      type: String,
      trim: true,
    },

    // Effective year this ladder applies to
    effectiveYear: {
      type: Number,
      required: [true, 'Effective year is required'],
      index: true,
    },

    // Order for display purposes
    order: {
      type: Number,
      default: 0,
    },

    // Whether this ladder tier is active
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'building_ladders',
  }
);

// Compound indexes for efficient lookups
buildingLadderSchema.index({ municipalityId: 1, buildingClass: 1, effectiveYear: 1 });
buildingLadderSchema.index({ municipalityId: 1, buildingClass: 1, minPoints: 1, maxPoints: 1 });

// Validation: minPoints should be less than maxPoints
buildingLadderSchema.pre('validate', function (next) {
  if (this.minPoints >= this.maxPoints) {
    next(new Error('Minimum points must be less than maximum points'));
  } else {
    next();
  }
});

// Static method to get or create default building ladders for a municipality
buildingLadderSchema.statics.getOrCreateForMunicipality = async function (
  municipalityId,
  effectiveYear = null
) {
  const currentYear = effectiveYear || new Date().getFullYear();

  // Check if ladders exist for this municipality and year
  const existingLadders = await this.find({
    municipalityId,
    effectiveYear: currentYear,
    isActive: true,
  });

  if (existingLadders.length > 0) {
    return existingLadders;
  }

  // Create default building ladders
  const defaultLadders = [
    // Residential class ladders
    { buildingClass: 'RESIDENTIAL', minPoints: 0, maxPoints: 50, rate: 45.00, description: 'Basic residential' },
    { buildingClass: 'RESIDENTIAL', minPoints: 51, maxPoints: 100, rate: 55.00, description: 'Standard residential' },
    { buildingClass: 'RESIDENTIAL', minPoints: 101, maxPoints: 150, rate: 65.00, description: 'Good residential' },
    { buildingClass: 'RESIDENTIAL', minPoints: 151, maxPoints: 200, rate: 75.00, description: 'Very good residential' },
    { buildingClass: 'RESIDENTIAL', minPoints: 201, maxPoints: 999, rate: 85.00, description: 'Excellent residential' },

    // Commercial class ladders
    { buildingClass: 'COMMERCIAL', minPoints: 0, maxPoints: 50, rate: 55.00, description: 'Basic commercial' },
    { buildingClass: 'COMMERCIAL', minPoints: 51, maxPoints: 100, rate: 70.00, description: 'Standard commercial' },
    { buildingClass: 'COMMERCIAL', minPoints: 101, maxPoints: 150, rate: 85.00, description: 'Good commercial' },
    { buildingClass: 'COMMERCIAL', minPoints: 151, maxPoints: 200, rate: 100.00, description: 'Very good commercial' },
    { buildingClass: 'COMMERCIAL', minPoints: 201, maxPoints: 999, rate: 120.00, description: 'Excellent commercial' },
  ];

  const ladders = defaultLadders.map((ladder, index) => ({
    ...ladder,
    municipalityId,
    effectiveYear: currentYear,
    order: index,
    isActive: true,
  }));

  const createdLadders = await this.insertMany(ladders);
  console.log(`Created ${createdLadders.length} default building ladders for municipality ${municipalityId}`);

  return createdLadders;
};

// Static method to find ladder for specific points and class
buildingLadderSchema.statics.findLadderForPoints = async function (
  municipalityId,
  buildingClass,
  totalPoints,
  effectiveYear = null
) {
  const currentYear = effectiveYear || new Date().getFullYear();

  return await this.findOne({
    municipalityId,
    buildingClass,
    effectiveYear: currentYear,
    minPoints: { $lte: totalPoints },
    maxPoints: { $gte: totalPoints },
    isActive: true,
  }).sort({ minPoints: 1 });
};

const BuildingLadder = mongoose.model('BuildingLadder', buildingLadderSchema);

module.exports = BuildingLadder;