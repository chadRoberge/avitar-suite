const mongoose = require('mongoose');

/**
 * Fee Schedule Model
 *
 * Versioned fee schedules for building permits with full audit trail,
 * per-permit-type configuration, and scheduled future effective dates.
 */
const feeScheduleSchema = new mongoose.Schema(
  {
    // Municipality reference
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Municipality',
      index: true,
    },

    // Permit type reference - each permit type has its own fee schedule versions
    permitTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'PermitType',
      index: true,
    },

    // Version number - auto-incremented per permit type
    version: {
      type: Number,
      required: true,
      min: 1,
    },

    // Status of this fee schedule version
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'archived'],
      default: 'draft',
      index: true,
    },

    // Timing - when this schedule takes effect and ends
    effectiveDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      default: null, // null if current/active
    },

    // Name/label for this version (optional, for easier identification)
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    // Fee Configuration
    feeConfiguration: {
      // Base permit fee
      baseAmount: {
        type: Number,
        default: 0,
        min: 0,
      },

      // How fees are calculated
      calculationType: {
        type: String,
        enum: ['flat', 'per_sqft', 'percentage', 'tiered', 'custom'],
        default: 'flat',
      },

      // For per_sqft calculation
      perSqftRate: {
        type: Number,
        default: 0,
        min: 0,
      },

      // For percentage calculation (based on project value)
      percentageRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },

      // Minimum fee (floor)
      minimumFee: {
        type: Number,
        default: 0,
        min: 0,
      },

      // Maximum fee (cap)
      maximumFee: {
        type: Number,
        default: null, // null = no cap
      },

      // For custom calculation
      formula: {
        type: String,
        trim: true,
      },

      // For tiered calculation (e.g., different rates based on value ranges)
      tiers: [
        {
          minValue: {
            type: Number,
            required: true,
            min: 0,
          },
          maxValue: {
            type: Number,
            default: null, // null = no upper limit
          },
          rate: {
            type: Number,
            default: 0,
          },
          flatAmount: {
            type: Number,
            default: 0,
          },
          description: String,
        },
      ],

      // Additional fees (plan review, inspections, etc.)
      additionalFees: [
        {
          name: {
            type: String,
            required: true,
            trim: true,
          },
          type: {
            type: String,
            enum: [
              'plan_review',
              'inspection',
              'reinspection',
              'expedite',
              'technology',
              'administrative',
              'other',
            ],
            default: 'other',
          },
          calculationType: {
            type: String,
            enum: ['flat', 'percentage_of_base', 'per_sqft', 'per_unit'],
            default: 'flat',
          },
          amount: {
            type: Number,
            required: true,
            min: 0,
          },
          percentageOfBase: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
          },
          isOptional: {
            type: Boolean,
            default: false,
          },
          description: String,
          appliesWhen: {
            // Conditional application of this fee
            field: String, // e.g., 'squareFootage', 'estimatedValue'
            operator: {
              type: String,
              enum: ['gt', 'gte', 'lt', 'lte', 'eq'],
            },
            value: mongoose.Schema.Types.Mixed,
          },
        },
      ],
    },

    // Audit Trail - who created this version
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdByName: {
      type: String,
      trim: true,
    },

    // Change documentation
    changeNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    changeReason: {
      type: String,
      enum: [
        'initial_setup',
        'annual_adjustment',
        'policy_change',
        'correction',
        'inflation_adjustment',
        'council_decision',
        'state_mandate',
        'other',
      ],
    },

    // Chain of custody - link to previous version
    previousVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeSchedule',
    },

    // Activation tracking
    activatedAt: {
      type: Date,
    },
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    activatedByName: String,

    // Archive tracking
    archivedAt: {
      type: Date,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    archivedReason: String,
  },
  {
    timestamps: true,
    collection: 'fee_schedules',
  },
);

// Compound indexes
feeScheduleSchema.index({ permitTypeId: 1, version: 1 }, { unique: true });
feeScheduleSchema.index({ permitTypeId: 1, status: 1 });
feeScheduleSchema.index({ municipalityId: 1, status: 1 });
feeScheduleSchema.index({ status: 1, effectiveDate: 1 }); // For scheduler job

// Virtual for display name
feeScheduleSchema.virtual('displayName').get(function () {
  if (this.name) {
    return `${this.name} (v${this.version})`;
  }
  return `Version ${this.version}`;
});

// Virtual for status badge info
feeScheduleSchema.virtual('statusInfo').get(function () {
  const statusMap = {
    draft: { label: 'Draft', color: 'secondary', icon: 'pencil' },
    scheduled: { label: 'Scheduled', color: 'warning', icon: 'calendar-full' },
    active: { label: 'Active', color: 'success', icon: 'checkmark-circle' },
    archived: { label: 'Archived', color: 'muted', icon: 'history' },
  };
  return statusMap[this.status] || statusMap.draft;
});

// Ensure virtuals are included in JSON
feeScheduleSchema.set('toJSON', { virtuals: true });
feeScheduleSchema.set('toObject', { virtuals: true });

// ============================================================================
// Static Methods
// ============================================================================

/**
 * Get the active fee schedule for a permit type as of a specific date
 * @param {ObjectId} permitTypeId - The permit type ID
 * @param {Date} asOfDate - The date to check (defaults to now)
 * @returns {Promise<FeeSchedule|null>}
 */
feeScheduleSchema.statics.getActiveSchedule = async function (
  permitTypeId,
  asOfDate = new Date(),
) {
  return this.findOne({
    permitTypeId,
    status: 'active',
    effectiveDate: { $lte: asOfDate },
    $or: [{ endDate: null }, { endDate: { $gt: asOfDate } }],
  }).sort({ effectiveDate: -1 });
};

/**
 * Get all fee schedules that are scheduled to activate on or before a date
 * @param {Date} asOfDate - The date to check
 * @returns {Promise<FeeSchedule[]>}
 */
feeScheduleSchema.statics.getScheduledToActivate = async function (
  asOfDate = new Date(),
) {
  return this.find({
    status: 'scheduled',
    effectiveDate: { $lte: asOfDate },
  }).populate('permitTypeId', 'name municipalityId');
};

/**
 * Get the version history for a permit type
 * @param {ObjectId} permitTypeId - The permit type ID
 * @param {Object} options - Query options (limit, skip, includeArchived)
 * @returns {Promise<FeeSchedule[]>}
 */
feeScheduleSchema.statics.getVersionHistory = async function (
  permitTypeId,
  options = {},
) {
  const query = { permitTypeId };

  if (!options.includeArchived) {
    query.status = { $ne: 'archived' };
  }

  let queryBuilder = this.find(query)
    .sort({ version: -1 })
    .populate('createdBy', 'first_name last_name')
    .populate('activatedBy', 'first_name last_name');

  if (options.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
  }
  if (options.skip) {
    queryBuilder = queryBuilder.skip(options.skip);
  }

  return queryBuilder;
};

/**
 * Get the next version number for a permit type
 * @param {ObjectId} permitTypeId - The permit type ID
 * @returns {Promise<number>}
 */
feeScheduleSchema.statics.getNextVersion = async function (permitTypeId) {
  const latest = await this.findOne({ permitTypeId })
    .sort({ version: -1 })
    .select('version');

  return latest ? latest.version + 1 : 1;
};

/**
 * Create a new version by copying from an existing schedule
 * @param {ObjectId} sourceId - The source fee schedule ID to copy from
 * @param {ObjectId} userId - The user creating the new version
 * @param {string} userName - The user's name
 * @returns {Promise<FeeSchedule>}
 */
feeScheduleSchema.statics.createNewVersion = async function (
  sourceId,
  userId,
  userName,
) {
  const source = await this.findById(sourceId);
  if (!source) {
    throw new Error('Source fee schedule not found');
  }

  const nextVersion = await this.getNextVersion(source.permitTypeId);

  const newSchedule = new this({
    municipalityId: source.municipalityId,
    permitTypeId: source.permitTypeId,
    version: nextVersion,
    status: 'draft',
    effectiveDate: new Date(), // Will be updated before activation
    feeConfiguration: source.feeConfiguration.toObject(),
    createdBy: userId,
    createdByName: userName,
    previousVersionId: source._id,
  });

  return newSchedule.save();
};

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Activate this fee schedule immediately
 * @param {ObjectId} userId - The user activating
 * @param {string} userName - The user's name
 */
feeScheduleSchema.methods.activate = async function (userId, userName) {
  const FeeSchedule = this.constructor;

  // Archive the current active schedule for this permit type
  const currentActive = await FeeSchedule.findOne({
    permitTypeId: this.permitTypeId,
    status: 'active',
  });

  if (currentActive && !currentActive._id.equals(this._id)) {
    currentActive.status = 'archived';
    currentActive.endDate = new Date();
    currentActive.archivedAt = new Date();
    currentActive.archivedBy = userId;
    currentActive.archivedReason = `Superseded by version ${this.version}`;
    await currentActive.save();
  }

  // Activate this schedule
  this.status = 'active';
  this.activatedAt = new Date();
  this.activatedBy = userId;
  this.activatedByName = userName;

  if (!this.effectiveDate || this.effectiveDate > new Date()) {
    this.effectiveDate = new Date();
  }

  return this.save();
};

/**
 * Schedule this fee schedule for future activation
 * @param {Date} effectiveDate - When to activate
 * @param {ObjectId} userId - The user scheduling
 * @param {string} userName - The user's name
 */
feeScheduleSchema.methods.schedule = async function (
  effectiveDate,
  userId,
  userName,
) {
  if (effectiveDate <= new Date()) {
    throw new Error('Effective date must be in the future for scheduling');
  }

  this.status = 'scheduled';
  this.effectiveDate = effectiveDate;
  this.activatedBy = userId;
  this.activatedByName = userName;

  return this.save();
};

/**
 * Calculate the fee for a permit using this schedule
 * @param {Object} permitData - Data about the permit (squareFootage, estimatedValue, etc.)
 * @returns {Object} - Calculated fees breakdown
 */
feeScheduleSchema.methods.calculateFees = function (permitData = {}) {
  const config = this.feeConfiguration;
  const result = {
    baseFee: 0,
    additionalFees: [],
    totalFee: 0,
    breakdown: [],
  };

  // Calculate base fee based on calculation type
  switch (config.calculationType) {
    case 'flat':
      result.baseFee = config.baseAmount || 0;
      result.breakdown.push({
        description: 'Base Permit Fee',
        amount: result.baseFee,
      });
      break;

    case 'per_sqft':
      const sqft = permitData.squareFootage || 0;
      result.baseFee = (config.baseAmount || 0) + sqft * (config.perSqftRate || 0);
      result.breakdown.push({
        description: `Base Fee + ${sqft} sq ft × $${config.perSqftRate}/sq ft`,
        amount: result.baseFee,
      });
      break;

    case 'percentage':
      const value = permitData.estimatedValue || 0;
      result.baseFee =
        (config.baseAmount || 0) + value * ((config.percentageRate || 0) / 100);
      result.breakdown.push({
        description: `Base Fee + ${config.percentageRate}% of $${value.toLocaleString()}`,
        amount: result.baseFee,
      });
      break;

    case 'tiered':
      result.baseFee = this._calculateTieredFee(permitData, config);
      result.breakdown.push({
        description: 'Tiered Fee Calculation',
        amount: result.baseFee,
      });
      break;

    default:
      result.baseFee = config.baseAmount || 0;
  }

  // Apply minimum/maximum
  if (config.minimumFee && result.baseFee < config.minimumFee) {
    result.baseFee = config.minimumFee;
    result.breakdown.push({
      description: 'Minimum fee applied',
      amount: config.minimumFee,
    });
  }
  if (config.maximumFee && result.baseFee > config.maximumFee) {
    result.baseFee = config.maximumFee;
    result.breakdown.push({
      description: 'Maximum fee cap applied',
      amount: config.maximumFee,
    });
  }

  // Calculate additional fees
  for (const addlFee of config.additionalFees || []) {
    // Check if fee applies based on conditions
    if (addlFee.appliesWhen && addlFee.appliesWhen.field) {
      const fieldValue = permitData[addlFee.appliesWhen.field];
      const conditionValue = addlFee.appliesWhen.value;
      const operator = addlFee.appliesWhen.operator;

      let applies = false;
      switch (operator) {
        case 'gt':
          applies = fieldValue > conditionValue;
          break;
        case 'gte':
          applies = fieldValue >= conditionValue;
          break;
        case 'lt':
          applies = fieldValue < conditionValue;
          break;
        case 'lte':
          applies = fieldValue <= conditionValue;
          break;
        case 'eq':
          applies = fieldValue === conditionValue;
          break;
      }

      if (!applies) continue;
    }

    let feeAmount = 0;
    switch (addlFee.calculationType) {
      case 'flat':
        feeAmount = addlFee.amount;
        break;
      case 'percentage_of_base':
        feeAmount = result.baseFee * ((addlFee.percentageOfBase || 0) / 100);
        break;
      case 'per_sqft':
        feeAmount = (permitData.squareFootage || 0) * addlFee.amount;
        break;
      case 'per_unit':
        feeAmount = (permitData.units || 1) * addlFee.amount;
        break;
    }

    result.additionalFees.push({
      name: addlFee.name,
      type: addlFee.type,
      amount: feeAmount,
      isOptional: addlFee.isOptional,
      description: addlFee.description,
    });

    if (!addlFee.isOptional) {
      result.breakdown.push({
        description: addlFee.name,
        amount: feeAmount,
      });
    }
  }

  // Calculate total (excluding optional fees)
  result.totalFee =
    result.baseFee +
    result.additionalFees
      .filter((f) => !f.isOptional)
      .reduce((sum, f) => sum + f.amount, 0);

  return result;
};

/**
 * Calculate tiered fee
 * @private
 */
feeScheduleSchema.methods._calculateTieredFee = function (permitData, config) {
  const value = permitData.estimatedValue || 0;
  let totalFee = config.baseAmount || 0;

  const sortedTiers = (config.tiers || []).sort(
    (a, b) => a.minValue - b.minValue,
  );

  for (const tier of sortedTiers) {
    if (value >= tier.minValue) {
      const maxForTier = tier.maxValue || value;
      const applicableValue = Math.min(value, maxForTier) - tier.minValue;

      if (applicableValue > 0) {
        totalFee += tier.flatAmount || 0;
        totalFee += applicableValue * (tier.rate || 0);
      }
    }
  }

  return totalFee;
};

/**
 * Create a snapshot of this fee schedule for a permit
 * @returns {Object} - Snapshot data to store on permit
 */
feeScheduleSchema.methods.createSnapshot = function () {
  return {
    feeScheduleId: this._id,
    version: this.version,
    effectiveDate: this.effectiveDate,
    feeConfiguration: this.feeConfiguration.toObject(),
    capturedAt: new Date(),
  };
};

const FeeSchedule = mongoose.model('FeeSchedule', feeScheduleSchema);

module.exports = FeeSchedule;
