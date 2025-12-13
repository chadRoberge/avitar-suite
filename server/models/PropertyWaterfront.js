const mongoose = require('mongoose');

const propertyWaterfrontSchema = new mongoose.Schema(
  {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property ID is required'],
      index: true,
    },
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: [true, 'Municipality ID is required'],
      index: true,
    },

    // Water body selection
    waterBodyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WaterBody',
      required: [true, 'Water body selection is required'],
    },
    waterBodyName: {
      type: String,
      required: true,
    },

    // Frontage (in feet)
    frontage: {
      type: Number,
      required: [true, 'Frontage is required'],
      min: 0,
    },
    frontageFactor: {
      type: Number,
      default: 1.0,
      min: 0,
    },

    // Waterfront attribute selections
    accessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WaterfrontAttribute',
      required: [true, 'Access selection is required'],
    },
    accessName: {
      type: String,
      required: true,
    },
    accessFactor: {
      type: Number,
      required: true,
      min: 0,
    },

    topographyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WaterfrontAttribute',
      required: [true, 'Topography selection is required'],
    },
    topographyName: {
      type: String,
      required: true,
    },
    topographyFactor: {
      type: Number,
      required: true,
      min: 0,
    },

    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WaterfrontAttribute',
      required: [true, 'Location selection is required'],
    },
    locationName: {
      type: String,
      required: true,
    },
    locationFactor: {
      type: Number,
      required: true,
      min: 0,
    },

    // Condition percentage (0-100)
    condition: {
      type: Number,
      default: 100,
      min: 0,
      max: 1000,
    },

    // Current use flag
    currentUse: {
      type: Boolean,
      default: false,
    },

    // Values
    baseValue: {
      type: Number,
      required: true,
      min: 0,
    },
    calculatedValue: {
      type: Number,
      default: 0,
    }, // Market value
    assessedValue: {
      type: Number,
      default: 0,
    }, // Assessed value (0 if current use)

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Calculate value before saving
propertyWaterfrontSchema.pre('save', function (next) {
  // Convert condition percentage to factor (0-100 -> 0.0-1.0)
  const conditionFactor = this.condition / 100;

  // Calculate total factor including frontage factor from ladder
  const totalFactor =
    this.frontageFactor *
    this.accessFactor *
    this.topographyFactor *
    this.locationFactor *
    conditionFactor;

  // Calculate market value: Base Value × Frontage Factor × Other Factors
  // Note: Frontage (feet) is only used to lookup the factor from the ladder, not in the calculation
  this.calculatedValue = Math.round(this.baseValue * totalFactor);

  // Calculate assessed value (0 if current use)
  this.assessedValue = this.currentUse ? 0 : this.calculatedValue;

  console.log('=== WATERFRONT CALCULATION ===');
  console.log('Base Value:', this.baseValue);
  console.log('Frontage:', this.frontage, 'ft (used for ladder lookup only)');
  console.log(
    'Frontage Factor:',
    this.frontageFactor,
    '(from ladder interpolation)',
  );
  console.log('Access Factor:', this.accessFactor);
  console.log('Topography Factor:', this.topographyFactor);
  console.log('Location Factor:', this.locationFactor);
  console.log('Condition Factor:', conditionFactor, `(${this.condition}%)`);
  console.log('Total Factor:', totalFactor);
  console.log('Calculated Value (Market):', this.calculatedValue);
  console.log('Assessed Value:', this.assessedValue);
  console.log('Current Use:', this.currentUse);
  console.log('=== END CALCULATION ===');

  next();
});

// Method to recalculate value
propertyWaterfrontSchema.methods.recalculateValue = function () {
  const conditionFactor = this.condition / 100;
  const totalFactor =
    this.frontageFactor *
    this.accessFactor *
    this.topographyFactor *
    this.locationFactor *
    conditionFactor;
  this.calculatedValue = Math.round(this.baseValue * totalFactor);
  this.assessedValue = this.currentUse ? 0 : this.calculatedValue;
};

// Static method to find waterfronts by property
propertyWaterfrontSchema.statics.findByProperty = function (propertyId) {
  return this.find({ propertyId, isActive: true });
};

module.exports = mongoose.model('PropertyWaterfront', propertyWaterfrontSchema);
