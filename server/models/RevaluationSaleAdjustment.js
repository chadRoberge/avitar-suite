const mongoose = require('mongoose');

const revaluationSaleAdjustmentSchema = new mongoose.Schema(
  {
    revaluation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Revaluation',
      required: true,
      index: true,
    },
    analysis_sheet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RevaluationAnalysisSheet',
      required: true,
      index: true,
    },
    sale_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesHistory',
      required: true,
      index: true,
    },

    // Revaluation-specific adjustments (null = use original/calculated value)
    adjustments: {
      // Time adjustment override (overrides global time trend)
      time_adjustment_factor_override: {
        type: Number,
        min: 0,
      },
      adjusted_sale_price: {
        type: Number,
        min: 0,
      },

      // Factor overrides (for this sheet only)
      site_factor_override: {
        type: Number,
        min: 0,
      },
      driveway_factor_override: {
        type: Number,
        min: 0,
      },
      road_factor_override: {
        type: Number,
        min: 0,
      },
      neighborhood_factor_override: {
        type: Number,
        min: 0,
      },
      grade_factor_override: {
        type: Number,
        min: 0,
      },
      condition_factor_override: {
        type: Number,
        min: 0,
      },

      // Dimension overrides
      acreage_override: {
        type: Number,
        min: 0,
      },
      building_sf_override: {
        type: Number,
        min: 0,
      },

      // Age override (overrides calculated age from base_year)
      age_override: {
        type: Number,
        min: 0,
      },
    },

    // Inclusion/exclusion
    is_included: {
      type: Boolean,
      default: true,
    },
    exclusion_reason: {
      type: String,
      trim: true,
      default: '',
    },

    notes: {
      type: String,
      trim: true,
      default: '',
    },

    // Audit fields
    added_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    added_at: {
      type: Date,
      default: Date.now,
    },
    modified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    modified_at: {
      type: Date,
    },
  },
  {
    collection: 'revaluation_sale_adjustments',
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        return ret;
      },
    },
  },
);

// Compound index to ensure a sale can only be added once per sheet
revaluationSaleAdjustmentSchema.index(
  { analysis_sheet_id: 1, sale_id: 1 },
  { unique: true },
);

// Index for finding all sheets using a particular sale
revaluationSaleAdjustmentSchema.index({ revaluation_id: 1, sale_id: 1 });

// Index for finding all sales for a sheet
revaluationSaleAdjustmentSchema.index({ analysis_sheet_id: 1, is_included: 1 });

// Static method to get all sales for a sheet
revaluationSaleAdjustmentSchema.statics.getSalesForSheet = async function (
  sheetId,
  includedOnly = true,
) {
  const filter = { analysis_sheet_id: sheetId };
  if (includedOnly) {
    filter.is_included = true;
  }

  return await this.find(filter)
    .populate({
      path: 'sale_id',
      populate: {
        path: 'property_id',
        select: 'pid_raw pid_formatted location.address',
      },
      strictPopulate: false,
    })
    .setOptions({ strictPopulate: false })
    .sort({ added_at: 1 })
    .lean();
};

// Static method to check which sheets use a sale
revaluationSaleAdjustmentSchema.statics.getSheetsUsingSale = async function (
  revaluationId,
  saleId,
) {
  return await this.find({
    revaluation_id: revaluationId,
    sale_id: saleId,
  })
    .populate('analysis_sheet_id')
    .lean();
};

// Static method to add multiple sales to a sheet (bulk operation)
revaluationSaleAdjustmentSchema.statics.addSalesToSheet = async function (
  revaluationId,
  sheetId,
  saleIds,
  addedBy,
) {
  const adjustments = saleIds.map((saleId) => ({
    revaluation_id: revaluationId,
    analysis_sheet_id: sheetId,
    sale_id: saleId,
    added_by: addedBy,
    added_at: new Date(),
  }));

  // Use insertMany with ordered: false to continue on duplicate key errors
  try {
    const result = await this.insertMany(adjustments, { ordered: false });
    return result;
  } catch (error) {
    // If some sales were already added, this will throw but partial inserts succeed
    if (error.code === 11000) {
      // Duplicate key error - some sales already exist
      return {
        inserted: error.insertedDocs || [],
        duplicates: saleIds.length - (error.insertedDocs?.length || 0),
      };
    }
    throw error;
  }
};

module.exports = mongoose.model(
  'RevaluationSaleAdjustment',
  revaluationSaleAdjustmentSchema,
);
