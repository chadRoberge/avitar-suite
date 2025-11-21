const mongoose = require('mongoose');
const { roundToNearestHundred } = require('../utils/assessment');
const AssessmentAuditHistory = require('./AssessmentAuditHistory');
const BillingPeriodValidator = require('../utils/billingPeriodValidator');

// Land Assessment - Property/Parcel level (not card-specific)
const landAssessmentSchema = new mongoose.Schema(
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

    // Assessment year this record applies to
    effective_year: { type: Number, required: true, index: true },

    // Reference data IDs
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
    },
    neighborhood: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NeighborhoodCode',
    },
    site_conditions: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyAttribute',
    },
    driveway_type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyAttribute',
    },
    road_type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyAttribute',
    },

    // Property-level land use classification (for filtering/reporting)
    property_use_code: {
      type: String,
      index: true,
    },
    property_use_category: {
      type: String,
      index: true,
      enum: ['RES', 'COM', 'IND', 'AG', 'EX', 'MXU', null],
    },

    // Land valuation
    current_use_credit: { type: Number, default: 0 },
    market_value: { type: Number, default: 0 },
    taxable_value: { type: Number, default: 0 },

    // Land use breakdown
    land_use_details: [
      {
        land_use_detail_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'LandUseDetail',
        },
        // Legacy fields (kept for backward compatibility during migration)
        land_use_code: String, // Specific code like "R1", "R1A", "COM", etc.
        land_use_type: String, // Category: "RES", "COM", "IND", "AG", "EX", "MXU"
        size: Number,
        size_unit: { type: String, enum: ['AC', 'FF'], default: 'AC' },
        topography: String,
        condition: String,
        spi: Number, // Soil Productivity Index for current use calculations
        is_excess_acreage: { type: Boolean, default: false }, // Flag to indicate if this land line should be assessed as excess acreage
        notes: String,

        // Calculated values (computed by land assessment calculator)
        baseRate: Number, // Land base rate per acre/frontage
        baseValue: Number, // Base rate × acreage
        neighborhoodFactor: Number, // Neighborhood adjustment factor
        economyOfScaleFactor: Number, // Economy of scale factor for excess land
        siteFactor: Number, // Site conditions factor
        drivewayFactor: Number, // Driveway type factor
        roadFactor: Number, // Road type factor
        topographyFactor: Number, // Topography factor
        conditionFactor: Number, // Condition factor
        marketValue: Number, // Final market value after all factors
        currentUseValue: Number, // Agricultural/forestry current use value
        currentUseCredit: Number, // Market value - current use value
        assessedValue: Number, // Final assessed value for taxation
      },
    ],

    // Taxation category
    taxation_category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LandTaxationCategory',
    },

    // Calculated totals (computed by shared calculator)
    calculated_totals: {
      // Basic measurements
      totalAcreage: { type: Number, default: 0 },
      totalFrontage: { type: Number, default: 0 },

      // Land Details values (land lines only)
      landDetailsMarketValue: { type: Number, default: 0 },
      landDetailsAssessedValue: { type: Number, default: 0 },

      // View values
      viewMarketValue: { type: Number, default: 0 },
      viewAssessedValue: { type: Number, default: 0 },

      // Waterfront values
      waterfrontMarketValue: { type: Number, default: 0 },
      waterfrontAssessedValue: { type: Number, default: 0 },

      // Total values (land details + view + waterfront)
      totalMarketValue: { type: Number, default: 0 },
      totalAssessedValue: { type: Number, default: 0 },

      // Legacy fields for backward compatibility
      totalCurrentUseValue: { type: Number, default: 0 },
      totalCurrentUseCredit: { type: Number, default: 0 },
      totalLNICU: { type: Number, default: 0 },
      totalCUValue: { type: Number, default: 0 },
      totalViewValue: { type: Number, default: 0 }, // For backward compatibility
      landMarketValue: { type: Number, default: 0 }, // Legacy alias
      landAssessedValue: { type: Number, default: 0 }, // Legacy alias

      // Additional metadata
      hasCurrentUseLand: { type: Boolean, default: false },
    },

    // Calculation tracking
    last_calculated: { type: Date },

    // Audit trail
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_at: { type: Date, default: Date.now },

    // Assessment details
    last_changed: { type: Date, default: Date.now },
    change_reason: {
      type: String,
      enum: [
        'revaluation',
        'appeal',
        'new_construction',
        'market_correction',
        'cyclical_review',
        'zoning_change',
        'land_use_change',
      ],
    },
  },
  {
    collection: 'land_assessments',
  },
);

// Indexes
landAssessmentSchema.index({ municipality_id: 1, effective_year: -1 });
landAssessmentSchema.index({ property_id: 1, effective_year: -1 });
// Unique compound index for temporal database - one assessment per property per year
landAssessmentSchema.index(
  { property_id: 1, effective_year: 1 },
  { unique: true },
);

// Store original document for audit tracking
landAssessmentSchema.pre('save', function (next) {
  // Store original document before changes for audit trail
  if (this.isModified() && !this.isNew) {
    this._originalDoc = this.constructor.findById(this._id).lean();
    this.updated_at = new Date();
    this.last_changed = new Date();
  }
  next();
});

// Billing period validation and audit tracking
landAssessmentSchema.pre('save', async function (next) {
  try {
    // Skip validation for new documents or if validation is bypassed
    if (this.isNew || this._skipBillingValidation) {
      return next();
    }

    // Validate billing period
    const validation = await BillingPeriodValidator.validateChangeAllowed(
      this.municipality_id,
      this.effective_year,
    );

    if (!validation.allowed) {
      const error = new Error(
        validation.message || 'Changes not allowed for this billing period',
      );
      error.name = 'BillingPeriodValidationError';
      error.code = validation.error;
      error.details = validation;
      return next(error);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Static method to get or create land assessment for a property
landAssessmentSchema.statics.getOrCreateForProperty = async function (
  propertyId,
  municipalityId,
  year = null,
) {
  const currentYear = year || new Date().getFullYear();

  let landAssessment = await this.findOne({
    property_id: propertyId,
    effective_year: currentYear,
  });

  if (!landAssessment) {
    landAssessment = new this({
      property_id: propertyId,
      municipality_id: municipalityId,
      effective_year: currentYear,
    });
    await landAssessment.save();
  }

  return landAssessment;
};

// Static method to update land assessment with billing validation and audit
landAssessmentSchema.statics.updateForProperty = async function (
  propertyId,
  municipalityId,
  assessmentData,
  userId,
  year = null,
  auditInfo = {},
) {
  const currentYear = year || new Date().getFullYear();

  // Validate billing period before attempting update
  const validation = await BillingPeriodValidator.validateChangeAllowed(
    municipalityId,
    currentYear,
  );
  if (!validation.allowed) {
    const error = new Error(validation.message);
    error.name = 'BillingPeriodValidationError';
    error.code = validation.error;
    error.details = validation;
    throw error;
  }

  // Get existing assessment for audit trail
  const existingAssessment = await this.findOne({
    property_id: propertyId,
    effective_year: currentYear,
  }).lean();

  const updateData = {
    ...assessmentData,
    updated_by: userId,
    updated_at: new Date(),
    last_changed: new Date(),
  };

  const landAssessment = await this.findOneAndUpdate(
    {
      property_id: propertyId,
      effective_year: currentYear,
    },
    updateData,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  // Set municipality_id if this is a new record
  if (!landAssessment.municipality_id) {
    landAssessment.municipality_id = municipalityId;
    landAssessment._skipBillingValidation = true; // Skip validation for this system update
    await landAssessment.save();
  }

  // Create audit entry
  try {
    await AssessmentAuditHistory.createAuditEntry(
      landAssessment,
      existingAssessment,
      userId,
      existingAssessment ? 'update' : 'create',
      auditInfo.change_reason,
      auditInfo,
    );
  } catch (auditError) {
    console.error('Failed to create audit entry:', auditError);
    // Don't fail the main operation for audit errors
  }

  return landAssessment;
};

// Trigger parcel assessment update after save
landAssessmentSchema.post('save', async function (doc) {
  try {
    const { updateParcelAssessment } = require('../utils/assessment');

    console.log(
      `Land assessment saved, triggering parcel recalculation for property ${doc.property_id}...`,
    );

    const result = await updateParcelAssessment(
      doc.property_id,
      doc.municipality_id,
      doc.effective_year,
      { trigger: 'land_update', userId: null },
    );

    console.log(
      `✓ Parcel assessment updated after land change:`,
      `Total: $${result.parcelTotals.total_assessed_value.toLocaleString()},`,
      `Land: $${result.parcelTotals.total_land_value.toLocaleString()}`,
    );
  } catch (error) {
    console.error(
      'Error updating parcel assessment after land assessment save:',
      {
        propertyId: doc.property_id,
        error: error.message,
      },
    );
  }
});

// Audit tracking post-save hook
landAssessmentSchema.post('save', async function (doc) {
  try {
    // Create audit entry if we have the necessary data and it's not a system operation
    if (doc._auditInfo && !doc._skipAudit) {
      await AssessmentAuditHistory.createAuditEntry(
        doc,
        doc._originalDoc,
        doc._auditInfo.user_id,
        doc.isNew ? 'create' : 'update',
        doc._auditInfo.change_reason,
        doc._auditInfo,
      );
    }
  } catch (error) {
    console.error('Error creating audit entry:', error);
    // Don't fail the save operation for audit errors
  }
});

landAssessmentSchema.post('remove', async function (doc) {
  try {
    const { updateParcelAssessment } = require('../utils/assessment');

    console.log(
      `Land assessment removed, recalculating parcel for property ${doc.property_id}...`,
    );

    const result = await updateParcelAssessment(
      doc.property_id,
      doc.municipality_id,
      doc.effective_year,
      { trigger: 'land_update', userId: null },
    );

    console.log(
      `✓ Parcel assessment updated after land removal:`,
      `Total: $${result.parcelTotals.total_assessed_value.toLocaleString()}`,
    );

    // Create audit entry for removal
    if (doc._auditInfo) {
      await AssessmentAuditHistory.createAuditEntry(
        doc,
        doc,
        doc._auditInfo.user_id,
        'delete',
        doc._auditInfo.change_reason,
        doc._auditInfo,
      );
    }
  } catch (error) {
    console.error(
      'Error updating parcel assessment after land assessment removal:',
      {
        propertyId: doc.property_id,
        error: error.message,
      },
    );
  }
});

// Static method to safely save with audit info
landAssessmentSchema.statics.saveWithAudit = async function (
  assessment,
  auditInfo,
) {
  assessment._auditInfo = auditInfo;
  assessment._skipAudit = false;
  return assessment.save();
};

// Static method to get assessment history for a property
landAssessmentSchema.statics.getPropertyAssessmentHistory = async function (
  propertyId,
  options = {},
) {
  const query = { property_id: propertyId };

  if (options.municipalityId) {
    query.municipality_id = options.municipalityId;
  }

  if (options.startYear || options.endYear) {
    query.effective_year = {};
    if (options.startYear) query.effective_year.$gte = options.startYear;
    if (options.endYear) query.effective_year.$lte = options.endYear;
  }

  return this.find(query)
    .populate('municipality_id', 'name')
    .populate('zone', 'name description')
    .populate('neighborhood', 'code description rate')
    .sort({ effective_year: -1 })
    .limit(options.limit || 10);
};

// Static method to copy assessment to new year (for year rollover)
landAssessmentSchema.statics.copyToNewYear = async function (
  propertyId,
  fromYear,
  toYear,
  userId,
  auditInfo = {},
) {
  const sourceAssessment = await this.findOne({
    property_id: propertyId,
    effective_year: fromYear,
  }).lean();

  if (!sourceAssessment) {
    throw new Error(
      `No land assessment found for property ${propertyId} in year ${fromYear}`,
    );
  }

  // Remove fields that shouldn't be copied
  delete sourceAssessment._id;
  delete sourceAssessment.__v;
  delete sourceAssessment.created_at;
  delete sourceAssessment.updated_at;
  delete sourceAssessment.last_calculated;
  delete sourceAssessment.last_changed;

  const newAssessment = new this({
    ...sourceAssessment,
    effective_year: toYear,
    created_by: userId,
    updated_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  newAssessment._skipBillingValidation = true; // Skip validation for system operations
  newAssessment._auditInfo = {
    ...auditInfo,
    user_id: userId,
    change_reason: 'year_rollover',
    notes: `Copied from ${fromYear} to ${toYear}`,
  };

  return newAssessment.save();
};

module.exports = mongoose.model('LandAssessment', landAssessmentSchema);
