const mongoose = require('mongoose');

const propertyOwnerSchema = new mongoose.Schema(
  {
    municipality_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },

    property_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyTreeNode',
      required: true,
      index: true,
    },

    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Owner',
      required: true,
      index: true,
    },

    // Ownership details specific to this property-owner relationship
    ownership_percentage: {
      type: Number,
      min: [0, 'Ownership percentage cannot be negative'],
      max: [100, 'Ownership percentage cannot exceed 100%'],
      default: 100,
    },

    ownership_type: {
      type: String,
      enum: [
        'fee_simple',
        'joint_tenancy',
        'tenancy_in_common',
        'life_estate',
        'trust',
        'leasehold',
        'other',
      ],
      default: 'fee_simple',
    },

    // Primary owner flag - one owner per property should be marked as primary
    is_primary: {
      type: Boolean,
      default: false,
    },

    // Tax billing preferences for this specific property
    receives_tax_bills: {
      type: Boolean,
      default: true,
    },

    receives_notices: {
      type: Boolean,
      default: true,
    },

    // Property-specific contact overrides (if different from owner's default)
    property_mailing_address: {
      use_override: {
        type: Boolean,
        default: false,
      },
      street: String,
      city: String,
      state: String,
      zip_code: String,
      country: { type: String, default: 'US' },
    },

    // Important dates for this ownership relationship
    ownership_start_date: {
      type: Date,
      default: Date.now,
    },
    ownership_end_date: {
      type: Date,
    },

    // Legal information specific to this property
    deed_book: String,
    deed_page: String,
    deed_date: Date,
    deed_type: {
      type: String,
      enum: [
        'warranty',
        'quitclaim',
        'special_warranty',
        'executor',
        'administrator',
        'other',
      ],
    },

    // Property-specific exemptions (overrides or additions to owner's general exemptions)
    property_exemptions: [
      {
        exemption_type: {
          type: String,
          enum: [
            'homestead',
            'veteran',
            'elderly',
            'disabled',
            'charitable',
            'religious',
            'municipal',
            'other',
          ],
        },
        exemption_code: String,
        exemption_amount: Number,
        exemption_percentage: Number,
        start_date: Date,
        end_date: Date,
        documentation_required: Boolean,
        notes: String,
      },
    ],

    // Status
    is_active: {
      type: Boolean,
      default: true,
    },

    // Notes specific to this property-owner relationship
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },

    // System fields
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Compound indexes for efficient queries
propertyOwnerSchema.index({ property_id: 1, is_active: 1 });
propertyOwnerSchema.index({ owner_id: 1, is_active: 1 });
propertyOwnerSchema.index({ municipality_id: 1, property_id: 1 });
propertyOwnerSchema.index({ municipality_id: 1, owner_id: 1 });

// Ensure only one primary owner per property
propertyOwnerSchema.index(
  { property_id: 1, is_primary: 1 },
  {
    unique: true,
    partialFilterExpression: { is_primary: true, is_active: true },
  },
);

// Virtual for effective mailing address
propertyOwnerSchema.virtual('effective_mailing_address').get(function () {
  if (
    this.property_mailing_address.use_override &&
    this.property_mailing_address.street
  ) {
    return this.property_mailing_address;
  }
  // Would need to populate owner to get their address
  return null;
});

// Pre-save middleware to ensure ownership percentages don't exceed 100% for a property
propertyOwnerSchema.pre('save', async function (next) {
  if (this.isModified('ownership_percentage') || this.isNew) {
    const totalPercentage = await this.constructor.aggregate([
      {
        $match: {
          property_id: this.property_id,
          is_active: true,
          _id: { $ne: this._id }, // Exclude current document
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$ownership_percentage' },
        },
      },
    ]);

    const currentTotal = totalPercentage[0]?.total || 0;
    const newTotal = currentTotal + this.ownership_percentage;

    if (newTotal > 100) {
      const error = new Error(
        `Total ownership percentage would exceed 100%. Current total: ${currentTotal}%, attempting to add: ${this.ownership_percentage}%`,
      );
      return next(error);
    }
  }
  next();
});

// Static method to get all owners for a property
propertyOwnerSchema.statics.getPropertyOwners = function (
  propertyId,
  options = {},
) {
  const query = { property_id: propertyId, is_active: true };

  let queryBuilder = this.find(query);

  if (options.populate) {
    queryBuilder = queryBuilder.populate('owner_id');
  }

  return queryBuilder.sort({ is_primary: -1, ownership_percentage: -1 });
};

// Static method to get all properties for an owner
propertyOwnerSchema.statics.getOwnerProperties = function (
  ownerId,
  options = {},
) {
  const query = { owner_id: ownerId, is_active: true };

  let queryBuilder = this.find(query);

  if (options.populate) {
    queryBuilder = queryBuilder.populate('property_id');
  }

  return queryBuilder.sort({ ownership_start_date: -1 });
};

// Static method to get primary owner for a property
propertyOwnerSchema.statics.getPrimaryOwner = function (
  propertyId,
  populate = false,
) {
  let query = this.findOne({
    property_id: propertyId,
    is_primary: true,
    is_active: true,
  });

  if (populate) {
    query = query.populate('owner_id');
  }

  return query;
};

// Method to check if ownership percentages are valid for the property
propertyOwnerSchema.statics.validateOwnershipPercentages = async function (
  propertyId,
) {
  const result = await this.aggregate([
    {
      $match: {
        property_id: propertyId,
        is_active: true,
      },
    },
    {
      $group: {
        _id: null,
        totalPercentage: { $sum: '$ownership_percentage' },
        ownerCount: { $sum: 1 },
      },
    },
  ]);

  const data = result[0] || { totalPercentage: 0, ownerCount: 0 };

  return {
    totalPercentage: data.totalPercentage,
    ownerCount: data.ownerCount,
    isValid: data.totalPercentage <= 100,
    hasGap: data.totalPercentage < 100,
  };
};

// Instance method to set as primary owner (unsets other primary owners for the property)
propertyOwnerSchema.methods.setPrimary = async function () {
  // First, unset any existing primary owners for this property
  await this.constructor.updateMany(
    {
      property_id: this.property_id,
      is_active: true,
      _id: { $ne: this._id },
    },
    { is_primary: false },
  );

  // Set this as primary
  this.is_primary = true;
  return this.save();
};

// Post-save hook to sync PropertyTreeNode owner cache
propertyOwnerSchema.post('save', async function (doc) {
  try {
    const PropertyTreeNode = require('./PropertyTreeNode');
    await PropertyTreeNode.syncOwnerCache(doc.property_id);
  } catch (error) {
    console.error('Error syncing owner cache after PropertyOwner save:', error);
  }
});

// Post-remove hook to sync PropertyTreeNode owner cache
propertyOwnerSchema.post(
  'deleteOne',
  { document: true, query: false },
  async function (doc) {
    try {
      const PropertyTreeNode = require('./PropertyTreeNode');
      await PropertyTreeNode.syncOwnerCache(doc.property_id);
    } catch (error) {
      console.error(
        'Error syncing owner cache after PropertyOwner delete:',
        error,
      );
    }
  },
);

module.exports = mongoose.model('PropertyOwner', propertyOwnerSchema);
