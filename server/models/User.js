const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false, // Don't include password in queries by default
    },
    first_name: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    last_name: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?1?\d{9,15}$/, 'Please enter a valid phone number'],
    },

    // SMS notification settings
    sms_phone: {
      type: String,
      trim: true,
      match: [/^\d{10}$/, 'SMS phone must be a 10-digit number'],
    },
    sms_carrier: {
      type: String,
      enum: [
        'verizon',
        'att',
        'tmobile',
        'sprint',
        'us_cellular',
        'boost',
        'cricket',
        'metro_pcs',
        'other',
      ],
    },

    // Global role for system-wide permissions
    global_role: {
      type: String,
      enum: [
        'avitar_staff',
        'avitar_admin',
        'avitar_assessor',
        'municipal_user',
        'citizen',
        'contractor',
      ],
      default: 'citizen',
    },

    // Contractor reference (for global_role: 'contractor')
    contractor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contractor',
      sparse: true, // Only contractors will have this
    },

    // Municipality-specific permissions
    municipal_permissions: [
      {
        municipality_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Municipality',
          required: true,
        },
        municipality_name: String, // Denormalized for easy access

        // Overall role in this municipality
        role: {
          type: String,
          enum: ['admin', 'department_head', 'staff', 'readonly', 'contractor'],
          required: true,
        },

        // Department assignment (for permit reviews and workflows)
        // This is municipality-specific - same user can be in different departments for different municipalities
        department: {
          type: String,
          enum: [
            'Building Inspector',
            'Fire Marshal',
            'Health Department',
            'Planning & Zoning',
            'Engineering',
            'Public Works',
            'Conservation',
            'Electrical',
            'Plumbing',
            'Other',
          ],
        },

        // Module-specific permissions
        module_permissions: {
          type: Map,
          of: {
            enabled: { type: Boolean, default: false },
            role: {
              type: String,
              enum: ['admin', 'supervisor', 'staff', 'readonly', 'data_entry'],
              default: 'readonly',
            },
            permissions: [String], // ['create', 'read', 'update', 'delete', 'approve', 'export']
            restrictions: {
              type: Map,
              of: mongoose.Schema.Types.Mixed, // Custom restrictions per module
            },
          },
        },

        // When access expires (for contractors)
        expires_at: Date,
        created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        notes: String,
      },
    ],

    // User preferences
    preferences: {
      default_municipality: String, // municipality slug
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'light',
      },
      notifications: {
        // Legacy global toggles (deprecated, use specific types below)
        email: { type: Boolean, default: true },
        browser: { type: Boolean, default: true },

        // Granular notification preferences per type
        permit_status_changes: {
          email: { type: Boolean, default: true },
          sms: { type: Boolean, default: false },
        },
        inspection_notifications: {
          email: { type: Boolean, default: true },
          sms: { type: Boolean, default: false },
        },
        team_member_changes: {
          email: { type: Boolean, default: true },
          sms: { type: Boolean, default: false },
        },
        license_expiration: {
          email: { type: Boolean, default: true },
          sms: { type: Boolean, default: false },
        },
        payment_confirmations: {
          email: { type: Boolean, default: true },
          sms: { type: Boolean, default: false },
        },
        subscription_updates: {
          email: { type: Boolean, default: true },
          sms: { type: Boolean, default: false },
        },
        marketing: {
          product_updates: { type: Boolean, default: true },
          tips_and_best_practices: { type: Boolean, default: false },
          promotional_offers: { type: Boolean, default: false },
        },
      },
    },

    last_login: Date,
    is_active: { type: Boolean, default: true },

    // Account verification
    is_email_verified: {
      type: Boolean,
      default: false,
    },
    email_verification_token: String,
    email_verification_expires: Date,

    // Password reset
    password_reset_token: String,
    password_reset_expires: Date,

    // Security
    login_attempts: {
      type: Number,
      default: 0,
    },
    account_locked_until: Date,

    // Two-factor authentication
    two_factor_enabled: {
      type: Boolean,
      default: false,
    },
    two_factor_secret: {
      type: String,
      select: false,
    },

    // Login session tracking
    loginSessions: [
      {
        loginDate: {
          type: Date,
          required: true,
          default: Date.now,
        },
        logoutDate: {
          type: Date,
        },
        ipAddress: {
          type: String,
        },
        deviceName: {
          type: String,
        },
        browser: {
          type: String,
        },
        operatingSystem: {
          type: String,
        },
        location: {
          type: String, // Approximate location based on IP
        },
        sessionActive: {
          type: Boolean,
          default: true,
        },
      },
    ],

    // Permission change audit log
    permissionChangeHistory: [
      {
        timestamp: {
          type: Date,
          required: true,
          default: Date.now,
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        changedByName: {
          type: String, // Denormalized for display
        },
        changeType: {
          type: String,
          enum: [
            'module_added',
            'module_removed',
            'module_updated',
            'role_changed',
            'department_changed',
            'permission_granted',
            'permission_revoked',
            'municipality_added',
            'municipality_removed',
          ],
        },
        municipalityId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Municipality',
        },
        municipalityName: {
          type: String,
        },
        moduleName: {
          type: String,
        },
        field: {
          type: String,
        },
        oldValue: {
          type: mongoose.Schema.Types.Mixed,
        },
        newValue: {
          type: mongoose.Schema.Types.Mixed,
        },
        description: {
          type: String, // Human-readable description
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.password_reset_token;
        delete ret.password_reset_expires;
        delete ret.email_verification_token;
        delete ret.email_verification_expires;
        delete ret.two_factor_secret;
        return ret;
      },
    },
  },
);

// Indexes for performance
userSchema.index({ 'municipal_permissions.municipality_id': 1 });
userSchema.index({ global_role: 1 });
userSchema.index({ is_active: 1 });
userSchema.index({ contractor_id: 1 }, { sparse: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  // Only hash if password is modified
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to get full name
userSchema.virtual('fullName').get(function () {
  return `${this.first_name} ${this.last_name}`;
});

// Method to update last login
userSchema.methods.updateLastLogin = function () {
  this.last_login = new Date();
  return this.save();
};

// Static method to find active users
userSchema.statics.findActive = function () {
  return this.find({ is_active: true });
};

// Method to get municipality permission by municipality ID
userSchema.methods.getMunicipalityPermission = function (municipalityId) {
  return this.municipal_permissions.find(
    (perm) => perm.municipality_id.toString() === municipalityId.toString(),
  );
};

// Method to check if user has access to municipality
userSchema.methods.hasAccessToMunicipality = function (municipalityId) {
  const permission = this.getMunicipalityPermission(municipalityId);
  if (!permission) return false;

  // Check if access has expired (for contractors)
  if (permission.expires_at && permission.expires_at < new Date()) {
    return false;
  }

  return true;
};

// Method to check if user has module permission
userSchema.methods.hasModulePermission = function (
  municipalityId,
  moduleName,
  action = 'read',
) {
  // Avitar staff have access to everything
  if (
    this.global_role === 'avitar_staff' ||
    this.global_role === 'avitar_admin'
  ) {
    return true;
  }

  const permission = this.getMunicipalityPermission(municipalityId);
  if (!permission) return false;

  const modulePermission = permission.module_permissions?.get(moduleName);
  if (!modulePermission?.enabled) return false;

  // Check if user has the required permission
  return modulePermission.permissions?.includes(action) || false;
};

// Method to get user's role in a municipality
userSchema.methods.getRoleInMunicipality = function (municipalityId) {
  const permission = this.getMunicipalityPermission(municipalityId);
  return permission?.role || null;
};

// Method to get user's module role
userSchema.methods.getModuleRole = function (municipalityId, moduleName) {
  const permission = this.getMunicipalityPermission(municipalityId);
  if (!permission) return null;

  const modulePermission = permission.module_permissions?.get(moduleName);
  return modulePermission?.role || null;
};

// Method to add municipality permission
userSchema.methods.addMunicipalityPermission = function (
  municipalityId,
  municipalityName,
  role,
  modulePermissions = {},
) {
  const existingIndex = this.municipal_permissions.findIndex(
    (perm) => perm.municipality_id.toString() === municipalityId.toString(),
  );

  const permissionData = {
    municipality_id: municipalityId,
    municipality_name: municipalityName,
    role: role,
    module_permissions: new Map(),
  };

  // Add module permissions
  for (const [moduleName, moduleData] of Object.entries(modulePermissions)) {
    permissionData.module_permissions.set(moduleName, moduleData);
  }

  if (existingIndex >= 0) {
    this.municipal_permissions[existingIndex] = permissionData;
  } else {
    this.municipal_permissions.push(permissionData);
  }

  return this.save();
};

// Method to remove municipality permission
userSchema.methods.removeMunicipalityPermission = function (municipalityId) {
  this.municipal_permissions = this.municipal_permissions.filter(
    (perm) => perm.municipality_id.toString() !== municipalityId.toString(),
  );
  return this.save();
};

// Method to get available municipalities for user
userSchema.methods.getAvailableMunicipalities = function () {
  return this.municipal_permissions
    .filter((perm) => {
      // Filter out expired permissions
      if (perm.expires_at && perm.expires_at < new Date()) {
        return false;
      }
      return true;
    })
    .map((perm) => ({
      municipality_id: perm.municipality_id,
      municipality_name: perm.municipality_name,
      role: perm.role,
    }));
};

// Method to check if user is locked
userSchema.methods.isLocked = function () {
  return this.account_locked_until && this.account_locked_until > Date.now();
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function () {
  // If we have a previous attempt and it's more than 24 hours ago, reset attempts
  if (this.account_locked_until && this.account_locked_until < Date.now()) {
    return this.updateOne({
      $unset: { account_locked_until: 1 },
      $set: { login_attempts: 1 },
    });
  }

  const updates = { $inc: { login_attempts: 1 } };

  // Lock account after 5 failed attempts for 24 hours
  if (this.login_attempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { account_locked_until: Date.now() + 24 * 60 * 60 * 1000 }; // 24 hours
  }

  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { login_attempts: 1, account_locked_until: 1 },
  });
};

// Contractor-specific methods
userSchema.methods.isContractor = function () {
  return this.global_role === 'contractor' && !!this.contractor_id;
};

userSchema.methods.isCitizen = function () {
  return this.global_role === 'citizen';
};

userSchema.methods.isContractorOrCitizen = function () {
  return this.global_role === 'contractor' || this.global_role === 'citizen';
};

// Legacy compatibility methods for existing code
userSchema.virtual('name').get(function () {
  return this.fullName;
});

userSchema.virtual('userType').get(function () {
  switch (this.global_role) {
    case 'avitar_staff':
    case 'avitar_admin':
      return 'system';
    case 'municipal_user':
      return 'municipal';
    case 'contractor':
      return 'contractor';
    default:
      return 'citizen';
  }
});

userSchema.virtual('permissionLevel').get(function () {
  switch (this.global_role) {
    case 'avitar_admin':
      return 900;
    case 'avitar_staff':
      return 800;
    case 'municipal_user':
      return 400;
    case 'contractor':
      return 200;
    case 'citizen':
      return 100;
    default:
      return 0;
  }
});

module.exports = mongoose.model('User', userSchema);
