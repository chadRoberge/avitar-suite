const mongoose = require('mongoose');

// Assessment Audit History - Tracks all changes to assessments within tax years
const assessmentAuditHistorySchema = new mongoose.Schema(
  {
    // Reference to the assessment record
    assessment_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    assessment_type: {
      type: String,
      required: true,
      enum: ['land', 'building', 'total'],
      index: true,
    },
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

    // Change tracking
    action_type: {
      type: String,
      required: true,
      enum: ['create', 'update', 'delete'],
    },
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
        'data_correction',
        'manual_adjustment',
      ],
    },

    // Before and after values
    previous_values: {
      type: mongoose.Schema.Types.Mixed, // Store the full previous document
    },
    new_values: {
      type: mongoose.Schema.Types.Mixed, // Store the full new document
    },

    // Key value changes for easy querying
    value_changes: [
      {
        field_name: String, // e.g., 'market_value', 'taxable_value', 'building_value'
        field_path: String, // e.g., 'land_use_details.0.marketValue' for nested fields
        previous_value: mongoose.Schema.Types.Mixed,
        new_value: mongoose.Schema.Types.Mixed,
        change_amount: Number, // new - previous for numeric values
        change_percentage: Number, // (new - previous) / previous * 100
      },
    ],

    // Calculated totals summary (for easy reporting)
    total_assessment_change: {
      previous_total: { type: Number, default: 0 },
      new_total: { type: Number, default: 0 },
      change_amount: { type: Number, default: 0 },
      change_percentage: { type: Number, default: 0 },
    },

    // User and session info
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    user_name: String, // Store for historical record even if user is deleted
    session_id: String, // Track batch operations
    ip_address: String,
    user_agent: String,

    // Billing period validation
    is_after_final_billing: {
      type: Boolean,
      default: false,
    },
    final_billing_date: Date, // When final billing was locked for this year

    // Metadata
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    notes: String, // Optional user notes about the change
  },
  {
    collection: 'assessment_audit_history',
  },
);

// Indexes for efficient querying
assessmentAuditHistorySchema.index({
  property_id: 1,
  effective_year: -1,
  created_at: -1,
});
assessmentAuditHistorySchema.index({
  municipality_id: 1,
  effective_year: -1,
  created_at: -1,
});
assessmentAuditHistorySchema.index({ user_id: 1, created_at: -1 });
assessmentAuditHistorySchema.index({
  assessment_type: 1,
  action_type: 1,
  created_at: -1,
});

// Static method to create audit entry
assessmentAuditHistorySchema.statics.createAuditEntry = async function (
  assessmentData,
  previousData,
  userId,
  actionType,
  changeReason = null,
  additionalInfo = {},
) {
  try {
    const auditEntry = {
      assessment_id: assessmentData._id,
      assessment_type: this.getAssessmentType(assessmentData),
      property_id: assessmentData.property_id,
      municipality_id: assessmentData.municipality_id,
      effective_year: assessmentData.effective_year,
      action_type: actionType,
      change_reason: changeReason,
      previous_values: previousData,
      new_values: assessmentData.toObject
        ? assessmentData.toObject()
        : assessmentData,
      user_id: userId,
      user_name: additionalInfo.user_name,
      session_id: additionalInfo.session_id,
      ip_address: additionalInfo.ip_address,
      user_agent: additionalInfo.user_agent,
      notes: additionalInfo.notes,
      is_after_final_billing: additionalInfo.is_after_final_billing || false,
      final_billing_date: additionalInfo.final_billing_date,
    };

    // Calculate value changes
    if (previousData && actionType === 'update') {
      auditEntry.value_changes = this.calculateValueChanges(
        previousData,
        assessmentData,
      );
      auditEntry.total_assessment_change = this.calculateTotalChange(
        previousData,
        assessmentData,
      );
    }

    const audit = new this(auditEntry);
    await audit.save();
    return audit;
  } catch (error) {
    console.error('Error creating audit entry:', error);
    throw error;
  }
};

// Helper method to determine assessment type from model
assessmentAuditHistorySchema.statics.getAssessmentType = function (
  assessmentData,
) {
  if (assessmentData.constructor.modelName === 'LandAssessment') {
    return 'land';
  } else if (assessmentData.constructor.modelName === 'BuildingAssessment') {
    return 'building';
  } else if (assessmentData.constructor.modelName === 'TotalAssessment') {
    return 'total';
  }
  return 'unknown';
};

// Helper method to calculate value changes between two documents
assessmentAuditHistorySchema.statics.calculateValueChanges = function (
  previousData,
  newData,
) {
  const changes = [];
  const fieldsToTrack = [
    'market_value',
    'taxable_value',
    'current_use_credit',
    'building_value',
    'replacement_cost_new',
    'assessed_value',
    'calculated_totals.totalMarketValue',
    'calculated_totals.totalAssessedValue',
    'calculated_totals.totalCurrentUseCredit',
  ];

  fieldsToTrack.forEach((fieldPath) => {
    const previousValue = this.getNestedValue(previousData, fieldPath);
    const newValue = this.getNestedValue(newData, fieldPath);

    if (
      previousValue !== newValue &&
      (previousValue !== null || newValue !== null)
    ) {
      const change = {
        field_name: fieldPath.split('.').pop(),
        field_path: fieldPath,
        previous_value: previousValue,
        new_value: newValue,
      };

      if (typeof previousValue === 'number' && typeof newValue === 'number') {
        change.change_amount = newValue - previousValue;
        if (previousValue !== 0) {
          change.change_percentage =
            ((newValue - previousValue) / previousValue) * 100;
        }
      }

      changes.push(change);
    }
  });

  return changes;
};

// Helper method to get nested object values
assessmentAuditHistorySchema.statics.getNestedValue = function (obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
};

// Helper method to calculate total assessment change
assessmentAuditHistorySchema.statics.calculateTotalChange = function (
  previousData,
  newData,
) {
  const previousTotal = this.getAssessmentTotal(previousData);
  const newTotal = this.getAssessmentTotal(newData);
  const changeAmount = newTotal - previousTotal;

  return {
    previous_total: previousTotal,
    new_total: newTotal,
    change_amount: changeAmount,
    change_percentage:
      previousTotal !== 0 ? (changeAmount / previousTotal) * 100 : 0,
  };
};

// Helper method to get total assessment value from any assessment type
assessmentAuditHistorySchema.statics.getAssessmentTotal = function (
  assessmentData,
) {
  if (assessmentData.taxable_value !== undefined) {
    return assessmentData.taxable_value;
  } else if (assessmentData.building_value !== undefined) {
    return assessmentData.building_value;
  } else if (assessmentData.assessed_value !== undefined) {
    return assessmentData.assessed_value;
  } else if (
    assessmentData.calculated_totals?.totalAssessedValue !== undefined
  ) {
    return assessmentData.calculated_totals.totalAssessedValue;
  }
  return 0;
};

// Static method to get audit history for a property
assessmentAuditHistorySchema.statics.getPropertyHistory = async function (
  propertyId,
  effectiveYear = null,
  options = {},
) {
  const query = { property_id: propertyId };
  if (effectiveYear) {
    query.effective_year = effectiveYear;
  }

  return this.find(query)
    .populate('user_id', 'name email')
    .sort({ created_at: -1 })
    .limit(options.limit || 100);
};

// Static method to get audit summary for reporting
assessmentAuditHistorySchema.statics.getAuditSummary = async function (
  municipalityId,
  effectiveYear,
  options = {},
) {
  const matchStage = {
    municipality_id: new mongoose.Types.ObjectId(municipalityId),
    effective_year: effectiveYear,
  };

  if (options.startDate || options.endDate) {
    matchStage.created_at = {};
    if (options.startDate)
      matchStage.created_at.$gte = new Date(options.startDate);
    if (options.endDate) matchStage.created_at.$lte = new Date(options.endDate);
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          assessment_type: '$assessment_type',
          action_type: '$action_type',
          user_id: '$user_id',
        },
        count: { $sum: 1 },
        total_value_change: { $sum: '$total_assessment_change.change_amount' },
        avg_value_change: { $avg: '$total_assessment_change.change_amount' },
        properties_affected: { $addToSet: '$property_id' },
      },
    },
    {
      $project: {
        assessment_type: '$_id.assessment_type',
        action_type: '$_id.action_type',
        user_id: '$_id.user_id',
        count: 1,
        total_value_change: 1,
        avg_value_change: 1,
        properties_count: { $size: '$properties_affected' },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

module.exports = mongoose.model(
  'AssessmentAuditHistory',
  assessmentAuditHistorySchema,
);
