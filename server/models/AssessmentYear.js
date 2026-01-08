const mongoose = require('mongoose');

/**
 * AssessmentYear Model
 *
 * Purpose: Year-level metadata for the assessing module
 * - Replaces Municipality.assessingSettings.hiddenYears and lockedConfigYears
 * - Stores cached totals for MS-1 and other reports
 * - Tracks fiscal milestones (warrants, bills, commitment dates)
 * - Enables copy-on-write temporal database pattern
 *
 * Key Benefits:
 * - Year creation is instant (just creates this document)
 * - Assessment data inherits via temporal queries until modified
 * - Centralized year status and totals
 */
const assessmentYearSchema = new mongoose.Schema(
  {
    // Core identification
    year: {
      type: Number,
      required: [true, 'Year is required'],
      min: [2000, 'Year must be 2000 or later'],
      max: [2099, 'Year must be before 2100'],
      index: true,
    },
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: [true, 'Municipality ID is required'],
      index: true,
    },

    // Status flags (replaces Municipality.assessingSettings arrays)
    isLocked: {
      type: Boolean,
      default: false,
      description:
        'Locked years cannot have configuration tables modified. Years are automatically locked when a new year is created from them.',
    },
    isHidden: {
      type: Boolean,
      default: true,
      description:
        'Hidden years are not visible to public users. Staff/assessors can still see and work on hidden years.',
    },

    // Cached MS-1 totals (pre-calculated for report performance)
    cachedTotals: {
      totalLandValue: { type: Number, default: 0 },
      totalBuildingValue: { type: Number, default: 0 },
      totalImprovementsValue: { type: Number, default: 0 },
      totalAssessedValue: { type: Number, default: 0 },
      totalExemptionsValue: { type: Number, default: 0 },
      totalTaxableValue: { type: Number, default: 0 },
      parcelCount: { type: Number, default: 0 },
      lastCalculated: { type: Date },
    },

    // Fiscal milestones
    warrantCreatedAt: {
      type: Date,
      description: 'Date when the warrant was created for this year',
    },
    billsGeneratedAt: {
      type: Date,
      description: 'Date when tax bills were generated for this year',
    },
    taxRate: {
      type: Number,
      min: [0, 'Tax rate cannot be negative'],
      description: 'Tax rate per $1000 of assessed value',
    },
    commitmentDate: {
      type: Date,
      description: 'Date when the tax roll was committed',
    },

    // Audit trail
    sourceYear: {
      type: Number,
      description:
        'The year this assessment year was created from (for configuration copying)',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who created this assessment year',
    },

    // Recalculation tracking
    lastRecalculationAt: {
      type: Date,
      description: 'Date of the last bulk recalculation',
    },
    lastRecalculationType: {
      type: String,
      enum: ['land', 'building', 'features', 'view', 'all'],
      description: 'Type of the last bulk recalculation',
    },
    lastRecalculationRecordsCreated: {
      type: Number,
      description: 'Number of records created in the last recalculation',
    },
  },
  {
    collection: 'assessment_years',
    timestamps: true,
  },
);

// Compound unique index - only one record per municipality/year
assessmentYearSchema.index({ municipalityId: 1, year: 1 }, { unique: true });

// Index for year lookups within municipality
assessmentYearSchema.index({ municipalityId: 1, isHidden: 1, year: -1 });

/**
 * Get the active (unlocked, most recent visible) year for a municipality
 * @param {ObjectId} municipalityId - Municipality ID
 * @returns {Object} - AssessmentYear document
 */
assessmentYearSchema.statics.getActiveYear = async function (municipalityId) {
  return this.findOne({
    municipalityId,
    isLocked: false,
    isHidden: false,
  }).sort({ year: -1 });
};

/**
 * Get all years visible to user
 * Staff can see hidden years, public users cannot
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {boolean} isStaff - Whether the user is staff/assessor
 * @returns {Array} - Array of AssessmentYear documents
 */
assessmentYearSchema.statics.getVisibleYears = async function (
  municipalityId,
  isStaff = false,
) {
  const query = { municipalityId };
  if (!isStaff) {
    query.isHidden = false;
  }
  return this.find(query).sort({ year: -1 });
};

/**
 * Get a specific year for a municipality
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} year - Assessment year
 * @returns {Object} - AssessmentYear document
 */
assessmentYearSchema.statics.getYear = async function (municipalityId, year) {
  return this.findOne({ municipalityId, year });
};

/**
 * Recalculate and cache totals from assessment data
 * Uses temporal queries to get effective values for the year
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} year - Assessment year
 * @returns {Object} - Updated cached totals
 */
assessmentYearSchema.statics.recalculateTotals = async function (
  municipalityId,
  year,
) {
  const ParcelAssessment = mongoose.model('ParcelAssessment');

  // Use temporal query to get effective parcels for this year
  const result = await ParcelAssessment.aggregate([
    {
      $match: {
        municipality_id: municipalityId,
        effective_year: { $lte: year },
      },
    },
    // Get most recent effective record per property
    { $sort: { property_id: 1, effective_year: -1 } },
    { $group: { _id: '$property_id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    // Calculate totals
    {
      $group: {
        _id: null,
        parcelCount: { $sum: 1 },
        totalLandValue: { $sum: '$parcel_totals.total_land_value' },
        totalBuildingValue: { $sum: '$parcel_totals.total_building_value' },
        totalImprovementsValue: {
          $sum: '$parcel_totals.total_improvements_value',
        },
        totalAssessedValue: { $sum: '$parcel_totals.total_assessed_value' },
      },
    },
  ]);

  const totals = result.length > 0 ? result[0] : {};
  delete totals._id;

  // Update the AssessmentYear document with cached totals
  const updatedYear = await this.findOneAndUpdate(
    { municipalityId, year },
    {
      $set: {
        'cachedTotals.totalLandValue': totals.totalLandValue || 0,
        'cachedTotals.totalBuildingValue': totals.totalBuildingValue || 0,
        'cachedTotals.totalImprovementsValue':
          totals.totalImprovementsValue || 0,
        'cachedTotals.totalAssessedValue': totals.totalAssessedValue || 0,
        'cachedTotals.parcelCount': totals.parcelCount || 0,
        'cachedTotals.lastCalculated': new Date(),
      },
    },
    { new: true },
  );

  return updatedYear?.cachedTotals;
};

/**
 * Create a new assessment year from an existing year
 * Only creates the AssessmentYear document and copies configuration tables
 * Assessment data inherits via temporal queries (no copying needed)
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} sourceYear - Year to copy configuration from
 * @param {number} targetYear - New year to create
 * @param {ObjectId} userId - User creating the year
 * @returns {Object} - New AssessmentYear document
 */
assessmentYearSchema.statics.createFromYear = async function (
  municipalityId,
  sourceYear,
  targetYear,
  userId,
) {
  // Check if target year already exists
  const existing = await this.findOne({ municipalityId, year: targetYear });
  if (existing) {
    throw new Error(`Assessment year ${targetYear} already exists`);
  }

  // Lock the source year
  await this.findOneAndUpdate(
    { municipalityId, year: sourceYear },
    { $set: { isLocked: true } },
  );

  // Create the new year document
  const newYear = await this.create({
    municipalityId,
    year: targetYear,
    isLocked: false,
    isHidden: true, // New years start hidden
    sourceYear,
    createdBy: userId,
  });

  return newYear;
};

/**
 * Check if a year is locked
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} year - Assessment year
 * @returns {boolean} - Whether the year is locked
 */
assessmentYearSchema.statics.isYearLocked = async function (
  municipalityId,
  year,
) {
  const assessmentYear = await this.findOne({ municipalityId, year });
  return assessmentYear?.isLocked || false;
};

/**
 * Lock a year (prevents configuration changes)
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} year - Assessment year
 * @returns {Object} - Updated AssessmentYear document
 */
assessmentYearSchema.statics.lockYear = async function (municipalityId, year) {
  return this.findOneAndUpdate(
    { municipalityId, year },
    { $set: { isLocked: true } },
    { new: true },
  );
};

/**
 * Toggle visibility of a year
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} year - Assessment year
 * @param {boolean} isHidden - Whether to hide the year
 * @returns {Object} - Updated AssessmentYear document
 */
assessmentYearSchema.statics.setVisibility = async function (
  municipalityId,
  year,
  isHidden,
) {
  return this.findOneAndUpdate(
    { municipalityId, year },
    { $set: { isHidden } },
    { new: true },
  );
};

/**
 * Update fiscal milestones (tax rate, commitment date, etc.)
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} year - Assessment year
 * @param {Object} milestones - Milestone data to update
 * @returns {Object} - Updated AssessmentYear document
 */
assessmentYearSchema.statics.updateMilestones = async function (
  municipalityId,
  year,
  milestones,
) {
  const allowedFields = [
    'warrantCreatedAt',
    'billsGeneratedAt',
    'taxRate',
    'commitmentDate',
  ];
  const updateData = {};

  for (const field of allowedFields) {
    if (milestones[field] !== undefined) {
      updateData[field] = milestones[field];
    }
  }

  return this.findOneAndUpdate(
    { municipalityId, year },
    { $set: updateData },
    { new: true },
  );
};

module.exports = mongoose.model('AssessmentYear', assessmentYearSchema);
