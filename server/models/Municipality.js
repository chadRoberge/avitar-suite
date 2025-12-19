const mongoose = require('mongoose');

const municipalitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Municipality name is required'],
      trim: true,
      maxlength: [100, 'Municipality name cannot exceed 100 characters'],
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Municipality code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [10, 'Municipality code cannot exceed 10 characters'],
      match: [
        /^[A-Z0-9_]+$/,
        'Municipality code must contain only uppercase letters, numbers, and underscores',
      ],
    },
    state: {
      type: String,
      default: 'NH',
      trim: true,
      maxlength: [2, 'State must be 2 characters'],
      minlength: [2, 'State must be 2 characters'],
      uppercase: true,
      match: [/^[A-Z]{2}$/, 'State must be a valid 2-letter state code'],
    },
    county: {
      type: String,
      required: [true, 'County is required'],
      trim: true,
      maxlength: [50, 'County name cannot exceed 50 characters'],
    },
    type: {
      type: String,
      required: [true, 'Municipality type is required'],
      enum: {
        values: ['city', 'town', 'village', 'township', 'borough', 'county'],
        message:
          'Municipality type must be one of: city, town, village, township, borough, county',
      },
    },
    // Contact Information (enhanced structure)
    contact_info: {
      address: {
        street: {
          type: String,
          required: [true, 'Street address is required'],
          trim: true,
          maxlength: [100, 'Street address cannot exceed 100 characters'],
        },
        city: {
          type: String,
          required: [true, 'City is required'],
          trim: true,
          maxlength: [50, 'City cannot exceed 50 characters'],
        },
        zipCode: {
          type: String,
          required: [true, 'ZIP code is required'],
          trim: true,
          match: [/^\d{5}(-\d{4})?$/, 'Please enter a valid ZIP code'],
        },
      },
      phone: {
        type: String,
        trim: true,
        match: [
          /^\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
          'Please enter a valid phone number',
        ],
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
      website: {
        type: String,
        trim: true,
        match: [
          /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
          'Please enter a valid website URL',
        ],
      },
      assessor_name: {
        type: String,
        trim: true,
        maxlength: [100, 'Assessor name cannot exceed 100 characters'],
      },
      tax_collector_name: {
        type: String,
        trim: true,
        maxlength: [100, 'Tax collector name cannot exceed 100 characters'],
      },
    },

    // Branding Configuration
    branding_config: {
      logo_url: {
        type: String,
        trim: true,
      },
      primary_color: {
        type: String,
        default: '#1f4788',
        match: [
          /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
          'Please enter a valid hex color',
        ],
      },
      secondary_color: {
        type: String,
        default: '#ffffff',
        match: [
          /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
          'Please enter a valid hex color',
        ],
      },
      header_text: {
        type: String,
        trim: true,
        maxlength: [200, 'Header text cannot exceed 200 characters'],
      },
      favicon_url: {
        type: String,
        trim: true,
      },
    },
    // Municipal Configuration
    taxYear: {
      type: Number,
      default: () => new Date().getFullYear(),
      min: [2000, 'Tax year must be 2000 or later'],
      max: [2099, 'Tax year must be before 2100'],
    },
    fiscalYearStart: {
      type: String,
      enum: ['january', 'april', 'july', 'october'],
      default: 'january',
    },
    // Enhanced Module Configuration (flexible Map-based approach)
    module_config: {
      billing_tier: {
        type: String,
        enum: ['basic', 'standard', 'premium'],
        default: 'standard',
      },
      modules: {
        type: Map,
        of: {
          enabled: { type: Boolean, default: false },
          version: { type: String, default: '1.0.0' },
          tier: {
            type: String,
            enum: ['basic', 'advanced', 'premium'],
            default: 'basic',
          },
          // Stripe Subscription Fields (per module)
          stripe_subscription_id: { type: String },
          stripe_product_id: { type: String },
          stripe_price_id: { type: String },
          subscription_status: {
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
          trial_start: { type: Date },
          trial_end: { type: Date },
          current_period_start: { type: Date },
          current_period_end: { type: Date },
          canceled_at: { type: Date },
          paused_at: { type: Date },
          parcel_count_at_purchase: { type: Number },
          // Features array from Stripe Product Features API
          features: {
            type: [String],
            default: [],
          },
          features_last_synced: { type: Date },
          // Legacy fields for backward compatibility
          permissions: { type: Map, of: [String] },
          settings: { type: Map, of: mongoose.Schema.Types.Mixed },
          disabled_reason: String,
          activated_date: Date,
          expiration_date: Date,
        },
      },
    },

    // Stripe Integration (one customer, multiple module subscriptions)
    stripe_customer_id: {
      type: String,
      index: true,
      sparse: true,
    },
    billing_email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid billing email address',
      ],
    },

    // Stripe Connected Account (for receiving payments from permits/taxes)
    stripe_account_id: {
      type: String,
      index: true,
      sparse: true,
    },
    stripe_account_status: {
      type: String,
      enum: ['pending', 'onboarding', 'active', 'restricted', 'disabled'],
      default: 'pending',
    },
    stripe_account_type: {
      type: String,
      enum: ['standard', 'express'],
      default: 'standard',
    },
    stripe_onboarding_completed: {
      type: Boolean,
      default: false,
    },
    stripe_charges_enabled: {
      type: Boolean,
      default: false,
    },
    stripe_payouts_enabled: {
      type: Boolean,
      default: false,
    },
    stripe_account_link_expires: Date,
    stripe_onboarding_started: Date,
    stripe_onboarding_completed_date: Date,

    // Subscription Management (legacy - keeping for backward compatibility)
    subscription: {
      start_date: {
        type: Date,
        default: Date.now,
      },
      end_date: Date,
      auto_renew: {
        type: Boolean,
        default: true,
      },
      payment_status: {
        type: String,
        enum: ['active', 'past_due', 'suspended', 'cancelled'],
        default: 'active',
      },
      billing_email: {
        type: String,
        lowercase: true,
        trim: true,
      },
      last_payment_date: Date,
    },

    // System Configuration
    settings: {
      timezone: {
        type: String,
        default: 'America/New_York',
      },
      currency: {
        type: String,
        default: 'USD',
        enum: ['USD'],
      },
      dateFormat: {
        type: String,
        default: 'MM/dd/yyyy',
        enum: ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'],
      },
      allowPublicRecords: {
        type: Boolean,
        default: true,
      },
      requireEmailVerification: {
        type: Boolean,
        default: true,
      },
      // Building Permits Settings
      buildingPermits: {
        allowUnverifiedContractors: {
          type: Boolean,
          default: false,
          description:
            'Allow contractors to submit permit applications without platform verification',
        },
        requireContractorLicense: {
          type: Boolean,
          default: true,
          description:
            'Require contractors to provide license information (even if unverified)',
        },
        autoApproveVerifiedContractors: {
          type: Boolean,
          default: false,
          description:
            'Automatically approve permit applications from platform-verified contractors',
        },
      },
    },

    // PID Format Configuration
    pid_format: {
      map: {
        digits: { type: Number, default: 2, min: 1, max: 6 },
        position: { type: Number, default: 0 },
        label: { type: String, default: 'Map' },
      },
      lot: {
        digits: { type: Number, default: 3, min: 1, max: 6 },
        position: { type: Number, default: 2 },
        label: { type: String, default: 'Lot' },
      },
      sublot: {
        digits: { type: Number, default: 3, min: 1, max: 6 },
        position: { type: Number, default: 5 },
        label: { type: String, default: 'Sublot' },
        optional: { type: Boolean, default: true },
      },
      condo: {
        digits: { type: Number, default: 3, min: 0, max: 6 },
        position: { type: Number, default: 8 },
        label: { type: String, default: 'Condo' },
        optional: { type: Boolean, default: true },
      },
      mobile: {
        digits: { type: Number, default: 4, min: 0, max: 6 },
        position: { type: Number, default: 11 },
        label: { type: String, default: 'Mobile' },
        optional: { type: Boolean, default: true },
      },
      unit: {
        digits: { type: Number, default: 0, min: 0, max: 6 },
        position: { type: Number, default: 15 },
        label: { type: String, default: 'Unit' },
        optional: { type: Boolean, default: true },
      },
      building: {
        digits: { type: Number, default: 0, min: 0, max: 6 },
        position: { type: Number, default: 15 },
        label: { type: String, default: 'Building' },
        optional: { type: Boolean, default: true },
      },
      // Display formatting options
      separator: { type: String, default: '-', enum: ['-', '.', '/', ' '] },
      removeLeadingZeros: { type: Boolean, default: true },
      showSubOnlyWhenPresent: { type: Boolean, default: false },
    },
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    setupCompleted: {
      type: Boolean,
      default: false,
    },
    // Statistics (updated periodically)
    stats: {
      totalUsers: {
        type: Number,
        default: 0,
      },
      activeUsers: {
        type: Number,
        default: 0,
      },
      totalProperties: {
        type: Number,
        default: 0,
      },
      activePermits: {
        type: Number,
        default: 0,
      },
      lastStatsUpdate: {
        type: Date,
        default: Date.now,
      },
    },

    // Status
    is_active: {
      type: Boolean,
      default: true,
    },
    setup_completed: {
      type: Boolean,
      default: false,
    },
    // Available reports by module
    available_reports: {
      type: Map,
      of: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AssessingReport',
        },
      ],
      default: new Map(),
    },
    // Inspection scheduling settings
    inspectionSettings: {
      availableTimeSlots: [
        {
          dayOfWeek: {
            type: Number,
            min: 0,
            max: 6, // 0=Sunday, 6=Saturday
          },
          startTime: {
            type: String,
            match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, // HH:MM format
          },
          endTime: {
            type: String,
            match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
          },
          slotDuration: {
            type: Number,
            default: 60, // minutes per slot
            min: 15,
            max: 480,
          },
        },
      ],
      inspectors: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
          inspectionTypes: {
            type: [String],
            default: [],
          },
          maxPerDay: {
            type: Number,
            default: 8,
            min: 1,
            max: 20,
          },
          isActive: {
            type: Boolean,
            default: true,
          },
        },
      ],
    },

    // Cache invalidation tracking
    lastModified: {
      type: Date,
      default: Date.now,
      index: true,
      description:
        'Timestamp of last configuration change. Updated when zones, land-ladders, neighborhoods, or other config data changes.',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        // Don't expose sensitive settings in API responses
        // Manually add isPaymentSetupComplete since we don't want all virtuals
        const isComplete = doc.isPaymentSetupComplete;
        ret.isPaymentSetupComplete = isComplete;
        return ret;
      },
    },
  },
);

// Indexes for better query performance
municipalitySchema.index({ state: 1 });
municipalitySchema.index({ is_active: 1 });
municipalitySchema.index({ 'contact_info.address.zipCode': 1 });
municipalitySchema.index({ 'module_config.billing_tier': 1 });
municipalitySchema.index({ 'subscription.payment_status': 1 });

// Virtual for full address
municipalitySchema.virtual('fullAddress').get(function () {
  if (
    !this.contact_info?.address?.street ||
    !this.contact_info?.address?.city ||
    !this.state ||
    !this.contact_info?.address?.zipCode
  ) {
    return '';
  }
  return `${this.contact_info.address.street}, ${this.contact_info.address.city}, ${this.state} ${this.contact_info.address.zipCode}`;
});

// Virtual for display name
municipalitySchema.virtual('displayName').get(function () {
  if (!this.type || !this.name) {
    return this.name || '';
  }
  return `${this.type.charAt(0).toUpperCase() + this.type.slice(1)} of ${this.name}`;
});

// Virtual for checking if Stripe Connect payment setup is complete
municipalitySchema.virtual('isPaymentSetupComplete').get(function () {
  return (
    this.stripe_onboarding_completed === true &&
    this.stripe_charges_enabled === true &&
    this.stripe_payouts_enabled === true &&
    this.stripe_account_status === 'active'
  );
});

// Static method to find active municipalities
municipalitySchema.statics.findActive = function () {
  return this.find({ is_active: true }).sort({ name: 1 });
};

// Static method to find by state
municipalitySchema.statics.findByState = function (state) {
  return this.find({ state: state.toUpperCase(), is_active: true }).sort({
    name: 1,
  });
};

// Method to check if module is enabled (Map-based)
municipalitySchema.methods.hasModule = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);
  return module?.enabled === true && !this.isModuleExpired(moduleName);
};

// Method to check if module feature is enabled (Array-based, from Stripe)
municipalitySchema.methods.hasFeature = function (moduleName, featureName) {
  const module = this.module_config.modules.get(moduleName);
  if (!module?.enabled) return false;

  // Check if subscription is active
  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(module.subscription_status)) return false;

  // Check if feature exists in features array
  return module.features?.includes(featureName) || false;
};

// Method to get module tier
municipalitySchema.methods.getModuleTier = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);
  return module?.tier || null;
};

// Method to check if module is expired
municipalitySchema.methods.isModuleExpired = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);
  if (!module?.expiration_date) return false;
  return new Date() > module.expiration_date;
};

// Method to get enabled modules
municipalitySchema.methods.getEnabledModules = function () {
  const enabledModules = [];

  for (const [moduleName, moduleConfig] of this.module_config.modules) {
    if (moduleConfig.enabled && !this.isModuleExpired(moduleName)) {
      const enabledFeatures = [];
      if (moduleConfig.features) {
        for (const [featureName, feature] of moduleConfig.features) {
          if (feature.enabled) {
            enabledFeatures.push(featureName);
          }
        }
      }

      enabledModules.push({
        name: moduleName,
        tier: moduleConfig.tier,
        version: moduleConfig.version,
        features: enabledFeatures,
        activatedDate: moduleConfig.activated_date,
        expirationDate: moduleConfig.expiration_date,
        disabledReason: moduleConfig.disabled_reason,
      });
    }
  }
  return enabledModules;
};

// Method to enable module with features (Map-based)
municipalitySchema.methods.enableModule = function (moduleName, config = {}) {
  const {
    tier = 'basic',
    version = '1.0.0',
    features = {},
    settings = {},
    permissions = {},
    expirationDate = null,
  } = config;

  // Create module configuration
  const moduleConfig = {
    enabled: true,
    version,
    tier,
    features: new Map(),
    settings: new Map(),
    permissions: new Map(),
    activated_date: new Date(),
    expiration_date: expirationDate,
  };

  // Add features
  for (const [featureName, featureConfig] of Object.entries(features)) {
    moduleConfig.features.set(featureName, {
      enabled: featureConfig.enabled || false,
      tier_required: featureConfig.tier_required || tier,
      config: featureConfig.config || {},
    });
  }

  // Add settings
  for (const [key, value] of Object.entries(settings)) {
    moduleConfig.settings.set(key, value);
  }

  // Add permissions
  for (const [role, perms] of Object.entries(permissions)) {
    moduleConfig.permissions.set(role, perms);
  }

  this.module_config.modules.set(moduleName, moduleConfig);
  return this.save();
};

// Method to disable module
municipalitySchema.methods.disableModule = function (
  moduleName,
  reason = null,
) {
  const module = this.module_config.modules.get(moduleName);
  if (!module) {
    throw new Error(`Module ${moduleName} not found`);
  }

  module.enabled = false;
  if (reason) {
    module.disabled_reason = reason;
  }

  this.module_config.modules.set(moduleName, module);
  return this.save();
};

// Method to add feature to module
municipalitySchema.methods.addModuleFeature = function (
  moduleName,
  featureName,
  config = {},
) {
  const module = this.module_config.modules.get(moduleName);
  if (!module) {
    throw new Error(`Module ${moduleName} not found`);
  }

  if (!module.features) {
    module.features = new Map();
  }

  module.features.set(featureName, {
    enabled: config.enabled || false,
    tier_required: config.tier_required || module.tier,
    config: config.config || {},
  });

  this.module_config.modules.set(moduleName, module);
  return this.save();
};

// Method to update stats
municipalitySchema.methods.updateStats = function (newStats) {
  this.stats = { ...this.stats, ...newStats, lastStatsUpdate: new Date() };
  return this.save();
};

// Subscription-related methods

// Get current parcel count for pricing calculations
municipalitySchema.methods.getParcelCount = async function () {
  try {
    const PropertyTreeNode = require('./PropertyTreeNode');
    const count = await PropertyTreeNode.countDocuments({
      municipality_id: this._id,
    });
    return count;
  } catch (error) {
    console.error('Error getting parcel count:', error);
    // Fallback to stats if available
    return this.stats?.totalProperties || 0;
  }
};

// Check if module is currently in trial period
municipalitySchema.methods.isModuleInTrial = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);
  if (!module || !module.trial_end) return false;

  const now = new Date();
  const trialEnd = new Date(module.trial_end);

  return now < trialEnd && module.subscription_status === 'trialing';
};

// Check if module has active paid subscription
municipalitySchema.methods.hasActiveModuleSubscription = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);
  if (!module) return false;

  return ['active', 'trialing'].includes(module.subscription_status);
};

// Get module access level (none, trial, full, read-only)
municipalitySchema.methods.getModuleAccessLevel = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);

  // Module not configured or not enabled
  if (!module || !module.enabled) {
    return 'none';
  }

  // Currently in trial period
  if (this.isModuleInTrial(moduleName)) {
    return 'trial';
  }

  // Has active paid subscription
  if (module.subscription_status === 'active') {
    return 'full';
  }

  // Trial expired but no active subscription = read-only
  if (module.trial_end && new Date() > new Date(module.trial_end)) {
    if (!['active', 'trialing'].includes(module.subscription_status)) {
      return 'read-only';
    }
  }

  // Module enabled but no subscription info
  return 'none';
};

// Check if module can perform write operations
municipalitySchema.methods.canModifyModuleData = function (moduleName) {
  const accessLevel = this.getModuleAccessLevel(moduleName);
  return ['trial', 'full'].includes(accessLevel);
};

// Get days remaining in trial
municipalitySchema.methods.getTrialDaysRemaining = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);
  if (!module || !module.trial_end) return 0;

  const now = new Date();
  const trialEnd = new Date(module.trial_end);
  const diffTime = trialEnd - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays > 0 ? diffDays : 0;
};

// ===== Stripe Subscription Helper Methods =====

// Check if module has active subscription (not paused)
municipalitySchema.methods.isModuleActive = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);
  if (!module || !module.enabled) return false;

  const activeStatuses = ['active', 'trialing'];
  return activeStatuses.includes(module.subscription_status);
};

// Check if module subscription is paused (read-only access)
municipalitySchema.methods.isModulePaused = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);
  return module?.subscription_status === 'paused';
};

// Check if module has specific feature (for notification permissions)
municipalitySchema.methods.hasModuleFeature = function (
  moduleName,
  featureName,
) {
  const module = this.module_config.modules.get(moduleName);
  if (!module || !module.enabled) return false;

  // Must have active subscription
  if (!this.isModuleActive(moduleName)) return false;

  // Check if feature exists in Stripe features array
  return module.features?.includes(featureName) || false;
};

// Update module subscription data from Stripe webhook
municipalitySchema.methods.updateModuleSubscription = async function (
  moduleName,
  subscriptionData,
) {
  const module = this.module_config.modules.get(moduleName) || {};

  // Update subscription fields
  if (subscriptionData.stripe_subscription_id !== undefined) {
    module.stripe_subscription_id = subscriptionData.stripe_subscription_id;
  }
  if (subscriptionData.stripe_product_id !== undefined) {
    module.stripe_product_id = subscriptionData.stripe_product_id;
  }
  if (subscriptionData.stripe_price_id !== undefined) {
    module.stripe_price_id = subscriptionData.stripe_price_id;
  }
  if (subscriptionData.subscription_status !== undefined) {
    module.subscription_status = subscriptionData.subscription_status;
  }
  if (subscriptionData.tier !== undefined) {
    module.tier = subscriptionData.tier;
  }
  if (subscriptionData.features !== undefined) {
    module.features = subscriptionData.features;
    module.features_last_synced = new Date();
  }
  if (subscriptionData.paused_at !== undefined) {
    module.paused_at = subscriptionData.paused_at;
  }
  if (subscriptionData.canceled_at !== undefined) {
    module.canceled_at = subscriptionData.canceled_at;
  }

  this.module_config.modules.set(moduleName, module);
  await this.save();
};

// Update module features from Stripe Product Features API
municipalitySchema.methods.updateModuleFeatures = async function (
  moduleName,
  featuresArray,
) {
  const module = this.module_config.modules.get(moduleName);
  if (!module) {
    throw new Error(`Module ${moduleName} not found`);
  }

  module.features = featuresArray;
  module.features_last_synced = new Date();

  this.module_config.modules.set(moduleName, module);
  await this.save();
};

// Get all features for a module
municipalitySchema.methods.getModuleFeatures = function (moduleName) {
  const module = this.module_config.modules.get(moduleName);
  return module?.features || [];
};

// Pre-save hook to generate slug
municipalitySchema.pre('save', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

module.exports = mongoose.model('Municipality', municipalitySchema);
