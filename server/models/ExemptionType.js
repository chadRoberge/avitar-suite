const mongoose = require('mongoose');

const exemptionTypeSchema = new mongoose.Schema({
  municipality_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
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
    required: true,
    trim: true,
  },
  category: {
    type: String,
    enum: [
      'veteran',
      'elderly',
      'blind',
      'disabled',
      'charitable',
      'institutional',
      'solar',
      'school_dining',
      'other',
    ],
    required: true,
    index: true,
  },
  subcategory: {
    type: String,
    trim: true, // For things like 'elderly_65_74', 'veteran_standard', etc.
  },
  effective_year: {
    type: Number,
    required: true,
    index: true,
  },
  exemption_type: {
    type: String,
    enum: ['exemption', 'credit'],
    required: true,
    index: true,
  },
  calculation_method: {
    type: String,
    enum: [
      'fixed_amount',
      'percentage_of_assessment',
      'user_entered_amount',
      'user_entered_percentage',
    ],
    default: 'fixed_amount',
    index: true,
  },
  is_multiple_allowed: {
    type: Boolean,
    default: false, // For veteran exemptions that can be stacked
    index: true,
  },
  default_exemption_value: {
    type: Number,
    default: 0,
    min: 0,
  },
  default_credit_value: {
    type: Number,
    default: 0,
    min: 0,
  },
  default_percentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100, // Percentage value (0-100)
  },
  min_exemption_amount: {
    type: Number,
    min: 0, // Minimum amount for user-entered exemptions
  },
  max_exemption_amount: {
    type: Number,
    min: 0, // Maximum amount for user-entered exemptions
  },
  min_percentage: {
    type: Number,
    min: 0,
    max: 100, // Minimum percentage for user-entered percentages
  },
  max_percentage: {
    type: Number,
    min: 0,
    max: 100, // Maximum percentage for user-entered percentages
  },
  qualification_criteria: {
    type: String,
    trim: true,
  },
  requires_documentation: {
    type: Boolean,
    default: true,
  },
  required_documents: [{
    type: String,
    trim: true,
  }, ],
  age_requirements: {
    min_age: {
      type: Number,
      min: 0,
    },
    max_age: {
      type: Number,
      min: 0,
    },
  },
  income_requirements: {
    has_income_limit: {
      type: Boolean,
      default: false,
    },
    single_income_limit: {
      type: Number,
      min: 0,
    },
    married_income_limit: {
      type: Number,
      min: 0,
    },
  },
  asset_requirements: {
    has_asset_limit: {
      type: Boolean,
      default: false,
    },
    single_asset_limit: {
      type: Number,
      min: 0,
    },
    married_asset_limit: {
      type: Number,
      min: 0,
    },
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
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
}, );

// Compound indexes for efficient queries
exemptionTypeSchema.index({ municipality_id: 1, is_active: 1 });
exemptionTypeSchema.index({ municipality_id: 1, category: 1, is_active: 1 });
exemptionTypeSchema.index({
  municipality_id: 1,
  exemption_type: 1,
  is_active: 1,
});
exemptionTypeSchema.index({
  municipality_id: 1,
  sort_order: 1,
  display_name: 1,
});
// Unique index to ensure unique names per municipality per year
exemptionTypeSchema.index(
  { municipality_id: 1, name: 1, effective_year: 1 },
  { unique: true },
);
exemptionTypeSchema.index({ municipality_id: 1, effective_year: 1 });

// Pre-save middleware to update timestamps
exemptionTypeSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Instance methods
exemptionTypeSchema.methods.canBeAppliedMultiple = function() {
  return this.is_multiple_allowed;
};

exemptionTypeSchema.methods.calculateExemptionValue = function(
  assessmentValue,
  userEnteredValue = null,
) {
  switch (this.calculation_method) {
    case 'fixed_amount':
      return this.exemption_type === 'exemption' ?
        this.default_exemption_value :
        this.default_credit_value;

    case 'percentage_of_assessment':
      if (!assessmentValue) return 0;
      return Math.round((assessmentValue * this.default_percentage) / 100);

    case 'user_entered_amount':
      if (userEnteredValue === null) return 0;
      // Apply min/max constraints if set
      let amount = userEnteredValue;
      if (
        this.min_exemption_amount !== undefined &&
        amount < this.min_exemption_amount
      ) {
        amount = this.min_exemption_amount;
      }
      if (
        this.max_exemption_amount !== undefined &&
        amount > this.max_exemption_amount
      ) {
        amount = this.max_exemption_amount;
      }
      return amount;

    case 'user_entered_percentage':
      if (userEnteredValue === null || !assessmentValue) return 0;
      // Apply min/max percentage constraints if set
      let percentage = userEnteredValue;
      if (
        this.min_percentage !== undefined &&
        percentage < this.min_percentage
      ) {
        percentage = this.min_percentage;
      }
      if (
        this.max_percentage !== undefined &&
        percentage > this.max_percentage
      ) {
        percentage = this.max_percentage;
      }
      return Math.round((assessmentValue * percentage) / 100);

    default:
      return 0;
  }
};

exemptionTypeSchema.methods.isUserInputRequired = function() {
  return (
    this.calculation_method === 'user_entered_amount' ||
    this.calculation_method === 'user_entered_percentage'
  );
};

exemptionTypeSchema.methods.getInputType = function() {
  switch (this.calculation_method) {
    case 'user_entered_amount':
      return 'amount';
    case 'user_entered_percentage':
      return 'percentage';
    default:
      return 'none';
  }
};

// Static methods
exemptionTypeSchema.statics.findByMunicipality = function(
  municipalityId,
  activeOnly = true,
) {
  const query = { municipality_id: municipalityId };
  if (activeOnly) {
    query.is_active = true;
  }
  return this.find(query).sort({ category: 1, name: 1 });
};

exemptionTypeSchema.statics.findByCategory = function(
  municipalityId,
  category,
  activeOnly = true,
) {
  const query = {
    municipality_id: municipalityId,
    category: category,
  };
  if (activeOnly) {
    query.is_active = true;
  }
  return this.find(query).sort({ sort_order: 1, display_name: 1 });
};

exemptionTypeSchema.statics.findAvailableForSelection = function(
  municipalityId,
  activeOnly = true,
) {
  const query = { municipality_id: municipalityId };
  if (activeOnly) {
    query.is_active = true;
  }
  return this.find(query)
    .sort({ exemption_type: 1, category: 1, sort_order: 1, display_name: 1 })
    .select(
      '_id name display_name description category subcategory exemption_type calculation_method qualification_criteria requires_documentation required_documents age_requirements income_requirements asset_requirements default_exemption_value default_credit_value default_percentage min_exemption_amount max_exemption_amount min_percentage max_percentage',
    );
};

exemptionTypeSchema.statics.findByExemptionType = function(
  municipalityId,
  exemptionType,
  activeOnly = true,
) {
  const query = {
    municipality_id: municipalityId,
    exemption_type: exemptionType,
  };
  if (activeOnly) {
    query.is_active = true;
  }
  return this.find(query).sort({ category: 1, sort_order: 1, display_name: 1 });
};

module.exports = mongoose.model('ExemptionType', exemptionTypeSchema);
