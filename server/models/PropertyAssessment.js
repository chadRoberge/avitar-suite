const mongoose = require('mongoose');

// Temporal assessment data - stores only when values change
const propertyAssessmentSchema = new mongoose.Schema(
  {
    property_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyTreeNode',
      required: true,
      index: true,
    },
    municipality_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      index: true,
    },

    // Multi-card support
    card_number: { type: Number, default: 1, min: 1, max: 10, index: true },

    // Assessment year this record applies to
    effective_year: { type: Number, required: true, index: true },

    // Land assessment (only stored when it changes)
    land: {
      value: Number,
      acreage: Number,
      frontage: Number,
      depth: Number,
      land_class: String, // Agricultural, Residential, Commercial, etc.
      last_changed: { type: Number, index: true }, // Year this value was established
    },

    // Building assessment (only stored when it changes)
    building: {
      value: Number,
      year_built: Number,
      square_feet: Number,
      stories: Number,
      grade: String, // A, B, C, D quality
      condition: String, // Excellent, Good, Average, Poor
      last_changed: { type: Number, index: true },
    },

    // Other improvements (decks, pools, outbuildings)
    other_improvements: {
      value: Number,
      description: String,
      last_changed: Number,
    },

    // Total assessment (calculated)
    total_value: { type: Number, index: true },

    // Assessment details
    assessment_method: {
      type: String,
      enum: ['market', 'cost', 'income', 'hybrid'],
      default: 'market',
    },
    assessor_notes: String,
    reviewed_date: Date,
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Listing history (property visits)
    listing_history: [
      {
        visit_date: { type: Date, required: true },
        visit_code: { type: String, required: true, maxlength: 4 }, // 4-letter code
        notes: String,
      },
    ],

    // Audit trail
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_at: { type: Date, default: Date.now },

    // Change reason
    change_reason: {
      type: String,
      enum: [
        'revaluation',
        'appeal',
        'new_construction',
        'demolition',
        'renovation',
        'market_correction',
        'cyclical_review',
      ],
    },
  },
  {
    collection: 'property_assessments',
  },
);

// Update the updated_at field on save
propertyAssessmentSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Compound indexes for temporal queries
propertyAssessmentSchema.index({
  property_id: 1,
  effective_year: -1,
  card_number: 1,
});
propertyAssessmentSchema.index({ municipality_id: 1, effective_year: -1 });
propertyAssessmentSchema.index({ municipality_id: 1, 'land.last_changed': -1 });
propertyAssessmentSchema.index({
  municipality_id: 1,
  'building.last_changed': -1,
});

// Static method to get assessment for specific year
propertyAssessmentSchema.statics.getAssessmentForYear = async function (
  propertyId,
  year,
  cardNumber = 1,
) {
  // Get the most recent assessment record for or before the requested year for this card
  const assessment = await this.findOne({
    property_id: propertyId,
    card_number: cardNumber,
    effective_year: { $lte: year },
  }).sort({ effective_year: -1 });

  if (!assessment) return null;

  // For each component (land, building, other), find the value that was in effect for the requested year
  const result = {
    property_id: propertyId,
    effective_year: year,
    total_value: 0,
  };

  // Get land value - find most recent land change before or at requested year for this card
  const landRecord = await this.findOne({
    property_id: propertyId,
    card_number: cardNumber,
    'land.last_changed': { $lte: year },
    'land.value': { $exists: true },
  }).sort({ 'land.last_changed': -1 });

  if (landRecord) {
    result.land = landRecord.land;
    result.total_value += landRecord.land.value || 0;
  }

  // Get building value - find most recent building change before or at requested year for this card
  const buildingRecord = await this.findOne({
    property_id: propertyId,
    card_number: cardNumber,
    'building.last_changed': { $lte: year },
    'building.value': { $exists: true },
  }).sort({ 'building.last_changed': -1 });

  if (buildingRecord) {
    result.building = buildingRecord.building;
    result.total_value += buildingRecord.building.value || 0;
  }

  // Get other improvements - find most recent change before or at requested year for this card
  const otherRecord = await this.findOne({
    property_id: propertyId,
    card_number: cardNumber,
    'other_improvements.last_changed': { $lte: year },
    'other_improvements.value': { $exists: true },
  }).sort({ 'other_improvements.last_changed': -1 });

  if (otherRecord) {
    result.other_improvements = otherRecord.other_improvements;
    result.total_value += otherRecord.other_improvements.value || 0;
  }

  // Copy other relevant fields from the base assessment record
  result.assessment_method = assessment.assessment_method;
  result.assessor_notes = assessment.assessor_notes;
  result.reviewed_date = assessment.reviewed_date;
  result.reviewed_by = assessment.reviewed_by;

  return result;
};

// Static method to create new assessment record (only stores what changed)
propertyAssessmentSchema.statics.createAssessmentChange = async function (
  propertyId,
  year,
  changes,
  changeReason,
  userId,
) {
  const newRecord = {
    property_id: propertyId,
    municipality_id: changes.municipality_id,
    effective_year: year,
    change_reason: changeReason,
    created_by: userId,
  };

  let totalValue = 0;

  // Only store components that changed
  if (changes.land) {
    newRecord.land = {
      ...changes.land,
      last_changed: year,
    };
    totalValue += changes.land.value || 0;
  }

  if (changes.building) {
    newRecord.building = {
      ...changes.building,
      last_changed: year,
    };
    totalValue += changes.building.value || 0;
  }

  if (changes.other_improvements) {
    newRecord.other_improvements = {
      ...changes.other_improvements,
      last_changed: year,
    };
    totalValue += changes.other_improvements.value || 0;
  }

  // Get current values for components that didn't change
  const currentAssessment = await this.getAssessmentForYear(
    propertyId,
    year - 1,
  );
  if (currentAssessment) {
    if (!changes.land && currentAssessment.land) {
      totalValue += currentAssessment.land.value || 0;
    }
    if (!changes.building && currentAssessment.building) {
      totalValue += currentAssessment.building.value || 0;
    }
    if (!changes.other_improvements && currentAssessment.other_improvements) {
      totalValue += currentAssessment.other_improvements.value || 0;
    }
  }

  newRecord.total_value = totalValue;
  newRecord.assessment_method = changes.assessment_method || 'market';
  newRecord.assessor_notes = changes.assessor_notes;
  newRecord.reviewed_by = userId;
  newRecord.reviewed_date = new Date();

  return this.create(newRecord);
};

module.exports = mongoose.model('PropertyAssessment', propertyAssessmentSchema);
