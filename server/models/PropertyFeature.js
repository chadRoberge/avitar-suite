const mongoose = require('mongoose');
const { roundToNearestHundred } = require('../utils/assessment');

const propertyFeatureSchema = new mongoose.Schema({
  property_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true,
  },
  municipality_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true,
  },
  card_number: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
    index: true,
  },
  feature_code_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeatureCode',
    required: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  length: {
    type: Number,
    default: 0,
    min: 0,
  },
  width: {
    type: Number,
    default: 0,
    min: 0,
  },
  units: {
    type: Number,
    default: 1,
    min: 0,
  },
  size_adjustment: {
    type: Number,
    default: 1.0,
    min: 0,
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
  },
  condition: {
    type: String,
    required: true,
    enum: ['Excellent', 'Good', 'Average', 'Fair', 'Poor'],
    default: 'Average',
  },
  measurement_type: {
    type: String,
    required: true,
    enum: ['length_width', 'units'],
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for property features including card number
propertyFeatureSchema.index({ property_id: 1, card_number: 1 });
propertyFeatureSchema.index({ property_id: 1, feature_code_id: 1 });

// Update the updated_at field on save
propertyFeatureSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

// Trigger parcel assessment update after save
propertyFeatureSchema.post('save', async function (doc) {
  try {
    const { updateParcelAssessment } = require('../utils/assessment');
    const PropertyTreeNode = require('./PropertyTreeNode');

    // Get property to find municipality_id
    const property = await PropertyTreeNode.findById(doc.property_id);
    if (property && property.municipality_id) {
      console.log(
        `[Card ${doc.card_number}] Feature saved, triggering parcel recalculation for property ${doc.property_id}...`,
      );

      const result = await updateParcelAssessment(
        doc.property_id,
        property.municipality_id,
        new Date().getFullYear(),
        { trigger: 'feature_update', userId: null },
      );

      console.log(
        `[Card ${doc.card_number}] ✓ Parcel assessment updated after feature change:`,
        `Total: $${result.parcelTotals.total_assessed_value.toLocaleString()},`,
        `Improvements: $${result.parcelTotals.total_improvements_value.toLocaleString()}`,
      );
    }
  } catch (error) {
    console.error(
      `[Card ${doc.card_number}] ✗ Error updating parcel assessment after feature save:`,
      {
        propertyId: doc.property_id,
        cardNumber: doc.card_number,
        error: error.message,
      },
    );
  }
});

propertyFeatureSchema.post('remove', async function (doc) {
  try {
    const { updateParcelAssessment } = require('../utils/assessment');
    const PropertyTreeNode = require('./PropertyTreeNode');

    // Get property to find municipality_id
    const property = await PropertyTreeNode.findById(doc.property_id);
    if (property && property.municipality_id) {
      console.log(
        `[Card ${doc.card_number}] Feature removed, recalculating parcel for property ${doc.property_id}...`,
      );

      const result = await updateParcelAssessment(
        doc.property_id,
        property.municipality_id,
        new Date().getFullYear(),
        { trigger: 'feature_update', userId: null },
      );

      console.log(
        `[Card ${doc.card_number}] ✓ Parcel assessment updated after feature removal:`,
        `Total: $${result.parcelTotals.total_assessed_value.toLocaleString()}`,
      );
    }
  } catch (error) {
    console.error(
      `[Card ${doc.card_number}] ✗ Error updating parcel assessment after feature removal:`,
      {
        propertyId: doc.property_id,
        cardNumber: doc.card_number,
        error: error.message,
      },
    );
  }
});

// Virtual for calculated area (length * width)
propertyFeatureSchema.virtual('calculated_area').get(function () {
  if (this.measurement_type === 'length_width') {
    return Math.round(this.length * this.width);
  }
  return 0;
});

// Virtual for calculated value (rounded to nearest hundred)
propertyFeatureSchema.virtual('calculated_value').get(function () {
  let quantity = 0;

  if (this.measurement_type === 'length_width') {
    quantity = this.length * this.width;
  } else {
    quantity = this.units;
  }

  // Apply condition factor
  let conditionFactor = 1.0;
  switch (this.condition) {
    case 'Excellent':
      conditionFactor = 1.25;
      break;
    case 'Good':
      conditionFactor = 1.1;
      break;
    case 'Average':
      conditionFactor = 1.0;
      break;
    case 'Fair':
      conditionFactor = 0.9;
      break;
    case 'Poor':
      conditionFactor = 0.75;
      break;
  }

  const rawValue =
    quantity * this.size_adjustment * this.rate * conditionFactor;
  return roundToNearestHundred(rawValue);
});

// Ensure virtual fields are included in JSON
propertyFeatureSchema.set('toJSON', { virtuals: true });
propertyFeatureSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('PropertyFeature', propertyFeatureSchema);
