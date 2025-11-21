const mongoose = require('mongoose');

const timeTrendSchema = new mongoose.Schema(
  {
    from_date: {
      type: Date,
      required: true,
    },
    to_date: {
      type: Date,
      required: true,
    },
    adjustment_factor: {
      type: Number,
      required: true,
      default: 1.0,
      min: 0,
    },
  },
  { _id: false },
);

const revaluationSchema = new mongoose.Schema(
  {
    municipality_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },
    effective_year: {
      type: Number,
      required: true,
      min: 1900,
      max: 2100,
    },

    // Global settings that affect all analysis sheets
    global_settings: {
      // Base year for calculating building age and depreciation
      base_year: {
        type: Number,
        required: true,
        default: function () {
          return new Date().getFullYear();
        },
      },

      // Time trend/market adjustments by date range
      time_trend: {
        type: [timeTrendSchema],
        default: [],
      },

      // Current use settings
      current_use: {
        max_current_use_acreage: {
          type: Number,
          default: 2.0,
          min: 0,
        },
        current_use_rate_multiplier: {
          type: Number,
          default: 1.0,
          min: 0,
        },
      },
    },

    // Status of the revaluation cycle
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'approved'],
      default: 'in_progress',
    },

    // Date range for sales included in analysis
    sales_date_from: {
      type: Date,
    },
    sales_date_to: {
      type: Date,
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
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approved_at: {
      type: Date,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    collection: 'revaluations',
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        return ret;
      },
    },
  },
);

// Compound index to ensure one active revaluation per municipality per year
revaluationSchema.index(
  { municipality_id: 1, effective_year: 1 },
  { unique: true },
);

// Index for finding active revaluations
revaluationSchema.index({ municipality_id: 1, status: 1 });

// Static method to get active revaluation for a municipality
revaluationSchema.statics.getActive = async function (municipalityId) {
  return await this.findOne({
    municipality_id: municipalityId,
    status: 'in_progress',
  })
    .sort({ effective_year: -1 })
    .lean();
};

module.exports = mongoose.model('Revaluation', revaluationSchema);
