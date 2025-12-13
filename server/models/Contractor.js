const mongoose = require('mongoose');

const contractorSchema = new mongoose.Schema(
  {
    // Company Information
    company_name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: 100,
      index: true,
    },

    // Licensing Information
    license_number: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    license_state: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 2,
    },
    license_expiration: {
      type: Date,
      index: true,
    },
    license_type: {
      type: String,
      enum: [
        'general_contractor',
        'electrical',
        'plumbing',
        'mechanical',
        'roofing',
        'foundation',
        'framing',
        'masonry',
        'landscaping',
        'demolition',
        'specialty',
        'other',
      ],
    },

    // Business Contact Information
    business_info: {
      address: {
        street: {
          type: String,
          trim: true,
        },
        city: {
          type: String,
          trim: true,
        },
        state: {
          type: String,
          trim: true,
          uppercase: true,
          maxlength: 2,
        },
        zip: {
          type: String,
          trim: true,
        },
      },
      phone: {
        type: String,
        required: false,
        trim: true,
      },
      email: {
        type: String,
        required: false,
        lowercase: true,
        trim: true,
      },
      website: {
        type: String,
        trim: true,
      },
    },

    // Specialties/Services Offered
    specialties: [
      {
        type: String,
        enum: [
          'new_construction',
          'additions',
          'renovations',
          'electrical',
          'plumbing',
          'mechanical',
          'hvac',
          'roofing',
          'siding',
          'windows_doors',
          'foundation',
          'framing',
          'masonry',
          'concrete',
          'landscaping',
          'demolition',
          'commercial',
          'residential',
          'industrial',
          'other',
        ],
      },
    ],

    // Insurance Information
    insurance_info: {
      provider: {
        type: String,
        trim: true,
      },
      policy_number: {
        type: String,
        trim: true,
      },
      expiration: {
        type: Date,
        index: true,
      },
      general_liability_amount: {
        type: Number,
        min: 0,
      },
      workers_comp_amount: {
        type: Number,
        min: 0,
      },
    },

    // Team Members
    owner_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    members: [
      {
        user_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        role: {
          type: String,
          enum: ['owner', 'admin', 'employee', 'office_staff'],
          default: 'employee',
        },
        permissions: [
          {
            type: String,
            enum: [
              'manage_team',
              'submit_permits',
              'edit_permits',
              'view_all_permits',
              'view_own_permits',
              'manage_company_info',
            ],
          },
        ],
        title: {
          type: String,
          trim: true,
        },
        added_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        added_date: {
          type: Date,
          default: Date.now,
        },
        is_active: {
          type: Boolean,
          default: true,
        },
      },
    ],

    // Municipality Approvals/Registrations
    municipality_approvals: [
      {
        municipality_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Municipality',
          required: true,
        },
        municipality_name: String, // Denormalized
        status: {
          type: String,
          enum: ['pending', 'approved', 'denied', 'suspended', 'revoked'],
          default: 'pending',
        },
        approved_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        approved_date: Date,
        expiration_date: Date,
        notes: String,
        registration_number: String, // Municipality-specific registration
        restrictions: [String], // e.g., "residential_only", "max_value_50000"
      },
    ],

    // Status and Activity
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    is_verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    verified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verified_at: Date,

    // Blacklist Status
    is_blacklisted: {
      type: Boolean,
      default: false,
      index: true,
    },
    blacklisted_reason: {
      type: String,
      trim: true,
    },
    blacklisted_at: Date,
    blacklisted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    blacklist_notes: String,

    // Additional Information
    years_in_business: {
      type: Number,
      min: 0,
    },
    employee_count: {
      type: Number,
      min: 0,
    },
    bonded: {
      type: Boolean,
      default: false,
    },

    // Subscription and Features
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'basic', 'pro', 'enterprise'],
        default: 'free',
      },
      status: {
        type: String,
        enum: [
          'active',
          'trialing',
          'past_due',
          'canceled',
          'paused',
          'incomplete',
          'incomplete_expired',
          'inactive',
        ],
        default: 'inactive',
      },
      trial_ends_at: Date,
      current_period_start: Date,
      current_period_end: Date,
      paused_at: Date,
      canceled_at: Date,
      stripe_customer_id: String,
      stripe_subscription_id: String,
      stripe_product_id: String,
      stripe_price_id: String,
      // Features from Stripe Product Features API
      features: {
        type: [String],
        default: [],
      },
      features_last_synced: Date,
      // Legacy max team members (can be deprecated once migrated to features array)
      max_team_members: { type: Number, default: 1 }, // Owner only for free
    },

    // Payment Methods (for paid subscriptions with stored card feature)
    payment_methods: [
      {
        stripe_payment_method_id: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ['card', 'bank_account'],
          default: 'card',
        },
        is_default: {
          type: Boolean,
          default: false,
        },
        card_brand: String, // visa, mastercard, amex, etc.
        card_last4: String,
        card_exp_month: Number,
        card_exp_year: Number,
        billing_name: String,
        billing_address: {
          street: String,
          city: String,
          state: String,
          zip: String,
          country: String,
        },
        // Who can use this card for permit payments
        authorized_users: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
        ],
        added_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        added_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Ratings and Reviews (future feature)
    average_rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    total_reviews: {
      type: Number,
      default: 0,
    },

    // Notes and History
    internal_notes: [
      {
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        author_name: String,
        note: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Audit Trail
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
    timestamps: true,
    collection: 'contractors',
  },
);

// Indexes
contractorSchema.index({ company_name: 'text' });
contractorSchema.index(
  { license_number: 1, license_state: 1 },
  { unique: true, sparse: true }, // sparse allows null/undefined values
);
contractorSchema.index({ 'municipality_approvals.municipality_id': 1 });
contractorSchema.index({ owner_user_id: 1 });
contractorSchema.index({ 'members.user_id': 1 });
contractorSchema.index({ is_active: 1, is_verified: 1 });

// Pre-save validation: Require license info for electrical, plumbing, mechanical
contractorSchema.pre('save', function (next) {
  const licensedTypes = ['electrical', 'plumbing', 'mechanical'];

  if (licensedTypes.includes(this.license_type)) {
    if (!this.license_number) {
      return next(
        new Error(
          `License number is required for ${this.license_type} contractors`,
        ),
      );
    }
    if (!this.license_expiration) {
      return next(
        new Error(
          `License expiration is required for ${this.license_type} contractors`,
        ),
      );
    }
  }

  next();
});

// Virtual for license status
contractorSchema.virtual('isLicenseExpired').get(function () {
  return this.license_expiration && this.license_expiration < new Date();
});

// Virtual for insurance status
contractorSchema.virtual('isInsuranceExpired').get(function () {
  return (
    this.insurance_info?.expiration &&
    this.insurance_info.expiration < new Date()
  );
});

// Virtual for days until license expiration
contractorSchema.virtual('daysUntilLicenseExpiration').get(function () {
  if (!this.license_expiration) return null;
  const now = new Date();
  const days = Math.floor(
    (this.license_expiration - now) / (1000 * 60 * 60 * 24),
  );
  return days;
});

// Ensure virtuals are included in JSON
contractorSchema.set('toJSON', { virtuals: true });
contractorSchema.set('toObject', { virtuals: true });

// Method to check if user is a member
contractorSchema.methods.isMember = function (userId) {
  return this.members.some(
    (member) =>
      member.user_id.toString() === userId.toString() && member.is_active,
  );
};

// Method to check if user is owner
contractorSchema.methods.isOwner = function (userId) {
  return this.owner_user_id.toString() === userId.toString();
};

// Method to get user's role in contractor
contractorSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find(
    (m) => m.user_id.toString() === userId.toString() && m.is_active,
  );
  return member?.role || null;
};

// Method to check if user has permission
contractorSchema.methods.userHasPermission = function (userId, permission) {
  // Owner has all permissions
  if (this.isOwner(userId)) return true;

  const member = this.members.find(
    (m) => m.user_id.toString() === userId.toString() && m.is_active,
  );
  return member?.permissions?.includes(permission) || false;
};

// Method to add member
contractorSchema.methods.addMember = function (
  userId,
  role,
  permissions,
  addedBy,
  title = null,
) {
  // Check if already a member
  const existingIndex = this.members.findIndex(
    (m) => m.user_id.toString() === userId.toString(),
  );

  const memberData = {
    user_id: userId,
    role,
    permissions,
    title,
    added_by: addedBy,
    added_date: new Date(),
    is_active: true,
  };

  if (existingIndex >= 0) {
    // Reactivate if inactive, or update
    this.members[existingIndex] = memberData;
  } else {
    this.members.push(memberData);
  }

  return this.save();
};

// Method to remove member
contractorSchema.methods.removeMember = function (userId) {
  const member = this.members.find(
    (m) => m.user_id.toString() === userId.toString(),
  );
  if (member) {
    member.is_active = false;
  }
  return this.save();
};

// Method to add municipality approval
contractorSchema.methods.addMunicipalityApproval = function (
  municipalityId,
  municipalityName,
  approvedBy = null,
  registrationNumber = null,
) {
  const existingIndex = this.municipality_approvals.findIndex(
    (a) => a.municipality_id.toString() === municipalityId.toString(),
  );

  const approvalData = {
    municipality_id: municipalityId,
    municipality_name: municipalityName,
    status: approvedBy ? 'approved' : 'pending',
    approved_by: approvedBy,
    approved_date: approvedBy ? new Date() : null,
    registration_number: registrationNumber,
  };

  if (existingIndex >= 0) {
    this.municipality_approvals[existingIndex] = {
      ...this.municipality_approvals[existingIndex],
      ...approvalData,
    };
  } else {
    this.municipality_approvals.push(approvalData);
  }

  return this.save();
};

// Method to check municipality approval status
contractorSchema.methods.isApprovedForMunicipality = function (municipalityId) {
  const approval = this.municipality_approvals.find(
    (a) => a.municipality_id.toString() === municipalityId.toString(),
  );
  return approval?.status === 'approved';
};

// Subscription feature checks (Array-based, from Stripe)
contractorSchema.methods.hasFeature = function (featureName) {
  // Check if subscription is active
  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(this.subscription?.status)) {
    return false;
  }

  // Check if feature exists in features array
  return this.subscription?.features?.includes(featureName) || false;
};

contractorSchema.methods.canAddTeamMember = function () {
  const currentMemberCount = this.members.filter((m) => m.is_active).length;
  const maxMembers = this.subscription?.features?.max_team_members || 1;
  return currentMemberCount < maxMembers;
};

contractorSchema.methods.getDefaultPaymentMethod = function () {
  return this.payment_methods.find((pm) => pm.is_default);
};

contractorSchema.methods.canUserUsePaymentMethod = function (
  userId,
  paymentMethodId,
) {
  const paymentMethod = this.payment_methods.find(
    (pm) => pm._id.toString() === paymentMethodId.toString(),
  );
  if (!paymentMethod) return false;

  // Owner can use any payment method
  if (this.isOwner(userId)) return true;

  // Check if user is in authorized_users
  return paymentMethod.authorized_users.some(
    (authUserId) => authUserId.toString() === userId.toString(),
  );
};

// Virtual for subscription display
contractorSchema.virtual('subscriptionDisplay').get(function () {
  const planNames = {
    free: 'Free',
    pro: 'Pro',
    premium: 'Premium',
    enterprise: 'Enterprise',
  };
  return planNames[this.subscription?.plan] || 'Free';
});

// Virtual for active team member count
contractorSchema.virtual('activeTeamMemberCount').get(function () {
  return this.members ? this.members.filter((m) => m.is_active).length : 0;
});

// Method to add internal note
contractorSchema.methods.addInternalNote = function (userId, userName, note) {
  this.internal_notes.push({
    author: userId,
    author_name: userName,
    note: note,
    timestamp: new Date(),
  });
  return this.save();
};

// Method to blacklist contractor
contractorSchema.methods.blacklist = function (
  reason,
  adminUserId,
  notes = null,
) {
  this.is_blacklisted = true;
  this.blacklisted_reason = reason;
  this.blacklisted_at = new Date();
  this.blacklisted_by = adminUserId;
  if (notes) {
    this.blacklist_notes = notes;
  }
  return this.save();
};

// Method to remove blacklist
contractorSchema.methods.removeBlacklist = function (adminUserId) {
  this.is_blacklisted = false;
  this.blacklisted_reason = null;
  this.blacklisted_at = null;
  this.blacklisted_by = null;
  this.blacklist_notes = null;
  this.updated_by = adminUserId;
  return this.save();
};

// ===== Stripe Subscription Helper Methods =====

// Check if subscription is active (not paused)
contractorSchema.methods.isSubscriptionActive = function () {
  const activeStatuses = ['active', 'trialing'];
  return activeStatuses.includes(this.subscription?.status);
};

// Check if subscription is paused (read-only access)
contractorSchema.methods.isSubscriptionPaused = function () {
  return this.subscription?.status === 'paused';
};

// Update subscription data from Stripe webhook
contractorSchema.methods.updateSubscription = async function (subscriptionData) {
  if (!this.subscription) {
    this.subscription = {};
  }

  // Update subscription fields
  if (subscriptionData.stripe_subscription_id !== undefined) {
    this.subscription.stripe_subscription_id =
      subscriptionData.stripe_subscription_id;
  }
  if (subscriptionData.stripe_product_id !== undefined) {
    this.subscription.stripe_product_id = subscriptionData.stripe_product_id;
  }
  if (subscriptionData.stripe_price_id !== undefined) {
    this.subscription.stripe_price_id = subscriptionData.stripe_price_id;
  }
  if (subscriptionData.status !== undefined) {
    this.subscription.status = subscriptionData.status;
  }
  if (subscriptionData.plan !== undefined) {
    this.subscription.plan = subscriptionData.plan;
  }
  if (subscriptionData.features !== undefined) {
    this.subscription.features = subscriptionData.features;
    this.subscription.features_last_synced = new Date();
  }
  if (subscriptionData.paused_at !== undefined) {
    this.subscription.paused_at = subscriptionData.paused_at;
  }
  if (subscriptionData.canceled_at !== undefined) {
    this.subscription.canceled_at = subscriptionData.canceled_at;
  }
  if (subscriptionData.current_period_start !== undefined) {
    this.subscription.current_period_start =
      subscriptionData.current_period_start;
  }
  if (subscriptionData.current_period_end !== undefined) {
    this.subscription.current_period_end = subscriptionData.current_period_end;
  }
  if (subscriptionData.trial_ends_at !== undefined) {
    this.subscription.trial_ends_at = subscriptionData.trial_ends_at;
  }

  await this.save();
};

// Update features from Stripe Product Features API
contractorSchema.methods.updateFeatures = async function (featuresArray) {
  if (!this.subscription) {
    this.subscription = {};
  }

  this.subscription.features = featuresArray;
  this.subscription.features_last_synced = new Date();

  await this.save();
};

// Get all features for contractor
contractorSchema.methods.getFeatures = function () {
  return this.subscription?.features || [];
};

// Static method to find contractors by municipality
contractorSchema.statics.findByMunicipality = function (
  municipalityId,
  approvedOnly = true,
) {
  const query = {
    'municipality_approvals.municipality_id': municipalityId,
    is_active: true,
  };

  if (approvedOnly) {
    query['municipality_approvals.status'] = 'approved';
  }

  return this.find(query).populate(
    'owner_user_id',
    'first_name last_name email',
  );
};

// Static method to find contractors with expiring licenses
contractorSchema.statics.findExpiringLicenses = function (daysThreshold = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysThreshold);

  return this.find({
    is_active: true,
    license_expiration: {
      $gte: new Date(),
      $lte: futureDate,
    },
  });
};

// Static method to find blacklisted contractors
contractorSchema.statics.findBlacklisted = function () {
  return this.find({ is_blacklisted: true })
    .populate('blacklisted_by', 'first_name last_name email')
    .sort({ blacklisted_at: -1 });
};

module.exports = mongoose.model('Contractor', contractorSchema);
