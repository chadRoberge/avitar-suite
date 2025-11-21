const mongoose = require('mongoose');

const revaluationAnalysisSheetSchema = new mongoose.Schema(
  {
    revaluation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Revaluation',
      required: true,
      index: true,
    },

    // Sheet identification
    sheet_name: {
      type: String,
      required: true,
      trim: true,
    },
    sheet_type: {
      type: String,
      required: true,
      enum: [
        'excess_acreage',
        'vacant_land',
        'developed_land',
        'building_rate',
        'view_base_rate',
        'waterfront_base_rate',
        'amenity_rate',
      ],
      index: true,
    },

    // Sheet-specific settings (flexible object to support different sheet types)
    sheet_settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Calculated results (updated when sheet is recalculated)
    results: {
      average_rate: {
        type: Number,
        default: 0,
      },
      median_rate: {
        type: Number,
        default: 0,
      },
      approved_rate: {
        type: Number,
      },
      total_sales_count: {
        type: Number,
        default: 0,
      },
      last_calculated_at: {
        type: Date,
      },
      calculation_version: {
        type: Number,
        default: 1,
      },
    },

    // Display order in dropdowns
    display_order: {
      type: Number,
      default: 0,
    },

    // Sheet status
    status: {
      type: String,
      enum: ['draft', 'calculated', 'approved'],
      default: 'draft',
    },

    // Audit fields
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    collection: 'revaluation_analysis_sheets',
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        return ret;
      },
    },
  },
);

// Index for efficient lookup of sheets by revaluation
revaluationAnalysisSheetSchema.index({ revaluation_id: 1, display_order: 1 });

// Index for finding sheets by type
revaluationAnalysisSheetSchema.index({ revaluation_id: 1, sheet_type: 1 });

// Static method to get all sheets for a revaluation
revaluationAnalysisSheetSchema.statics.getSheetsForRevaluation = async function (
  revaluationId,
) {
  return await this.find({ revaluation_id: revaluationId })
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
};

// Method to increment calculation version
revaluationAnalysisSheetSchema.methods.incrementCalculationVersion =
  function () {
    this.results.calculation_version =
      (this.results.calculation_version || 0) + 1;
    this.results.last_calculated_at = new Date();
  };

module.exports = mongoose.model(
  'RevaluationAnalysisSheet',
  revaluationAnalysisSheetSchema,
);
