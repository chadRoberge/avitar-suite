const mongoose = require('mongoose');

/**
 * ParcelAssessment Model
 *
 * Purpose: Single source of truth for parcel-level assessment totals
 * - Aggregates all cards for a property
 * - Maintains breakdown by land/building/improvements
 * - Provides audit trail of changes
 * - Supports unlimited number of cards per parcel
 *
 * This is separate from:
 * - PropertyTreeNode: Lightweight navigation/tree display
 * - PropertyAssessment: Temporal history model (deprecated for parcel totals)
 * - BuildingAssessment: Individual card building details
 * - LandAssessment: Property-wide land details
 */
const parcelAssessmentSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    effective_year: {
      type: Number,
      required: true,
      index: true,
    },

    // PARCEL-LEVEL TOTALS (sum of all cards)
    parcel_totals: {
      total_assessed_value: { type: Number, required: true, default: 0 },
      total_land_value: { type: Number, required: true, default: 0 },
      total_building_value: { type: Number, required: true, default: 0 },
      total_improvements_value: { type: Number, required: true, default: 0 },
    },

    // CARD-LEVEL BREAKDOWN (embedded for easy access)
    // No limit on number of cards - supports unlimited cards per parcel
    card_assessments: [
      {
        card_number: { type: Number, required: true },
        land_value: { type: Number, default: 0 },
        building_value: { type: Number, default: 0 },
        improvements_value: { type: Number, default: 0 },
        card_total: { type: Number, default: 0 },

        // Reference to detailed card assessments
        building_assessment_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'BuildingAssessment',
        },
        last_updated: { type: Date, default: Date.now },
      },
    ],

    // LAND ALLOCATION DETAILS (clarity on how land is split across cards)
    land_allocation: {
      base_land_value: { type: Number, default: 0 }, // From LandAssessment (base parcel land)
      card_1_land_value: { type: Number, default: 0 }, // Base + card 1 view/waterfront
      total_view_value: { type: Number, default: 0 }, // Sum of view values across all cards
      total_waterfront_value: { type: Number, default: 0 }, // Sum of waterfront values across all cards

      // Card-specific land allocations (for cards 2+, only view/waterfront)
      card_land_values: { type: Map, of: Number }, // Map of card_number -> land value
    },

    // AUDIT TRAIL
    last_calculated: { type: Date, default: Date.now },
    calculated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    calculation_trigger: {
      type: String,
      enum: [
        'building_update',
        'land_update',
        'feature_update',
        'manual_recalc',
        'sketch_update',
        'initial_calculation',
        'card_added',
        'card_removed',
        'import',
      ],
    },

    // HISTORY TRACKING (for change detection)
    previous_total: { type: Number },
    change_amount: { type: Number },
    change_percentage: { type: Number },

    // CALCULATION METADATA
    total_cards_count: { type: Number, default: 1 }, // How many cards were included
    calculation_duration_ms: { type: Number }, // Performance tracking
  },
  {
    collection: 'parcel_assessments',
    timestamps: true,
  },
);

// Compound indexes for efficient queries
parcelAssessmentSchema.index({ property_id: 1, effective_year: -1 });
parcelAssessmentSchema.index({ municipality_id: 1, effective_year: -1 });
parcelAssessmentSchema.index({
  municipality_id: 1,
  effective_year: 1,
  'parcel_totals.total_assessed_value': -1,
});

/**
 * Get current parcel assessment for a property
 * @param {ObjectId} propertyId - Property ID
 * @param {number} year - Assessment year (defaults to current year)
 * @returns {Object} - Parcel assessment document
 */
parcelAssessmentSchema.statics.getCurrentParcel = async function (
  propertyId,
  year = null,
) {
  const currentYear = year || new Date().getFullYear();
  return this.findOne({
    property_id: propertyId,
    effective_year: { $lte: currentYear },
  }).sort({ effective_year: -1 });
};

/**
 * Get parcel assessment for specific year (exact match)
 * @param {ObjectId} propertyId - Property ID
 * @param {number} year - Assessment year
 * @returns {Object} - Parcel assessment document
 */
parcelAssessmentSchema.statics.getParcelForYear = async function (
  propertyId,
  year,
) {
  return this.findOne({
    property_id: propertyId,
    effective_year: year,
  });
};

/**
 * Get assessment for a specific card
 * @param {ObjectId} propertyId - Property ID
 * @param {number} cardNumber - Card number
 * @param {number} year - Assessment year (defaults to current year)
 * @returns {Object} - Card assessment details
 */
parcelAssessmentSchema.statics.getCardAssessment = async function (
  propertyId,
  cardNumber,
  year = null,
) {
  const currentYear = year || new Date().getFullYear();
  const parcel = await this.findOne({
    property_id: propertyId,
    effective_year: { $lte: currentYear },
  }).sort({ effective_year: -1 });

  if (!parcel) return null;

  return parcel.card_assessments.find(
    (card) => card.card_number === cardNumber,
  );
};

/**
 * Get all parcel assessments for a municipality in a specific year
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} year - Assessment year
 * @param {Object} filters - Optional filters (e.g., min/max value)
 * @returns {Array} - Array of parcel assessments
 */
parcelAssessmentSchema.statics.getMunicipalityParcels = async function (
  municipalityId,
  year,
  filters = {},
) {
  const query = {
    municipality_id: municipalityId,
    effective_year: year,
  };

  if (filters.minValue) {
    query['parcel_totals.total_assessed_value'] = {
      $gte: filters.minValue,
    };
  }
  if (filters.maxValue) {
    query['parcel_totals.total_assessed_value'] = {
      ...query['parcel_totals.total_assessed_value'],
      $lte: filters.maxValue,
    };
  }

  return this.find(query).sort({ 'parcel_totals.total_assessed_value': -1 });
};

/**
 * Calculate municipality-wide totals
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} year - Assessment year
 * @returns {Object} - Aggregated totals
 */
parcelAssessmentSchema.statics.getMunicipalityTotals = async function (
  municipalityId,
  year,
) {
  const result = await this.aggregate([
    {
      $match: {
        municipality_id: municipalityId,
        effective_year: year,
      },
    },
    {
      $group: {
        _id: null,
        total_parcels: { $sum: 1 },
        total_assessed_value: { $sum: '$parcel_totals.total_assessed_value' },
        total_land_value: { $sum: '$parcel_totals.total_land_value' },
        total_building_value: { $sum: '$parcel_totals.total_building_value' },
        total_improvements_value: {
          $sum: '$parcel_totals.total_improvements_value',
        },
        avg_parcel_value: { $avg: '$parcel_totals.total_assessed_value' },
        max_parcel_value: { $max: '$parcel_totals.total_assessed_value' },
        min_parcel_value: { $min: '$parcel_totals.total_assessed_value' },
      },
    },
  ]);

  return result.length > 0 ? result[0] : null;
};

/**
 * Get parcels with significant changes year-over-year
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} year - Current assessment year
 * @param {number} thresholdPercent - Minimum change percentage to include
 * @returns {Array} - Parcels with significant changes
 */
parcelAssessmentSchema.statics.getSignificantChanges = async function (
  municipalityId,
  year,
  thresholdPercent = 10,
) {
  return this.find({
    municipality_id: municipalityId,
    effective_year: year,
    change_percentage: { $gte: thresholdPercent },
  }).sort({ change_percentage: -1 });
};

// Pre-save hook to ensure card_assessments are sorted by card_number
parcelAssessmentSchema.pre('save', function (next) {
  if (this.card_assessments && this.card_assessments.length > 0) {
    this.card_assessments.sort((a, b) => a.card_number - b.card_number);
  }
  next();
});

// Post-save hook to log significant changes
parcelAssessmentSchema.post('save', function (doc) {
  if (doc.change_percentage && Math.abs(doc.change_percentage) >= 10) {
    console.log(
      `⚠️  Significant assessment change: Property ${doc.property_id}, Change: ${doc.change_percentage.toFixed(2)}% ($${doc.change_amount?.toLocaleString()})`,
    );
  }
});

module.exports = mongoose.model('ParcelAssessment', parcelAssessmentSchema);
