const mongoose = require('mongoose');

const propertyViewSchema = new mongoose.Schema(
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

    // View attribute selections
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ViewAttribute',
      required: [true, 'Subject selection is required'],
    },
    widthId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ViewAttribute',
      required: [true, 'Width selection is required'],
    },
    distanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ViewAttribute',
      required: [true, 'Distance selection is required'],
    },
    depthId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ViewAttribute',
      required: [true, 'Depth selection is required'],
    },

    // Cached values for performance (updated when ViewAttributes change)
    subjectName: {
      type: String,
      required: true,
    },
    subjectDisplayText: {
      type: String,
      required: true,
    },
    subjectFactor: {
      type: Number,
      required: true,
      min: 0,
    },
    widthName: {
      type: String,
      required: true,
    },
    widthDisplayText: {
      type: String,
      required: true,
    },
    widthFactor: {
      type: Number,
      required: true,
      min: 0,
    },
    distanceName: {
      type: String,
      required: true,
    },
    distanceDisplayText: {
      type: String,
      required: true,
    },
    distanceFactor: {
      type: Number,
      required: true,
      min: 0,
    },
    depthName: {
      type: String,
      required: true,
    },
    depthDisplayText: {
      type: String,
      required: true,
    },
    depthFactor: {
      type: Number,
      required: true,
      min: 0,
    },

    // Condition factor and notes
    conditionFactor: {
      type: Number,
      required: true,
      default: 1.0,
      min: 0,
      max: 10,
    },
    conditionNotes: {
      type: String,
      default: '',
      maxlength: [500, 'Condition notes cannot exceed 500 characters'],
    },

    // Calculated values
    baseValue: {
      type: Number,
      required: true,
      min: 0,
    },
    calculatedValue: {
      type: Number,
      required: true,
      min: 0,
    },

    // Current use designation - affects assessed value calculation
    current_use: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Indexes for efficient queries
propertyViewSchema.index({ propertyId: 1, isActive: 1 });
propertyViewSchema.index({ municipalityId: 1, isActive: 1 });

// Virtual to calculate total factor
propertyViewSchema.virtual('totalFactor').get(function () {
  return (
    this.subjectFactor *
    this.widthFactor *
    this.distanceFactor *
    this.depthFactor *
    this.conditionFactor
  );
});

// Static method to find views for a property
propertyViewSchema.statics.findByProperty = function (propertyId) {
  console.log(
    'findByProperty called with propertyId:',
    propertyId,
    'type:',
    typeof propertyId,
  );

  // Convert string to ObjectId if necessary
  const query = {
    propertyId: mongoose.Types.ObjectId.isValid(propertyId)
      ? new mongoose.Types.ObjectId(propertyId)
      : propertyId,
    isActive: true,
  };

  console.log('Query being executed:', query);

  return this.find(query).sort({ createdAt: -1 });
};

// Static method to find views for a municipality
propertyViewSchema.statics.findByMunicipality = function (municipalityId) {
  return this.find({ municipalityId, isActive: true }).sort({ createdAt: -1 });
};

// Static method to update all property views that reference a specific view attribute
propertyViewSchema.statics.updateViewsForAttribute = async function (
  attributeId,
  updatedAttribute,
) {
  console.log(
    'updateViewsForAttribute called with attributeId:',
    attributeId,
    'updatedAttribute:',
    updatedAttribute,
  );

  const attributeObjectId = mongoose.Types.ObjectId.isValid(attributeId)
    ? new mongoose.Types.ObjectId(attributeId)
    : attributeId;

  // Find all property views that reference this attribute in any of the four attribute fields
  const query = {
    $or: [
      { subjectId: attributeObjectId },
      { widthId: attributeObjectId },
      { distanceId: attributeObjectId },
      { depthId: attributeObjectId },
    ],
    isActive: true,
  };

  console.log('Finding property views with query:', query);
  const affectedViews = await this.find(query);
  console.log(
    `Found ${affectedViews.length} property views that reference attribute ${attributeId}`,
  );

  let updatedCount = 0;

  for (const view of affectedViews) {
    let needsUpdate = false;

    // Update cached values based on which attribute this view references
    if (view.subjectId.toString() === attributeObjectId.toString()) {
      view.subjectName = updatedAttribute.name;
      view.subjectDisplayText = updatedAttribute.displayText;
      view.subjectFactor = updatedAttribute.factor;
      needsUpdate = true;
    }
    if (view.widthId.toString() === attributeObjectId.toString()) {
      view.widthName = updatedAttribute.name;
      view.widthDisplayText = updatedAttribute.displayText;
      view.widthFactor = updatedAttribute.factor;
      needsUpdate = true;
    }
    if (view.distanceId.toString() === attributeObjectId.toString()) {
      view.distanceName = updatedAttribute.name;
      view.distanceDisplayText = updatedAttribute.displayText;
      view.distanceFactor = updatedAttribute.factor;
      needsUpdate = true;
    }
    if (view.depthId.toString() === attributeObjectId.toString()) {
      view.depthName = updatedAttribute.name;
      view.depthDisplayText = updatedAttribute.displayText;
      view.depthFactor = updatedAttribute.factor;
      needsUpdate = true;
    }

    if (needsUpdate) {
      // Recalculate the view value (this will happen automatically in pre-save middleware)
      await view.save();
      updatedCount++;
      console.log(
        `Updated property view ${view._id} for property ${view.propertyId}`,
      );
    }
  }

  console.log(
    `Successfully updated ${updatedCount} property views for attribute ${attributeId}`,
  );

  // Trigger land assessment recalculation for affected properties
  if (updatedCount > 0) {
    try {
      const LandAssessmentCalculationService = require('../services/landAssessmentCalculationService');
      const calculationService = new LandAssessmentCalculationService();

      // Get unique municipality IDs from affected views
      const municipalityIds = [
        ...new Set(affectedViews.map((view) => view.municipalityId.toString())),
      ];

      for (const municipalityId of municipalityIds) {
        console.log(
          `Triggering land assessment recalculation for municipality ${municipalityId} due to view attribute change`,
        );

        // Use 'view_attribute' as the changeType and the attribute ID as changeId
        await calculationService.recalculateAffectedProperties(
          municipalityId,
          'view_attribute',
          attributeId.toString(),
        );

        console.log(
          `Completed land assessment recalculation for municipality ${municipalityId}`,
        );
      }
    } catch (error) {
      console.error(
        'Error triggering land assessment recalculation after view attribute update:',
        error,
      );
      // Don't throw error to avoid breaking the main operation
    }
  }

  return updatedCount;
};

// Method to recalculate the view value
propertyViewSchema.methods.recalculateValue = function () {
  console.log('recalculateValue called with:', {
    subjectFactor: this.subjectFactor,
    widthFactor: this.widthFactor,
    distanceFactor: this.distanceFactor,
    depthFactor: this.depthFactor,
    conditionFactor: this.conditionFactor,
    baseValue: this.baseValue,
  });

  const totalFactor =
    this.subjectFactor *
    this.widthFactor *
    this.distanceFactor *
    this.depthFactor *
    this.conditionFactor;
  console.log('totalFactor calculated:', totalFactor);

  this.calculatedValue = this.baseValue * totalFactor;
  console.log('calculatedValue set to:', this.calculatedValue);

  return this.calculatedValue;
};

// Pre-save middleware to ensure calculated value is correct
propertyViewSchema.pre('save', function (next) {
  console.log('Pre-save middleware called');
  console.log('Document before recalculate:', {
    subjectFactor: this.subjectFactor,
    widthFactor: this.widthFactor,
    distanceFactor: this.distanceFactor,
    depthFactor: this.depthFactor,
    conditionFactor: this.conditionFactor,
    baseValue: this.baseValue,
  });

  this.recalculateValue();
  console.log(
    'After recalculateValue, calculatedValue is:',
    this.calculatedValue,
  );
  next();
});

module.exports = mongoose.model('PropertyView', propertyViewSchema);
