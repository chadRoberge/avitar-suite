const mongoose = require('mongoose');

const shapeSchema = new mongoose.Schema({
  // Removed id field - using MongoDB _id only
  type: {
    type: String,
    required: true,
    enum: ['rectangle', 'circle', 'polygon', 'arc'],
  },
  coordinates: {
    // For rectangle: { x, y, width, height }
    // For circle: { cx, cy, radius }
    // For polygon: { points: [{ x, y, bulge? }, ...] }
    //   - bulge: optional DXF-style bulge factor (tan(angle/4))
    //   - positive bulge = curve to the right, negative = curve to the left
    //   - omitted/undefined = straight line segment
    // For arc: { cx, cy, radius, startAngle, endAngle }
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  area: { type: Number, required: true, min: 0 },
  descriptions: [
    {
      label: {
        type: String,
        required: true,
        maxlength: 3,
        uppercase: true,
      },
      effective_area: {
        type: Number,
        required: true,
        // No min restriction - allows negative values for deductions
      },
    },
  ], // Objects like {label: "HSF", effective_area: 270}
  effective_area: { type: Number, default: 0 }, // No min - allows negative values
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

const propertySketchSchema = new mongoose.Schema(
  {
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
    card_number: { type: Number, required: true, min: 1, default: 1 },
    assessment_year: {
      type: Number,
      required: true,
      default: () => new Date().getFullYear(),
      index: true,
    },
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },

    shapes: [shapeSchema],

    // Calculated totals
    total_area: { type: Number, default: 0, min: 0 }, // Area itself must be positive
    total_effective_area: { type: Number, default: 0 }, // No min - can be negative after deductions

    // Queryable fields for descriptions
    description_codes: [
      {
        type: String,
        maxlength: 3,
        uppercase: true,
        index: true,
      },
    ], // Flattened list of all descriptions used in shapes

    // Area ranges for querying
    area_range: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },

    // Building type classification
    building_type: {
      type: String,
      enum: ['residential', 'commercial', 'industrial', 'mixed_use', 'other'],
      default: 'residential',
    },

    // Sketch metadata
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

// Compound indexes for common queries
propertySketchSchema.index({
  property_id: 1,
  card_number: 1,
  assessment_year: 1,
});
propertySketchSchema.index({ municipality_id: 1, assessment_year: 1 });
propertySketchSchema.index({ description_codes: 1, total_area: 1 });
propertySketchSchema.index({ 'area_range.min': 1, 'area_range.max': 1 });
propertySketchSchema.index({ building_type: 1, description_codes: 1 });

// Helper function to calculate effective area for a shape based on descriptions
function calculateShapeEffectiveArea(shape) {
  if (!shape.descriptions || shape.descriptions.length === 0) {
    return 0;
  }

  // Sum up effective areas from all descriptions
  return shape.descriptions.reduce((sum, desc) => {
    return sum + (desc.effective_area || 0);
  }, 0);
}

// Pre-save middleware to update calculated fields
propertySketchSchema.pre('save', function (next) {
  // Update description_codes from shapes and calculate effective areas
  const allDescriptions = new Set();
  let minArea = Infinity;
  let maxArea = 0;

  this.shapes.forEach((shape) => {
    // Calculate and update effective area for each shape
    shape.effective_area = calculateShapeEffectiveArea(shape);

    if (shape.descriptions) {
      shape.descriptions.forEach((desc) => {
        if (desc.label) {
          allDescriptions.add(desc.label.toUpperCase());
        }
      });
    }

    if (shape.area) {
      minArea = Math.min(minArea, shape.area);
      maxArea = Math.max(maxArea, shape.area);
    }
  });

  this.description_codes = Array.from(allDescriptions);

  // Update area range
  if (minArea !== Infinity) {
    this.area_range.min = minArea;
    this.area_range.max = maxArea;
  }

  // Calculate sketch totals automatically
  this.calculateTotals();

  // Update timestamps
  this.updated_at = new Date();

  next();
});

// Trigger parcel assessment update after save (sketches affect building assessment)
propertySketchSchema.post('save', async function (doc) {
  try {
    const { updateParcelAssessment } = require('../utils/assessment');
    const PropertyTreeNode = require('./PropertyTreeNode');

    // Get property to find municipality_id
    const property = await PropertyTreeNode.findById(doc.property_id);
    if (property && property.municipality_id) {
      console.log(
        `[Card ${doc.card_number}] Sketch saved, triggering parcel recalculation for property ${doc.property_id}...`,
      );

      const result = await updateParcelAssessment(
        doc.property_id,
        property.municipality_id,
        doc.assessment_year || new Date().getFullYear(),
        { trigger: 'sketch_update', userId: null },
      );

      console.log(
        `[Card ${doc.card_number}] ✓ Parcel assessment updated after sketch change:`,
        `Total: $${result.parcelTotals.total_assessed_value.toLocaleString()},`,
        `Building: $${result.parcelTotals.total_building_value.toLocaleString()}`,
      );
    }
  } catch (error) {
    console.error(
      `[Card ${doc.card_number}] ✗ Error updating parcel assessment after sketch save:`,
      {
        propertyId: doc.property_id,
        cardNumber: doc.card_number,
        error: error.message,
      },
    );
  }
});

propertySketchSchema.post('remove', async function (doc) {
  try {
    const { updateParcelAssessment } = require('../utils/assessment');
    const PropertyTreeNode = require('./PropertyTreeNode');

    // Get property to find municipality_id
    const property = await PropertyTreeNode.findById(doc.property_id);
    if (property && property.municipality_id) {
      console.log(
        `[Card ${doc.card_number}] Sketch removed, recalculating parcel for property ${doc.property_id}...`,
      );

      const result = await updateParcelAssessment(
        doc.property_id,
        property.municipality_id,
        doc.assessment_year || new Date().getFullYear(),
        { trigger: 'sketch_update', userId: null },
      );

      console.log(
        `[Card ${doc.card_number}] ✓ Parcel assessment updated after sketch removal:`,
        `Total: $${result.parcelTotals.total_assessed_value.toLocaleString()}`,
      );
    }
  } catch (error) {
    console.error(
      `[Card ${doc.card_number}] ✗ Error updating parcel assessment after sketch removal:`,
      {
        propertyId: doc.property_id,
        cardNumber: doc.card_number,
        error: error.message,
      },
    );
  }
});

// Static methods for common queries
propertySketchSchema.statics.findByDescriptionCodes = function (codes) {
  return this.find({
    description_codes: { $in: codes.map((code) => code.toUpperCase()) },
  });
};

propertySketchSchema.statics.findByAreaRange = function (minArea, maxArea) {
  return this.find({
    $or: [
      { 'area_range.min': { $gte: minArea, $lte: maxArea } },
      { 'area_range.max': { $gte: minArea, $lte: maxArea } },
      {
        'area_range.min': { $lte: minArea },
        'area_range.max': { $gte: maxArea },
      },
    ],
  });
};

propertySketchSchema.statics.findWithMultipleDescriptions = function (codes) {
  return this.find({
    description_codes: { $all: codes.map((code) => code.toUpperCase()) },
  });
};

// Instance methods
propertySketchSchema.methods.calculateTotals = function () {
  this.total_area = this.shapes.reduce(
    (sum, shape) => sum + (shape.area || 0),
    0,
  );
  this.total_effective_area = this.shapes.reduce(
    (sum, shape) => sum + (shape.effective_area || 0),
    0,
  );

  console.log('🧮 Server calculated sketch totals:', {
    sketchId: this._id,
    shapesCount: this.shapes.length,
    total_area: this.total_area,
    total_effective_area: this.total_effective_area,
    shapes: this.shapes.map((s) => ({
      area: s.area,
      effective_area: s.effective_area,
      descriptions: s.descriptions?.length || 0,
    })),
  });

  return {
    total_area: this.total_area,
    total_effective_area: this.total_effective_area,
  };
};

propertySketchSchema.methods.getDescriptionSummary = function () {
  const summary = new Map();

  this.shapes.forEach((shape) => {
    if (shape.descriptions) {
      shape.descriptions.forEach((desc) => {
        const code = desc.label ? desc.label.toUpperCase() : '';
        if (code && !summary.has(code)) {
          summary.set(code, { count: 0, total_area: 0, effective_area: 0 });
        }
        if (code) {
          const current = summary.get(code);
          current.count += 1;
          current.total_area += shape.area || 0;
          current.effective_area += desc.effective_area || 0;
        }
      });
    }
  });

  return Object.fromEntries(summary);
};

module.exports = mongoose.model('PropertySketch', propertySketchSchema);
