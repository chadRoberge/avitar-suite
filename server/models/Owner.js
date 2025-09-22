const mongoose = require('mongoose');

const ownerSchema = new mongoose.Schema(
  {
    municipality_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },

    // Primary owner information
    owner_type: {
      type: String,
      enum: [
        'individual',
        'business',
        'trust',
        'estate',
        'government',
        'non_profit',
      ],
      required: true,
      default: 'individual',
    },

    // Individual/Personal Information
    first_name: {
      type: String,
      trim: true,
      maxlength: [100, 'First name cannot exceed 100 characters'],
    },
    last_name: {
      type: String,
      trim: true,
      maxlength: [100, 'Last name cannot exceed 100 characters'],
    },
    middle_initial: {
      type: String,
      trim: true,
      maxlength: [5, 'Middle initial cannot exceed 5 characters'],
    },

    // Business/Organization Information
    business_name: {
      type: String,
      trim: true,
      maxlength: [200, 'Business name cannot exceed 200 characters'],
    },
    business_type: {
      type: String,
      enum: [
        'llc',
        'corp',
        'partnership',
        'sole_proprietorship',
        'trust',
        'estate',
        'government',
        'non_profit',
        'other',
      ],
    },

    // Contact Information
    phone: {
      type: String,
      trim: true,
      match: [/^\+?1?\d{9,15}$/, 'Please enter a valid phone number'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address',
      ],
    },

    // Primary Address (Property owner's main address)
    address: {
      street: {
        type: String,
        trim: true,
        maxlength: [200, 'Street address cannot exceed 200 characters'],
      },
      city: {
        type: String,
        trim: true,
        maxlength: [100, 'City cannot exceed 100 characters'],
      },
      state: {
        type: String,
        trim: true,
        maxlength: [50, 'State cannot exceed 50 characters'],
      },
      zip_code: {
        type: String,
        trim: true,
        match: [/^\d{5}(-\d{4})?$/, 'Please enter a valid ZIP code'],
      },
      country: {
        type: String,
        trim: true,
        default: 'US',
        maxlength: [50, 'Country cannot exceed 50 characters'],
      },
    },

    // Mailing Address (if different from primary address)
    mailing_address: {
      is_different: {
        type: Boolean,
        default: false,
      },
      street: {
        type: String,
        trim: true,
        maxlength: [200, 'Street address cannot exceed 200 characters'],
      },
      city: {
        type: String,
        trim: true,
        maxlength: [100, 'City cannot exceed 100 characters'],
      },
      state: {
        type: String,
        trim: true,
        maxlength: [50, 'State cannot exceed 50 characters'],
      },
      zip_code: {
        type: String,
        trim: true,
        match: [/^\d{5}(-\d{4})?$/, 'Please enter a valid ZIP code'],
      },
      country: {
        type: String,
        trim: true,
        default: 'US',
        maxlength: [50, 'Country cannot exceed 50 characters'],
      },
    },

    // Ownership Details
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

    // Tax and Billing Information
    bill_to_owner: {
      type: Boolean,
      default: true,
    },

    // Additional billing recipients (copy bills, notices, etc.)
    additional_billing: [
      {
        recipient_type: {
          type: String,
          enum: [
            'owner',
            'agent',
            'attorney',
            'property_manager',
            'accountant',
            'other',
          ],
          required: true,
        },
        first_name: String,
        last_name: String,
        business_name: String,
        address: {
          street: String,
          city: String,
          state: String,
          zip_code: String,
          country: { type: String, default: 'US' },
        },
        phone: String,
        email: String,
        copy_types: [
          {
            type: String,
            enum: ['tax_bills', 'notices', 'assessments', 'all'],
          },
        ],
        notes: String,
      },
    ],

    // Important Dates
    ownership_start_date: {
      type: Date,
    },
    ownership_end_date: {
      type: Date,
    },

    // Exemptions and Special Status
    exemptions: [
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

    // Legal and Administrative
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

    // Status and Flags
    is_active: {
      type: Boolean,
      default: true,
    },

    // Notes and special instructions
    notes: {
      type: String,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
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

// Indexes for performance
ownerSchema.index({ municipality_id: 1, is_active: 1 });
ownerSchema.index({ last_name: 1, first_name: 1 });
ownerSchema.index({ business_name: 1 });
ownerSchema.index({ 'address.zip_code': 1 });
ownerSchema.index({ email: 1 });

// Virtual for full name
ownerSchema.virtual('full_name').get(function () {
  if (this.owner_type === 'individual') {
    const parts = [this.first_name, this.middle_initial, this.last_name].filter(
      Boolean,
    );
    return parts.join(' ').trim();
  } else {
    return this.business_name || '';
  }
});

// Virtual for display name (for dropdowns, etc.)
ownerSchema.virtual('display_name').get(function () {
  if (this.owner_type === 'individual') {
    return this.full_name;
  } else {
    const businessName = this.business_name || '';
    const contactName = this.full_name;
    return contactName ? `${businessName} (${contactName})` : businessName;
  }
});

// Virtual for formatted address
ownerSchema.virtual('formatted_address').get(function () {
  const addr = this.address;
  if (!addr || !addr.street) return '';

  const parts = [
    addr.street,
    addr.city,
    [addr.state, addr.zip_code].filter(Boolean).join(' '),
  ].filter(Boolean);

  return parts.join(', ');
});

// Virtual for formatted mailing address
ownerSchema.virtual('formatted_mailing_address').get(function () {
  if (!this.mailing_address.is_different) {
    return this.formatted_address;
  }

  const addr = this.mailing_address;
  if (!addr || !addr.street) return '';

  const parts = [
    addr.street,
    addr.city,
    [addr.state, addr.zip_code].filter(Boolean).join(' '),
  ].filter(Boolean);

  return parts.join(', ');
});

// Method to get effective billing address
ownerSchema.methods.getBillingAddress = function () {
  if (this.mailing_address.is_different && this.mailing_address.street) {
    return this.mailing_address;
  }
  return this.address;
};

// Method to check if owner has specific exemption
ownerSchema.methods.hasExemption = function (exemptionType) {
  const now = new Date();
  return this.exemptions.some((exemption) => {
    if (exemption.exemption_type !== exemptionType) return false;
    if (exemption.start_date && exemption.start_date > now) return false;
    if (exemption.end_date && exemption.end_date < now) return false;
    return true;
  });
};

// Method to get total exemption amount
ownerSchema.methods.getTotalExemptionAmount = function () {
  const now = new Date();
  return this.exemptions
    .filter((exemption) => {
      if (exemption.start_date && exemption.start_date > now) return false;
      if (exemption.end_date && exemption.end_date < now) return false;
      return true;
    })
    .reduce((total, exemption) => total + (exemption.exemption_amount || 0), 0);
};

// Static method to find owners by property
ownerSchema.statics.findByProperty = function (propertyId) {
  return this.find({ property_id: propertyId, is_active: true });
};

// Static method to search owners
ownerSchema.statics.searchOwners = function (
  municipalityId,
  searchTerm,
  options = {},
) {
  const query = { municipality_id: municipalityId, is_active: true };

  if (searchTerm) {
    const searchRegex = new RegExp(searchTerm, 'i');
    query.$or = [
      { first_name: searchRegex },
      { last_name: searchRegex },
      { business_name: searchRegex },
      { email: searchRegex },
    ];
  }

  const limit = options.limit || 50;
  const skip = options.skip || 0;

  return this.find(query)
    .limit(limit)
    .skip(skip)
    .sort({ last_name: 1, first_name: 1, business_name: 1 });
};

// Post-save hook to sync PropertyTreeNode owner cache when owner info changes
ownerSchema.post('save', async function (doc) {
  try {
    const PropertyTreeNode = require('./PropertyTreeNode');
    await PropertyTreeNode.syncOwnerCacheForOwner(doc._id);
  } catch (error) {
    console.error('Error syncing owner cache after Owner save:', error);
  }
});

// Post-remove hook to sync PropertyTreeNode owner cache when owner is deleted
ownerSchema.post(
  'deleteOne',
  { document: true, query: false },
  async function (doc) {
    try {
      const PropertyTreeNode = require('./PropertyTreeNode');
      await PropertyTreeNode.syncOwnerCacheForOwner(doc._id);
    } catch (error) {
      console.error('Error syncing owner cache after Owner delete:', error);
    }
  },
);

module.exports = mongoose.model('Owner', ownerSchema);
