const mongoose = require('mongoose');

const propertyExemptionSchema = new mongoose.Schema(
  {
    property_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    municipality_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },
    exemption_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExemptionType',
      required: true,
      index: true,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyOwner',
      index: true,
    },
    owner_name: {
      type: String,
      trim: true,
      index: true,
    },
    card_number: {
      type: Number,
      default: 1,
      min: 1,
      index: true,
    },
    exemption_value: {
      type: Number,
      default: 0,
      min: 0,
    },
    credit_value: {
      type: Number,
      default: 0,
      min: 0,
    },
    start_year: {
      type: Number,
      required: true,
      min: 1900,
      max: 2100,
      index: true,
    },
    end_year: {
      type: Number,
      min: 1900,
      max: 2100,
      validate: {
        validator: function (v) {
          return !v || v >= this.start_year;
        },
        message: 'End year must be greater than or equal to start year',
      },
    },
    qualification_notes: {
      type: String,
      trim: true,
    },
    documentation_provided: {
      type: Boolean,
      default: false,
    },
    uploaded_documents: [
      {
        filename: {
          type: String,
          required: true,
        },
        original_name: {
          type: String,
          required: true,
        },
        file_path: {
          type: String,
          required: true,
        },
        file_size: {
          type: Number,
          required: true,
        },
        mime_type: {
          type: String,
          required: true,
        },
        uploaded_at: {
          type: Date,
          default: Date.now,
        },
        uploaded_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
      },
    ],
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approved_at: {
      type: Date,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
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
propertyExemptionSchema.index({ property_id: 1, card_number: 1, is_active: 1 });
propertyExemptionSchema.index({
  municipality_id: 1,
  start_year: 1,
  is_active: 1,
});
propertyExemptionSchema.index({
  exemption_type_id: 1,
  start_year: 1,
  is_active: 1,
});
propertyExemptionSchema.index({ property_id: 1, start_year: 1, end_year: 1 });

// Pre-save middleware to update timestamps
propertyExemptionSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

// Instance methods
propertyExemptionSchema.methods.isActiveForYear = function (year) {
  if (!this.is_active) return false;
  if (year < this.start_year) return false;
  if (this.end_year && year > this.end_year) return false;
  return true;
};

propertyExemptionSchema.methods.getTotalValue = function () {
  return (this.exemption_value || 0) + (this.credit_value || 0);
};

propertyExemptionSchema.methods.approve = function (userId) {
  this.approved_by = userId;
  this.approved_at = new Date();
  return this.save();
};

// Static methods
propertyExemptionSchema.statics.findByProperty = function (
  propertyId,
  cardNumber = null,
  activeOnly = true,
) {
  const query = { property_id: propertyId };
  if (cardNumber !== null) {
    query.card_number = cardNumber;
  }
  if (activeOnly) {
    query.is_active = true;
  }
  return this.find(query)
    .populate('exemption_type_id')
    .populate('created_by', 'name email')
    .populate('approved_by', 'name email')
    .sort({ start_year: -1, created_at: -1 });
};

propertyExemptionSchema.statics.findByPropertyAndYear = function (
  propertyId,
  year,
  cardNumber = null,
  activeOnly = true,
) {
  const query = {
    property_id: propertyId,
    start_year: { $lte: year },
    $or: [{ end_year: { $gte: year } }, { end_year: null }],
  };
  if (cardNumber !== null) {
    query.card_number = cardNumber;
  }
  if (activeOnly) {
    query.is_active = true;
  }
  return this.find(query)
    .populate('exemption_type_id')
    .sort({ start_year: -1 });
};

propertyExemptionSchema.statics.findByMunicipalityAndYear = function (
  municipalityId,
  year,
  activeOnly = true,
) {
  const query = {
    municipality_id: municipalityId,
    start_year: { $lte: year },
    $or: [{ end_year: { $gte: year } }, { end_year: null }],
  };
  if (activeOnly) {
    query.is_active = true;
  }
  return this.find(query)
    .populate('property_id')
    .populate('exemption_type_id')
    .sort({ property_id: 1, start_year: -1 });
};

propertyExemptionSchema.statics.calculateTotalsByProperty = function (
  propertyId,
  year,
  cardNumber = null,
) {
  const matchQuery = {
    property_id: new mongoose.Types.ObjectId(propertyId),
    start_year: { $lte: year },
    $or: [{ end_year: { $gte: year } }, { end_year: null }],
    is_active: true,
  };

  if (cardNumber !== null) {
    matchQuery.card_number = cardNumber;
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$property_id',
        total_exemption_value: { $sum: '$exemption_value' },
        total_credit_value: { $sum: '$credit_value' },
        exemption_count: { $sum: 1 },
      },
    },
  ]);
};

module.exports = mongoose.model('PropertyExemption', propertyExemptionSchema);
