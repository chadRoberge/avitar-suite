const mongoose = require('mongoose');

const assessingReportSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      enum: [
        'assessing',
        'buildingPermits',
        'taxCollection',
        'townClerk',
        'motorVehicle',
        'utilityBilling',
      ],
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    display_name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    component_name: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          // Ensure component name follows proper naming convention
          return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(v) || /^[a-z]$/.test(v);
        },
        message: 'Component name must be lowercase, kebab-case format',
      },
    },
    category: {
      type: String,
      enum: [
        'property',
        'exemption',
        'assessment',
        'tax',
        'owner',
        'analysis',
        'compliance',
        'other',
      ],
      default: 'other',
      index: true,
    },
    parameters: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        display_name: {
          type: String,
          required: true,
          trim: true,
        },
        type: {
          type: String,
          enum: [
            'text',
            'number',
            'date',
            'select',
            'multiselect',
            'boolean',
            'year',
            'municipality',
          ],
          required: true,
        },
        required: {
          type: Boolean,
          default: false,
        },
        default_value: {
          type: mongoose.Schema.Types.Mixed,
        },
        options: [
          {
            value: {
              type: String,
              required: true,
            },
            label: {
              type: String,
              required: true,
            },
          },
        ],
        validation: {
          min: Number,
          max: Number,
          pattern: String,
          message: String,
        },
      },
    ],
    output_formats: [
      {
        type: String,
        enum: ['pdf', 'excel', 'csv', 'html', 'json'],
        default: 'pdf',
      },
    ],
    permissions: {
      required_roles: [
        {
          type: String,
          enum: ['admin', 'assessor', 'assistant_assessor', 'viewer'],
        },
      ],
      required_permissions: [
        {
          type: String,
        },
      ],
    },
    sort_order: {
      type: Number,
      default: 0,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    is_system_report: {
      type: Boolean,
      default: false,
      index: true,
    },
    execution_settings: {
      timeout_minutes: {
        type: Number,
        default: 10,
        min: 1,
        max: 60,
      },
      max_records: {
        type: Number,
        default: 10000,
        min: 1,
      },
      cache_duration_minutes: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    usage_stats: {
      total_runs: {
        type: Number,
        default: 0,
      },
      last_run_date: {
        type: Date,
      },
      last_run_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      average_execution_time: {
        type: Number,
        default: 0,
      },
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

// Compound indexes for efficient queries
assessingReportSchema.index({
  municipality_id: 1,
  is_active: 1,
  sort_order: 1,
});
assessingReportSchema.index({ municipality_id: 1, category: 1, is_active: 1 });
assessingReportSchema.index({ component_name: 1, municipality_id: 1 });
assessingReportSchema.index({ is_system_report: 1, is_active: 1 });

// Ensure unique component names per municipality
assessingReportSchema.index(
  { municipality_id: 1, component_name: 1 },
  { unique: true },
);

// Pre-save middleware to update timestamps
assessingReportSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

// Instance methods
assessingReportSchema.methods.canUserAccess = function (user) {
  // Avitar staff can access all reports
  if (
    user.global_role === 'avitar_staff' ||
    user.global_role === 'avitar_admin'
  ) {
    return true;
  }

  // Municipal users with any municipal permissions can access reports
  if (
    user.global_role === 'municipal_user' &&
    user.municipal_permissions &&
    user.municipal_permissions.length > 0
  ) {
    return true;
  }

  // For backwards compatibility, check legacy permission structure
  if (
    this.permissions.required_roles &&
    this.permissions.required_roles.length > 0
  ) {
    const hasRole = this.permissions.required_roles.some((role) => {
      return user.municipal_permissions?.some((mp) => mp.role === role);
    });
    if (!hasRole) return false;
  }

  if (
    this.permissions.required_permissions &&
    this.permissions.required_permissions.length > 0
  ) {
    const hasPermission = this.permissions.required_permissions.some(
      (permission) => {
        return user.municipal_permissions?.some((mp) => {
          const modulePerms =
            mp.module_permissions?.get?.(this.module) ||
            mp.module_permissions?.[this.module];
          return modulePerms?.permissions?.includes(permission);
        });
      },
    );
    if (!hasPermission) return false;
  }

  return true;
};

assessingReportSchema.methods.recordExecution = function (
  userId,
  executionTimeMs,
) {
  this.usage_stats.total_runs += 1;
  this.usage_stats.last_run_date = new Date();
  this.usage_stats.last_run_by = userId;

  // Update rolling average execution time
  const currentAvg = this.usage_stats.average_execution_time || 0;
  const totalRuns = this.usage_stats.total_runs;
  this.usage_stats.average_execution_time =
    (currentAvg * (totalRuns - 1) + executionTimeMs) / totalRuns;

  return this.save();
};

// Static methods
assessingReportSchema.statics.findForMunicipality = function (
  reportIds,
  activeOnly = true,
) {
  const query = { _id: { $in: reportIds } };
  if (activeOnly) {
    query.is_active = true;
  }

  const reports = this.find(query)
    .populate('created_by', 'name email')
    .populate('usage_stats.last_run_by', 'name email')
    .sort({ category: 1, sort_order: 1, display_name: 1 });

  return reports;
};

assessingReportSchema.statics.findByModule = function (
  module,
  activeOnly = true,
) {
  const query = { module: module };
  if (activeOnly) {
    query.is_active = true;
  }

  const reports = this.find(query)
    .populate('created_by', 'name email')
    .populate('usage_stats.last_run_by', 'name email')
    .sort({ category: 1, sort_order: 1, display_name: 1 });

  return reports;
};

assessingReportSchema.statics.findByCategoryForMunicipality = function (
  reportIds,
  category,
  activeOnly = true,
) {
  const query = {
    _id: { $in: reportIds },
    category: category,
  };
  if (activeOnly) {
    query.is_active = true;
  }

  return this.find(query)
    .populate('created_by', 'name email')
    .sort({ sort_order: 1, display_name: 1 });
};

assessingReportSchema.statics.findByComponentName = function (componentName) {
  return this.findOne({
    component_name: componentName,
    is_active: true,
  }).populate('created_by', 'name email');
};

assessingReportSchema.statics.getSystemReports = function (activeOnly = true) {
  const query = { is_system_report: true };
  if (activeOnly) {
    query.is_active = true;
  }

  return this.find(query).sort({ category: 1, sort_order: 1, display_name: 1 });
};

module.exports = mongoose.model('AssessingReport', assessingReportSchema);
