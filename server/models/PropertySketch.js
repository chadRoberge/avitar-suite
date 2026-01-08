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
    effective_year: {
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
  effective_year: 1,
});
propertySketchSchema.index({ municipality_id: 1, effective_year: 1 });
propertySketchSchema.index({ description_codes: 1, total_area: 1 });
propertySketchSchema.index({ 'area_range.min': 1, 'area_range.max': 1 });
propertySketchSchema.index({ building_type: 1, description_codes: 1 });

// Helper function to calculate effective area for a shape based on descriptions and factors
function calculateShapeEffectiveArea(shape, factorsMap) {
  if (!shape.descriptions || shape.descriptions.length === 0) {
    return 0;
  }

  // Recalculate effective_area for each description using shape.area × factor points
  shape.descriptions.forEach((desc) => {
    if (desc.label && factorsMap) {
      const factor = factorsMap.get(desc.label.toUpperCase());
      if (factor !== undefined) {
        // Use points directly as multiplier (e.g., 0.5 = 50% of area)
        desc.effective_area = Math.round(shape.area * factor);
      }
      // If factor not found, keep existing effective_area
    }
  });

  // Sum up effective areas from all descriptions
  return shape.descriptions.reduce((sum, desc) => {
    return sum + (desc.effective_area || 0);
  }, 0);
}

// Pre-save middleware to update calculated fields
propertySketchSchema.pre('save', async function (next) {
  try {
    const SketchSubAreaFactor = require('./SketchSubAreaFactor');

    // Get the effective year for looking up factors
    const effectiveYear = this.effective_year || new Date().getFullYear();

    // Look up all sub area factors for this municipality and year
    const factors = await SketchSubAreaFactor.findByMunicipalityForYear(
      this.municipality_id,
      effectiveYear,
    );

    // Create a map for quick lookup: displayText -> points
    const factorsMap = new Map();
    factors.forEach((factor) => {
      if (factor.displayText) {
        factorsMap.set(factor.displayText.toUpperCase(), factor.points);
      }
    });

    console.log(
      `🧮 PropertySketch pre-save: Loaded ${factors.length} sub area factors for year ${effectiveYear}`,
    );

    // Update description_codes from shapes and calculate effective areas
    const allDescriptions = new Set();
    let minArea = Infinity;
    let maxArea = 0;

    this.shapes.forEach((shape) => {
      // Calculate and update effective area for each shape using factors
      shape.effective_area = calculateShapeEffectiveArea(shape, factorsMap);

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
  } catch (error) {
    console.error('Error in PropertySketch pre-save middleware:', error);
    next(error);
  }
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
        doc.effective_year || new Date().getFullYear(),
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
        doc.effective_year || new Date().getFullYear(),
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

/**
 * Find sketches for a property/card that are effective for the given year.
 * Uses temporal inheritance - returns sketches from the most recent year <= requestedYear.
 * @param {ObjectId} propertyId - The property ID
 * @param {Number} cardNumber - The card number
 * @param {Number} year - The effective year to query for
 * @returns {Promise<Array>} Array of sketches effective for that year
 */
propertySketchSchema.statics.findForPropertyCardYear = async function (
  propertyId,
  cardNumber,
  year,
) {
  const mongoose = require('mongoose');
  const propertyObjectId =
    typeof propertyId === 'string'
      ? new mongoose.Types.ObjectId(propertyId)
      : propertyId;

  // Find the most recent effective year that has sketches for this property/card
  const latestSketch = await this.findOne({
    property_id: propertyObjectId,
    card_number: cardNumber,
    effective_year: { $lte: year },
  })
    .sort({ effective_year: -1 })
    .select('effective_year');

  if (!latestSketch) return [];

  // Return all sketches from that year for this property/card
  return this.find({
    property_id: propertyObjectId,
    card_number: cardNumber,
    effective_year: latestSketch.effective_year,
  }).sort({ created_at: -1 });
};

/**
 * Find a single sketch by ID, but only if it's effective for the given year.
 * Used for operations that need to verify year context.
 * @param {ObjectId} sketchId - The sketch ID
 * @param {Number} year - The effective year context
 * @returns {Promise<Object|null>} The sketch if effective for that year
 */
propertySketchSchema.statics.findByIdForYear = async function (sketchId, year) {
  const sketch = await this.findById(sketchId);
  if (!sketch) return null;

  // Sketch is valid if its effective_year <= requested year
  // AND there's no newer sketch for the same property/card
  const newerSketch = await this.findOne({
    property_id: sketch.property_id,
    card_number: sketch.card_number,
    effective_year: { $gt: sketch.effective_year, $lte: year },
  });

  // If a newer sketch exists for this year range, this one is superseded
  if (newerSketch) return null;

  // If sketch year is after requested year, it's not yet effective
  if (sketch.effective_year > year) return null;

  return sketch;
};

/**
 * Create or update a sketch for a specific year.
 * If updating a sketch from a previous year, creates a copy for the new year (copy-on-write).
 * @param {ObjectId} propertyId - The property ID
 * @param {Number} cardNumber - The card number
 * @param {Number} targetYear - The year to save for
 * @param {Object} sketchData - The sketch data to save
 * @param {ObjectId} userId - The user making the change
 * @returns {Promise<Object>} The saved sketch
 */
propertySketchSchema.statics.saveForYear = async function (
  propertyId,
  cardNumber,
  targetYear,
  sketchData,
  userId,
) {
  const mongoose = require('mongoose');
  const propertyObjectId =
    typeof propertyId === 'string'
      ? new mongoose.Types.ObjectId(propertyId)
      : propertyId;

  // Check if a sketch already exists for this exact year
  let existingSketch = await this.findOne({
    property_id: propertyObjectId,
    card_number: cardNumber,
    effective_year: targetYear,
  });

  if (existingSketch) {
    // Update existing sketch for this year
    Object.assign(existingSketch, sketchData);
    existingSketch.updated_by = userId;
    return existingSketch.save();
  }

  // No sketch for this exact year - create new one
  // (This is the copy-on-write behavior when editing inherited data)
  const newSketch = new this({
    ...sketchData,
    property_id: propertyObjectId,
    card_number: cardNumber,
    effective_year: targetYear,
    created_by: userId,
    updated_by: userId,
  });

  return newSketch.save();
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
