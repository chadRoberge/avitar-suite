const express = require('express');
const Municipality = require('../models/Municipality');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { PERMISSION_LEVELS } = require('../config/permissions');
const emailService = require('../services/emailService');
const crypto = require('crypto');
const {
  getAvailableModules,
  getTieredPricingForModule,
  getPriceIdForModule,
  calculatePriceForQuantity,
} = require('../services/stripeService');

const router = express.Router();

// @route   GET /api/municipalities
// @desc    Get all active municipalities (for registration or avitar staff)
// @access  Public for basic info, authenticated for full access
router.get('/', async (req, res) => {
  try {
    const municipalities = await Municipality.findActive()
      .select('name code displayName state type address branding_config')
      .sort({ name: 1 });

    res.json({
      success: true,
      municipalities: municipalities.map((muni) => ({
        id: muni._id,
        name: muni.name,
        code: muni.code,
        displayName: muni.displayName,
        state: muni.state,
        type: muni.type,
        address: muni.address,
        slug: muni.slug || muni.code.toLowerCase(),
        branding_config: muni.branding_config,
      })),
    });
  } catch (error) {
    console.error('Get municipalities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve municipalities',
    });
  }
});

// @route   GET /api/municipalities/by-state/:state
// @desc    Get municipalities by state
// @access  Public
router.get('/by-state/:state', async (req, res) => {
  try {
    const { state } = req.params;

    if (!state || state.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Valid 2-letter state code is required',
      });
    }

    const municipalities = await Municipality.findByState(state).select(
      'name code displayName type address branding_config',
    );

    res.json({
      success: true,
      state: state.toUpperCase(),
      municipalities: municipalities.map((muni) => ({
        id: muni._id,
        name: muni.name,
        code: muni.code,
        displayName: muni.displayName,
        type: muni.type,
        address: muni.address,
        branding_config: muni.branding_config,
      })),
    });
  } catch (error) {
    console.error('Get municipalities by state error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve municipalities for state',
    });
  }
});

// @route   GET /api/municipalities/user/:userId
// @desc    Get municipalities for a specific user
// @access  Private (requires authentication)
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Users can only get their own municipalities, unless they're Avitar staff
    if (
      req.user._id.toString() !== userId &&
      !['avitar_staff', 'avitar_admin'].includes(req.user.global_role)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Return municipalities the user has access to based on municipal_permissions
    const userMunicipalities = [];

    if (
      req.user.municipal_permissions &&
      req.user.municipal_permissions.length > 0
    ) {
      const municipalityIds = req.user.municipal_permissions.map(
        (perm) => perm.municipality_id,
      );
      const municipalities = await Municipality.find({
        _id: { $in: municipalityIds },
        is_active: true,
      });

      userMunicipalities.push(
        ...municipalities.map((muni) => ({
          id: muni._id,
          name: muni.name,
          code: muni.code,
          displayName: muni.displayName,
          state: muni.state,
          slug: muni.slug || muni.code.toLowerCase(),
          branding_config: muni.branding_config,
        })),
      );
    }

    res.json({
      success: true,
      municipalities: userMunicipalities,
    });
  } catch (error) {
    console.error('Get user municipalities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user municipalities',
    });
  }
});

// @route   GET /api/municipalities/by-slug/:slug
// @desc    Get municipality by slug
// @access  Private (requires authentication)
router.get('/by-slug/:slug', authenticateToken, async (req, res) => {
  try {
    const { slug } = req.params;

    const municipality = await Municipality.findOne({
      $or: [{ slug: slug }, { code: slug.toUpperCase() }],
      is_active: true,
    });

    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    // Any authenticated user can access any active municipality
    // Access control is handled at the module level via permissions

    res.json({
      success: true,
      municipality: {
        id: municipality._id,
        name: municipality.name,
        code: municipality.code,
        displayName: municipality.displayName,
        state: municipality.state,
        county: municipality.county,
        type: municipality.type,
        address: municipality.address,
        fullAddress: municipality.fullAddress,
        phone: municipality.phone,
        email: municipality.email,
        website: municipality.website,
        taxYear: municipality.taxYear,
        fiscalYearStart: municipality.fiscalYearStart,
        settings: municipality.settings,
        stats: municipality.stats,
        branding_config: municipality.branding_config,
        module_config: municipality.module_config,
        slug: municipality.slug || municipality.code.toLowerCase(),
        is_active: municipality.is_active,
        setup_completed: municipality.setup_completed,
        createdAt: municipality.createdAt,
        updatedAt: municipality.updatedAt,
        // Stripe Connect fields
        stripe_account_id: municipality.stripe_account_id,
        stripe_account_status: municipality.stripe_account_status,
        stripe_account_type: municipality.stripe_account_type,
        stripe_onboarding_completed: municipality.stripe_onboarding_completed,
        stripe_charges_enabled: municipality.stripe_charges_enabled,
        stripe_payouts_enabled: municipality.stripe_payouts_enabled,
        stripe_onboarding_started: municipality.stripe_onboarding_started,
        stripe_onboarding_completed_date:
          municipality.stripe_onboarding_completed_date,
        // Virtual field for payment setup status
        isPaymentSetupComplete: municipality.isPaymentSetupComplete,
      },
    });
  } catch (error) {
    console.error('Get municipality by slug error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve municipality',
    });
  }
});

// @route   GET /api/municipalities/:id
// @desc    Get municipality details (accepts ObjectId or slug)
// @access  Private (requires authentication)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Try to determine if it's an ObjectId or a slug
    let municipality;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a valid ObjectId format
      municipality = await Municipality.findById(id);
    } else {
      // It's likely a slug
      municipality = await Municipality.findOne({ slug: id });
    }

    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    // Any authenticated user can access any active municipality
    // Access control is handled at the module level via permissions

    // Convert module_config.modules Map to plain object for JSON serialization
    const moduleConfigForResponse = municipality.module_config
      ? {
          ...municipality.module_config.toObject(),
          modules: municipality.module_config.modules
            ? Object.fromEntries(municipality.module_config.modules)
            : {},
        }
      : null;

    res.json({
      success: true,
      municipality: {
        id: municipality._id,
        name: municipality.name,
        code: municipality.code,
        displayName: municipality.displayName,
        state: municipality.state,
        county: municipality.county,
        type: municipality.type,
        address: municipality.address,
        fullAddress: municipality.fullAddress,
        phone: municipality.phone,
        email: municipality.email,
        website: municipality.website,
        taxYear: municipality.taxYear,
        fiscalYearStart: municipality.fiscalYearStart,
        settings: municipality.settings,
        stats: municipality.stats,
        module_config: moduleConfigForResponse,
        is_active: municipality.is_active,
        setup_completed: municipality.setup_completed,
        createdAt: municipality.createdAt,
        updatedAt: municipality.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get municipality details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve municipality details',
    });
  }
});

// @route   GET /api/municipalities/:id/services
// @desc    Get enabled services for a municipality
// @access  Public
router.get('/:id/services', async (req, res) => {
  try {
    const { id } = req.params;

    const municipality = await Municipality.findById(id).select(
      'name code module_config',
    );

    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    if (!municipality.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Municipality services are currently unavailable',
      });
    }

    res.json({
      success: true,
      municipality: {
        id: municipality._id,
        name: municipality.name,
        code: municipality.code,
      },
      modules: municipality.module_config?.modules || new Map(),
    });
  } catch (error) {
    console.error('Get municipality services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve municipality services',
    });
  }
});

// @route   PUT /api/municipalities/:id
// @desc    Update municipality (System Admin only)
// @access  Private (System Admin)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is Avitar admin
    if (req.user.global_role !== 'avitar_admin') {
      return res.status(403).json({
        success: false,
        message: 'Avitar administrator access required',
      });
    }

    const municipality = await Municipality.findById(id);
    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    const {
      name,
      address,
      phone,
      email,
      website,
      taxYear,
      fiscalYearStart,
      settings,
    } = req.body;

    // Update allowed fields
    if (name) municipality.name = name;
    if (address) municipality.address = { ...municipality.address, ...address };
    if (phone) municipality.phone = phone;
    if (email) municipality.email = email;
    if (website) municipality.website = website;
    if (taxYear) municipality.taxYear = taxYear;
    if (fiscalYearStart) municipality.fiscalYearStart = fiscalYearStart;
    if (settings)
      municipality.settings = { ...municipality.settings, ...settings };

    await municipality.save();

    res.json({
      success: true,
      message: 'Municipality updated successfully',
      municipality: {
        id: municipality._id,
        name: municipality.name,
        displayName: municipality.displayName,
        address: municipality.address,
        fullAddress: municipality.fullAddress,
        phone: municipality.phone,
        email: municipality.email,
        website: municipality.website,
        taxYear: municipality.taxYear,
        fiscalYearStart: municipality.fiscalYearStart,
        settings: municipality.settings,
        updatedAt: municipality.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update municipality error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Municipality update failed',
    });
  }
});

// @route   POST /api/municipalities
// @desc    Create new municipality (System Admin only)
// @access  Private (System Admin)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check if user is Avitar admin
    if (req.user.global_role !== 'avitar_admin') {
      return res.status(403).json({
        success: false,
        message: 'Avitar administrator access required',
      });
    }

    const { name, code, state, county, type, address, phone, email, website } =
      req.body;

    // Check if municipality code already exists
    const existingMuni = await Municipality.findOne({
      code: code.toUpperCase(),
    });
    if (existingMuni) {
      return res.status(400).json({
        success: false,
        message: 'Municipality with this code already exists',
      });
    }

    const municipalityData = {
      name,
      code: code.toUpperCase(),
      state: state.toUpperCase(),
      county,
      type,
      address,
    };

    // Add optional fields
    if (phone) municipalityData.phone = phone;
    if (email) municipalityData.email = email;
    if (website) municipalityData.website = website;

    const municipality = new Municipality(municipalityData);
    await municipality.save();

    res.status(201).json({
      success: true,
      message: 'Municipality created successfully',
      municipality: {
        id: municipality._id,
        name: municipality.name,
        code: municipality.code,
        displayName: municipality.displayName,
        state: municipality.state,
        county: municipality.county,
        type: municipality.type,
        address: municipality.address,
        fullAddress: municipality.fullAddress,
        module_config: municipality.module_config,
        createdAt: municipality.createdAt,
      },
    });
  } catch (error) {
    console.error('Create municipality error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Municipality creation failed',
    });
  }
});

// ================================================================================
// USER MANAGEMENT ENDPOINTS FOR BUILDING PERMITS
// ================================================================================

// Helper function to generate temporary password
const generateTempPassword = () => {
  return crypto.randomBytes(8).toString('hex');
};

// Helper function to check if user can manage module users
const canManageModuleUsers = (user, municipalityId, module) => {
  // Avitar admins and staff can manage anyone
  if (['avitar_admin', 'avitar_staff'].includes(user.global_role)) {
    return true;
  }

  // Find user's permission for this municipality
  const userPerm = user.municipal_permissions?.find(
    (perm) => perm.municipality_id.toString() === municipalityId,
  );

  if (!userPerm) {
    return false;
  }

  // Check if user has admin role for this module
  const modulePerms = userPerm.module_permissions?.get(module);
  return modulePerms && modulePerms.role === 'admin';
};

// @route   GET /api/municipalities/:id/users
// @desc    Get users with access to a specific municipality and module
// @access  Private (requires admin role for module)
router.get('/:id/users', authenticateToken, async (req, res) => {
  try {
    const { id: municipalityId } = req.params;
    const { module } = req.query;

    // Check if user can manage users for this municipality/module
    if (module) {
      // If module specified, check module-specific permissions
      if (!canManageModuleUsers(req.user, municipalityId, module)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to manage users for this module',
        });
      }
    } else {
      // If no module specified, check general municipality admin permissions
      if (!['avitar_admin', 'avitar_staff'].includes(req.user.global_role)) {
        const userPerm = req.user.municipal_permissions?.find(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );
        if (!userPerm || userPerm.role !== 'admin') {
          return res.status(403).json({
            success: false,
            message:
              'You do not have permission to manage users for this municipality',
          });
        }
      }
    }

    // Find all users with access to this municipality - don't filter by global_role yet
    const users = await User.find({
      'municipal_permissions.municipality_id': municipalityId,
      is_active: true,
    }).select(
      'first_name last_name email phone last_login municipal_permissions global_role',
    );

    // Filter based on municipal role (not global role) and module access
    const isAvitarUser = ['avitar_admin', 'avitar_staff'].includes(
      req.user.global_role,
    );

    const filteredUsers = users
      .filter((user) => {
        const userPerm = user.municipal_permissions?.find(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );

        // If module specified, must have that specific module enabled
        if (module && !userPerm?.module_permissions?.has(module)) {
          return false;
        }

        // Check the user's role within this municipality (not their global role)
        const municipalRole = userPerm.role; // This is the role at municipality level

        // Exclude contractors at the municipal level (these are external contractors)
        if (municipalRole === 'contractor') {
          return false;
        }

        // If requesting user is NOT Avitar staff, also exclude Avitar users
        if (
          !isAvitarUser &&
          ['avitar_admin', 'avitar_staff'].includes(user.global_role)
        ) {
          return false;
        }

        return true;
      })
      .map((user) => {
        const userPerm = user.municipal_permissions?.find(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );
        const modulePerms = userPerm?.module_permissions?.get(module);

        // Convert Map to plain object for JSON serialization
        const restrictionsObj = {};
        if (modulePerms?.restrictions) {
          for (const [key, value] of modulePerms.restrictions) {
            restrictionsObj[key] = value;
          }
        }

        // Convert module_permissions Map to plain object
        const modulePermissionsObj = {};
        if (userPerm?.module_permissions) {
          for (const [modKey, modValue] of userPerm.module_permissions) {
            const modRestrictions = {};
            if (modValue.restrictions) {
              for (const [rKey, rValue] of modValue.restrictions) {
                modRestrictions[rKey] = rValue;
              }
            }
            modulePermissionsObj[modKey] = {
              ...modValue,
              restrictions: modRestrictions,
            };
          }
        }

        // Return municipal_permissions with converted Maps
        const munPermissions = user.municipal_permissions.map((perm) => {
          const permModules = {};
          if (perm.module_permissions) {
            for (const [modKey, modValue] of perm.module_permissions) {
              const modRestrictions = {};
              if (modValue.restrictions) {
                for (const [rKey, rValue] of modValue.restrictions) {
                  modRestrictions[rKey] = rValue;
                }
              }
              permModules[modKey] = {
                ...modValue,
                restrictions: modRestrictions,
              };
            }
          }
          return {
            ...(perm.toObject ? perm.toObject() : perm),
            module_permissions: permModules,
          };
        });

        return {
          _id: user._id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          last_login: user.last_login,
          municipal_permissions: munPermissions,
        };
      });

    res.json({
      success: true,
      users: filteredUsers,
    });
  } catch (error) {
    console.error('Get municipality users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users',
    });
  }
});

// @route   POST /api/municipalities/:id/users
// @desc    Add a new user to municipality with module permissions
// @access  Private (requires admin role for module)
router.post('/:id/users', authenticateToken, async (req, res) => {
  try {
    const { id: municipalityId } = req.params;
    const {
      email,
      first_name,
      last_name,
      phone,
      municipal_permissions: permissionsData,
    } = req.body;

    // Validate required fields
    if (!email || !first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: 'Email, first name, and last name are required',
      });
    }

    // Check if user can manage users for this municipality
    // Avitar admins and staff can manage anyone
    if (!['avitar_admin', 'avitar_staff'].includes(req.user.global_role)) {
      // Find user's permission for this municipality
      const userPerm = req.user.municipal_permissions?.find(
        (perm) => perm.municipality_id.toString() === municipalityId,
      );

      // User must have admin role at municipality level OR admin role for at least one module
      const isMunicipalityAdmin = userPerm?.role === 'admin';
      const hasModuleAdmin = userPerm?.module_permissions
        ? Array.from(userPerm.module_permissions.values()).some(
            (mp) => mp.role === 'admin',
          )
        : false;

      if (!isMunicipalityAdmin && !hasModuleAdmin) {
        return res.status(403).json({
          success: false,
          message:
            'You do not have permission to add users (requires admin role)',
        });
      }
    }

    // Check if user already exists
    let user = await User.findOne({ email: email.toLowerCase() });
    const tempPassword = generateTempPassword();
    const isNewUser = !user;

    if (isNewUser) {
      // Create new user
      user = new User({
        email: email.toLowerCase(),
        password: tempPassword, // Will be hashed by User model pre-save hook
        first_name,
        last_name,
        phone,
        global_role: 'municipal_user',
        is_active: true,
        municipal_permissions: [],
      });
    }

    // Get municipality info for email
    const municipality =
      await Municipality.findById(municipalityId).select('name type');
    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    // Check if user already has permissions for this municipality
    const existingPermIndex = user.municipal_permissions.findIndex(
      (perm) => perm.municipality_id.toString() === municipalityId,
    );

    // Get municipal role and department from request
    const municipalRole = permissionsData.role || 'staff';
    const department = permissionsData.department || undefined;

    // Create module permissions map from all modules in request
    const modulePermissions = new Map();
    if (permissionsData.module_permissions) {
      for (const [moduleName, moduleConfig] of Object.entries(
        permissionsData.module_permissions,
      )) {
        if (moduleConfig.enabled) {
          modulePermissions.set(moduleName, {
            enabled: true,
            role: moduleConfig.role || 'readonly',
            permissions: moduleConfig.permissions || ['read'],
            restrictions: new Map(
              Object.entries(moduleConfig.restrictions || {}),
            ),
          });
        }
      }
    }

    if (existingPermIndex >= 0) {
      // Update existing municipality permission
      user.municipal_permissions[existingPermIndex].role = municipalRole;
      user.municipal_permissions[existingPermIndex].department = department;
      user.municipal_permissions[existingPermIndex].module_permissions =
        modulePermissions;
    } else {
      // Add new municipality permission
      user.municipal_permissions.push({
        municipality_id: municipalityId,
        municipality_name: municipality.displayName || municipality.name,
        role: municipalRole,
        department: department,
        module_permissions: modulePermissions,
        created_by: req.user._id,
      });
    }

    await user.save();

    // Send email notification (only if email service is properly configured)
    const emailEnabled = process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM;

    if (emailEnabled) {
      try {
        let emailHtml, emailSubject;

        if (isNewUser) {
          // Email for brand new users
          emailSubject = `Welcome to ${municipality.displayName || municipality.name} - Building Permits Access`;
          emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <div style="text-align: center; padding: 20px 0;">
              <h1 style="color: #2563eb; margin: 0;">Welcome to Avitar Suite</h1>
            </div>

            <div style="padding: 20px; background-color: #f8fafc; border-radius: 6px; margin-bottom: 20px;">
              <h2 style="color: #1e293b; margin-top: 0;">Building Permits Access Granted</h2>
              <p style="color: #475569; line-height: 1.6;">
                You have been granted access to the <strong>Building Permits</strong> module for <strong>${municipality.displayName || municipality.name}</strong>.
              </p>
              <p style="color: #475569; line-height: 1.6;">
                A new Avitar Suite account has been created for you with the credentials below.
              </p>
            </div>

            <div style="padding: 20px; background-color: #fff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 20px;">
              <h3 style="color: #1e293b; margin-top: 0;">Your Login Credentials</h3>
              <p style="color: #475569; margin: 10px 0;"><strong>Email:</strong> ${email}</p>
              <p style="color: #475569; margin: 10px 0;"><strong>Temporary Password:</strong> <code style="background-color: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${tempPassword}</code></p>
              <p style="color: #dc2626; font-size: 14px; margin-top: 15px;">
                <strong>⚠️ Important:</strong> Please change your password immediately after your first login.
              </p>
            </div>

            <div style="padding: 20px; background-color: #ecfdf5; border: 1px solid #86efac; border-radius: 6px; margin-bottom: 20px;">
              <h3 style="color: #166534; margin-top: 0;">Your Role & Permissions</h3>
              <p style="color: #15803d; margin: 5px 0;"><strong>Role:</strong> ${permissionsData.module_permissions?.role || 'staff'}</p>
              ${
                permissionsData.module_permissions?.permissions?.length > 0
                  ? `<p style="color: #15803d; margin: 5px 0;"><strong>Permissions:</strong> ${permissionsData.module_permissions.permissions.join(', ')}</p>`
                  : ''
              }
            </div>

            <div style="text-align: center; padding: 20px 0;">
              <a href="${process.env.APP_URL || 'https://app.avitar.com'}"
                 style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                Log In to Avitar Suite
              </a>
            </div>

            <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
              <p>If you have any questions, please contact your system administrator.</p>
              <p style="margin-top: 10px;">© ${new Date().getFullYear()} Avitar Associates. All rights reserved.</p>
            </div>
          </div>
        `;
        } else {
          // Email for existing users - focus on module access granted
          emailSubject = `New Module Access Granted - ${municipality.displayName || municipality.name}`;
          emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <div style="text-align: center; padding: 20px 0;">
              <h1 style="color: #2563eb; margin: 0;">Module Access Granted</h1>
            </div>

            <div style="padding: 20px; background-color: #ecfdf5; border-radius: 6px; margin-bottom: 20px;">
              <h2 style="color: #166534; margin-top: 0;">You've Been Granted New Access</h2>
              <p style="color: #15803d; line-height: 1.6;">
                Your existing Avitar Suite account has been granted access to the <strong>Building Permits</strong> module for <strong>${municipality.displayName || municipality.name}</strong>.
              </p>
            </div>

            <div style="padding: 20px; background-color: #fff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 20px;">
              <h3 style="color: #1e293b; margin-top: 0;">Access Details</h3>
              <p style="color: #475569; margin: 10px 0;"><strong>Account Email:</strong> ${email}</p>
              <p style="color: #475569; margin: 10px 0;"><strong>Municipality:</strong> ${municipality.displayName || municipality.name}</p>
              <p style="color: #475569; margin: 10px 0;"><strong>Module:</strong> Building Permits</p>
              <p style="color: #0891b2; font-size: 14px; margin-top: 15px;">
                <strong>ℹ️ Note:</strong> Use your existing Avitar Suite password to access this module.
              </p>
            </div>

            <div style="padding: 20px; background-color: #ecfdf5; border: 1px solid #86efac; border-radius: 6px; margin-bottom: 20px;">
              <h3 style="color: #166534; margin-top: 0;">Your Role & Permissions</h3>
              <p style="color: #15803d; margin: 5px 0;"><strong>Role:</strong> ${permissionsData.module_permissions?.role || 'staff'}</p>
              ${
                permissionsData.module_permissions?.permissions?.length > 0
                  ? `<p style="color: #15803d; margin: 5px 0;"><strong>Permissions:</strong> ${permissionsData.module_permissions.permissions.join(', ')}</p>`
                  : ''
              }
              ${
                permissionsData.module_permissions?.restrictions?.specialties
                  ?.length > 0
                  ? `<p style="color: #15803d; margin: 5px 0;"><strong>Specialties:</strong> ${Array.from(permissionsData.module_permissions.restrictions.specialties).join(', ')}</p>`
                  : ''
              }
            </div>

            <div style="text-align: center; padding: 20px 0;">
              <a href="${process.env.APP_URL || 'https://app.avitar.com'}"
                 style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                Access ${municipality.displayName || municipality.name}
              </a>
            </div>

            <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
              <p>If you have any questions about this new access, please contact your system administrator.</p>
              <p style="margin-top: 10px;">© ${new Date().getFullYear()} Avitar Associates. All rights reserved.</p>
            </div>
          </div>
        `;
        }

        await emailService.sendEmail({
          to: email,
          subject: emailSubject,
          html: emailHtml,
        });

        console.log(
          `${isNewUser ? 'Welcome' : 'Module access'} email sent to ${email}`,
        );
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log(
        'Email notifications disabled - SENDGRID_API_KEY not configured',
      );
    }

    res.status(201).json({
      success: true,
      message: isNewUser
        ? 'New user account created and welcome email sent successfully'
        : `Existing user granted access to Building Permits module. Notification email sent to ${email}`,
      isNewUser,
      user: {
        _id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error('Add municipality user error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to add user',
    });
  }
});

// @route   PUT /api/municipalities/:id/users/:userId
// @desc    Update user information and module permissions
// @access  Private (requires admin role for module)
router.put('/:id/users/:userId', authenticateToken, async (req, res) => {
  try {
    const { id: municipalityId, userId } = req.params;
    const {
      first_name,
      last_name,
      phone,
      role,
      department,
      module_permissions,
    } = req.body;

    // Determine which module we're updating (from the permissions data)
    const module = 'building_permit'; // Default module

    // Check if user can manage users for this module
    if (!canManageModuleUsers(req.user, municipalityId, module)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update users for this module',
      });
    }

    // Find the user to update
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get municipality info for email
    const municipality =
      await Municipality.findById(municipalityId).select('name type');
    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    // Update basic user information
    if (first_name) user.first_name = first_name;
    if (last_name) user.last_name = last_name;
    if (phone !== undefined) user.phone = phone;

    // Update municipal permissions (role, department, and module permissions)
    const permIndex = user.municipal_permissions.findIndex(
      (perm) => perm.municipality_id.toString() === municipalityId,
    );

    if (permIndex >= 0) {
      // Update municipal role and department
      if (role) {
        user.municipal_permissions[permIndex].role = role;
      }
      if (department !== undefined) {
        user.municipal_permissions[permIndex].department =
          department || undefined;
      }

      // Update module permissions
      if (module_permissions) {
        const newModulePermissions = new Map();
        for (const [moduleName, moduleConfig] of Object.entries(
          module_permissions,
        )) {
          if (moduleConfig.enabled) {
            newModulePermissions.set(moduleName, {
              enabled: true,
              role: moduleConfig.role || 'readonly',
              permissions: moduleConfig.permissions || ['read'],
              restrictions: new Map(
                Object.entries(moduleConfig.restrictions || {}),
              ),
            });
          }
        }
        user.municipal_permissions[permIndex].module_permissions =
          newModulePermissions;
      }
    }

    await user.save();

    // Send email notification (only if email service is properly configured)
    const emailEnabled = process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM;

    if (emailEnabled) {
      try {
        const permIndex = user.municipal_permissions.findIndex(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );
        const modulePerms =
          user.municipal_permissions[permIndex].module_permissions.get(module);

        const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <div style="text-align: center; padding: 20px 0;">
            <h1 style="color: #2563eb; margin: 0;">Account Updated</h1>
          </div>

          <div style="padding: 20px; background-color: #f8fafc; border-radius: 6px; margin-bottom: 20px;">
            <h2 style="color: #1e293b; margin-top: 0;">Your Account Has Been Updated</h2>
            <p style="color: #475569; line-height: 1.6;">
              Your account information and permissions for <strong>${municipality.displayName || municipality.name}</strong> have been updated.
            </p>
          </div>

          <div style="padding: 20px; background-color: #fff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 20px;">
            <h3 style="color: #1e293b; margin-top: 0;">Updated Information</h3>
            <p style="color: #475569; margin: 10px 0;"><strong>Name:</strong> ${user.first_name} ${user.last_name}</p>
            <p style="color: #475569; margin: 10px 0;"><strong>Email:</strong> ${user.email}</p>
            ${phone ? `<p style="color: #475569; margin: 10px 0;"><strong>Phone:</strong> ${phone}</p>` : ''}
          </div>

          <div style="padding: 20px; background-color: #ecfdf5; border: 1px solid #86efac; border-radius: 6px; margin-bottom: 20px;">
            <h3 style="color: #166534; margin-top: 0;">Current Role & Permissions</h3>
            <p style="color: #15803d; margin: 5px 0;"><strong>Role:</strong> ${modulePerms?.role || 'N/A'}</p>
            ${
              modulePerms?.permissions?.length > 0
                ? `<p style="color: #15803d; margin: 5px 0;"><strong>Permissions:</strong> ${modulePerms.permissions.join(', ')}</p>`
                : ''
            }
          </div>

          <div style="text-align: center; padding: 20px 0;">
            <a href="${process.env.APP_URL || 'https://app.avitar.com'}"
               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Log In to Avitar Suite
            </a>
          </div>

          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
            <p>If you have questions about these changes, please contact your system administrator.</p>
            <p style="margin-top: 10px;">© ${new Date().getFullYear()} Avitar Associates. All rights reserved.</p>
          </div>
        </div>
      `;

        await emailService.sendEmail({
          to: user.email,
          subject: `Account Updated - ${municipality.displayName || municipality.name}`,
          html: emailHtml,
        });

        console.log(`Update notification email sent to ${user.email}`);
      } catch (emailError) {
        console.error('Failed to send update email:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log(
        'Email notifications disabled - SENDGRID_API_KEY not configured',
      );
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        _id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error('Update municipality user error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update user',
    });
  }
});

// @route   DELETE /api/municipalities/:id/users/:userId/modules/:module
// @desc    Remove user's access to a specific module
// @access  Private (requires admin role for module)
router.delete(
  '/:id/users/:userId/modules/:module',
  authenticateToken,
  async (req, res) => {
    try {
      const { id: municipalityId, userId, module } = req.params;

      // Check if user can manage users for this module
      if (!canManageModuleUsers(req.user, municipalityId, module)) {
        return res.status(403).json({
          success: false,
          message:
            'You do not have permission to remove users from this module',
        });
      }

      // Find the user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Get municipality info for email
      const municipality =
        await Municipality.findById(municipalityId).select('name type');
      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      // Find the municipal permission entry
      const permIndex = user.municipal_permissions.findIndex(
        (perm) => perm.municipality_id.toString() === municipalityId,
      );

      if (permIndex < 0) {
        return res.status(404).json({
          success: false,
          message: 'User does not have access to this municipality',
        });
      }

      // Remove the module from module_permissions
      const modulePermissions =
        user.municipal_permissions[permIndex].module_permissions;
      if (!modulePermissions.has(module)) {
        return res.status(404).json({
          success: false,
          message: 'User does not have access to this module',
        });
      }

      modulePermissions.delete(module);

      // If no modules left, remove the entire municipal permission entry
      if (modulePermissions.size === 0) {
        user.municipal_permissions.splice(permIndex, 1);
      }

      await user.save();

      // Send email notification (only if email service is properly configured)
      const emailEnabled =
        process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM;

      if (emailEnabled) {
        try {
          const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <div style="text-align: center; padding: 20px 0;">
              <h1 style="color: #dc2626; margin: 0;">Access Removed</h1>
            </div>

            <div style="padding: 20px; background-color: #fef2f2; border-radius: 6px; margin-bottom: 20px;">
              <h2 style="color: #991b1b; margin-top: 0;">Module Access Removed</h2>
              <p style="color: #7f1d1d; line-height: 1.6;">
                Your access to the <strong>Building Permits</strong> module for <strong>${municipality.displayName || municipality.name}</strong> has been removed.
              </p>
            </div>

            <div style="padding: 20px; background-color: #fff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 20px;">
              <h3 style="color: #1e293b; margin-top: 0;">Details</h3>
              <p style="color: #475569; margin: 10px 0;"><strong>User:</strong> ${user.first_name} ${user.last_name}</p>
              <p style="color: #475569; margin: 10px 0;"><strong>Email:</strong> ${user.email}</p>
              <p style="color: #475569; margin: 10px 0;"><strong>Municipality:</strong> ${municipality.displayName || municipality.name}</p>
              <p style="color: #475569; margin: 10px 0;"><strong>Module:</strong> Building Permits</p>
            </div>

            <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
              <p>If you believe this was done in error, please contact your system administrator.</p>
              <p style="margin-top: 10px;">© ${new Date().getFullYear()} Avitar Associates. All rights reserved.</p>
            </div>
          </div>
        `;

          await emailService.sendEmail({
            to: user.email,
            subject: `Access Removed - ${municipality.displayName || municipality.name}`,
            html: emailHtml,
          });

          console.log(
            `Access removal notification email sent to ${user.email}`,
          );
        } catch (emailError) {
          console.error('Failed to send removal email:', emailError);
          // Don't fail the request if email fails
        }
      } else {
        console.log(
          'Email notifications disabled - SENDGRID_API_KEY not configured',
        );
      }

      res.json({
        success: true,
        message: 'User removed from module successfully',
      });
    } catch (error) {
      console.error('Remove municipality user from module error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to remove user from module',
      });
    }
  },
);

// @route   GET /api/municipalities/:id/modules
// @desc    Get available modules and municipality's active modules
// @access  Private (requires authentication and municipality access)
router.get('/:id/modules', authenticateToken, async (req, res) => {
  try {
    const { id: municipalityId } = req.params;

    // Check if user has access to this municipality
    const userPerm = req.user.municipal_permissions?.find(
      (perm) => perm.municipality_id.toString() === municipalityId,
    );

    if (
      !userPerm &&
      !['avitar_admin', 'avitar_staff'].includes(req.user.global_role)
    ) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this municipality',
      });
    }

    // Get municipality to check active modules
    // Note: Include 'type' because displayName virtual depends on it
    const municipality = await Municipality.findById(municipalityId).select(
      'name type module_config',
    );

    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    // Get available modules from Stripe
    const availableModules = await getAvailableModules();

    // Get parcel count for pricing
    const parcelCount = await municipality.getParcelCount();

    // Get active modules for this municipality with subscription status
    const activeModules = [];
    if (municipality.module_config?.modules) {
      for (const [moduleName, moduleConfig] of municipality.module_config
        .modules) {
        if (moduleConfig.enabled) {
          activeModules.push({
            module: moduleName,
            tier: moduleConfig.tier,
            stripe_product_id: moduleConfig.stripe_product_id,
            activated_date: moduleConfig.activated_date,
            expiration_date: moduleConfig.expiration_date,
            subscription_status: moduleConfig.subscription_status || 'none',
            stripe_subscription_id: moduleConfig.stripe_subscription_id,
            trial_start: moduleConfig.trial_start,
            trial_end: moduleConfig.trial_end,
            current_period_start: moduleConfig.current_period_start,
            current_period_end: moduleConfig.current_period_end,
            parcel_count_at_purchase: moduleConfig.parcel_count_at_purchase,
          });
        }
      }
    }

    // Combine the data - mark which modules are active with full subscription details
    const modulesWithStatus = await Promise.all(
      availableModules.map(async (module) => {
        // Match by product ID first (most specific), then by tier + module name, then by module name only
        const activeModule = activeModules.find((am) => {
          // If both have product IDs and they match, this is the exact product
          if (
            am.stripe_product_id &&
            module.stripe_product_id &&
            am.stripe_product_id === module.stripe_product_id
          ) {
            return true;
          }

          // If no product ID match, but module names match and tiers match
          if (
            am.module === module.module &&
            am.tier &&
            module.tier &&
            am.tier === module.tier
          ) {
            return true;
          }

          // Fallback: only match by module name if no tier info available
          if (am.module === module.module && (!am.tier || !module.tier)) {
            return true;
          }

          return false;
        });

        console.log(`🔍 Module ${module.module} (tier: ${module.tier}):`, {
          hasActiveModule: !!activeModule,
          activeModuleData: activeModule,
          matchedByProductId:
            activeModule?.stripe_product_id === module.stripe_product_id,
          matchedByTier: activeModule?.tier === module.tier,
        });

        // Calculate access level and trial days
        let access_level = 'none';
        let trial_days_remaining = 0;

        // Calculate access level for any enabled module (not just those with subscriptions)
        if (activeModule) {
          access_level = municipality.getModuleAccessLevel(module.module);
          trial_days_remaining = municipality.getTrialDaysRemaining(
            module.module,
          );
          console.log(`  - access_level: ${access_level}`);
          console.log(`  - trial_days_remaining: ${trial_days_remaining}`);
        } else {
          console.log(`  - Module NOT in activeModules array`);
        }

        // Calculate pricing based on parcel count
        let calculated_pricing = null;
        let pricing_tiers = null;

        console.log(
          `📊 Pricing calculation for ${module.module}: parcelCount=${parcelCount}, has_default_pricing=${!!module.pricing}`,
        );

        if (parcelCount && parcelCount > 0) {
          // Municipality has parcel data - use this specific product's price
          try {
            // Use the product's default price directly (already in module.pricing)
            const priceId = module.pricing?.price_id;

            console.log(`  - Using priceId for ${module.name}: ${priceId}`);

            if (priceId) {
              // Use Stripe's calculation helper with the specific product's price
              const calculatedAmount = await calculatePriceForQuantity(
                priceId,
                parcelCount,
              );

              if (calculatedAmount !== null) {
                // Get price details for currency and interval
                const stripe = require('../services/stripeService').stripe;
                const price = await stripe.prices.retrieve(priceId);

                calculated_pricing = {
                  amount: calculatedAmount,
                  currency: price.currency.toUpperCase(),
                  interval: price.recurring?.interval || 'one_time',
                  interval_count: price.recurring?.interval_count || 1,
                  for_parcel_count: parcelCount,
                  price_id: priceId,
                };
                console.log(
                  `  ✅ Calculated pricing for ${module.name}:`,
                  calculated_pricing,
                );
              }
            }
          } catch (error) {
            console.error(
              `  ❌ Error getting price for ${module.name}:`,
              error.message,
            );
          }
        } else {
          // No parcel data - get tiered pricing examples for THIS specific product
          console.log(
            `  - No parcels, calculating example pricing for ${module.name}`,
          );
          try {
            const priceId = module.pricing?.price_id;
            if (priceId) {
              // Calculate pricing for example parcel counts using this product's price
              const exampleCounts = [1000, 2000, 3500];
              const tiers = [];

              for (const count of exampleCounts) {
                const amount = await calculatePriceForQuantity(priceId, count);
                if (amount !== null) {
                  const price =
                    await require('../services/stripeService').stripe.prices.retrieve(
                      priceId,
                    );
                  tiers.push({
                    parcel_count: count,
                    amount: amount,
                    currency: price.currency.toUpperCase(),
                    interval: price.recurring?.interval || 'one_time',
                    interval_count: price.recurring?.interval_count || 1,
                    price_id: priceId,
                  });
                }
              }

              if (tiers.length > 0) {
                pricing_tiers = tiers;
                console.log(
                  `  ✅ Calculated ${tiers.length} pricing tiers for ${module.name}`,
                );
              }
            }
          } catch (error) {
            console.error(
              `  ❌ Error getting tiered pricing for ${module.name}:`,
              error.message,
            );
          }
        }

        return {
          ...module,
          is_active: !!activeModule,
          active_tier: activeModule?.tier || null,
          activated_date: activeModule?.activated_date || null,
          expiration_date: activeModule?.expiration_date || null,
          // Only show subscription_status if this specific module has a subscription
          subscription_status: activeModule?.stripe_subscription_id
            ? activeModule.subscription_status || 'none'
            : 'none',
          access_level: access_level,
          // Only include trial info if this specific module is in trial
          trial_start: activeModule?.trial_start || null,
          trial_end: activeModule?.trial_end || null,
          trial_days_remaining: trial_days_remaining,
          // Only include billing period if this specific module has a subscription
          current_period_start: activeModule?.current_period_start || null,
          current_period_end: activeModule?.current_period_end || null,
          parcel_count_at_purchase:
            activeModule?.parcel_count_at_purchase || null,
          calculated_pricing: calculated_pricing,
          pricing_tiers: pricing_tiers,
        };
      }),
    );

    res.json({
      success: true,
      municipality: {
        id: municipality._id,
        name: municipality.displayName || municipality.name,
        parcel_count: parcelCount,
        billing_email: municipality.billing_email,
      },
      modules: modulesWithStatus,
      active_count: activeModules.length,
    });
  } catch (error) {
    console.error('Get municipality modules error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve modules',
    });
  }
});

// @route   GET /api/municipalities/:id/configuration/changes
// @desc    Check for configuration changes since a given timestamp
// @access  Private (requires authentication)
router.get(
  '/:id/configuration/changes',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { since } = req.query;

      // Get municipality
      const municipality = await Municipality.findById(id);
      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      // If no 'since' parameter, return current timestamp with no changes
      if (!since) {
        return res.json({
          success: true,
          lastModified: municipality.lastModified || new Date().toISOString(),
          changes: {},
        });
      }

      const sinceDate = new Date(since);

      // Check each configuration collection for changes since the given timestamp
      const Zone = require('../models/Zone');
      const LandLadder = require('../models/LandLadder');
      const Neighborhood = require('../models/Neighborhood');
      const BuildingCode = require('../models/BuildingCode');
      const BuildingFeatureCode = require('../models/BuildingFeatureCode');
      const PropertyAttribute = require('../models/PropertyAttribute');

      const [
        zonesChanged,
        landLaddersChanged,
        neighborhoodsChanged,
        buildingCodesChanged,
        featureCodesChanged,
        attributesChanged,
      ] = await Promise.all([
        Zone.exists({
          municipalityId: id,
          updatedAt: { $gt: sinceDate },
        }),
        LandLadder.exists({
          municipalityId: id,
          updatedAt: { $gt: sinceDate },
        }),
        Neighborhood.exists({
          municipalityId: id,
          updatedAt: { $gt: sinceDate },
        }),
        BuildingCode.exists({
          municipalityId: id,
          updatedAt: { $gt: sinceDate },
        }),
        BuildingFeatureCode.exists({
          municipalityId: id,
          updatedAt: { $gt: sinceDate },
        }),
        PropertyAttribute.exists({
          municipalityId: id,
          updatedAt: { $gt: sinceDate },
        }),
      ]);

      const changes = {
        zones: !!zonesChanged,
        landLadders: !!landLaddersChanged,
        neighborhoods: !!neighborhoodsChanged,
        buildingCodes: !!buildingCodesChanged,
        featureCodes: !!featureCodesChanged,
        propertyAttributes: !!attributesChanged,
      };

      res.json({
        success: true,
        lastModified: municipality.lastModified || new Date().toISOString(),
        changes,
      });
    } catch (error) {
      console.error('Get configuration changes error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check configuration changes',
      });
    }
  },
);

/**
 * GET /municipalities/:municipalityId/inspection-settings
 * Get inspection settings and list of inspectors
 * @access Municipal staff/admin
 */
router.get(
  '/:municipalityId/inspection-settings',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Verify user has access to this municipality
      const hasAccess = req.user.municipal_permissions?.some(
        (perm) =>
          perm.municipality_id.toString() === municipalityId &&
          ['admin', 'department_head', 'staff'].includes(perm.role),
      );

      if (
        !hasAccess &&
        !['avitar_staff', 'avitar_admin'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          error: 'You do not have permission to access inspection settings',
        });
      }

      // Get municipality with inspection settings
      const municipality = await Municipality.findById(municipalityId).select(
        'name inspectionSettings',
      );

      if (!municipality) {
        return res.status(404).json({ error: 'Municipality not found' });
      }

      // Get all users who are building inspectors in this municipality
      const inspectorUsers = await User.find({
        'municipal_permissions.municipality_id': municipalityId,
        'municipal_permissions.department': 'Building Inspector',
      })
        .select('first_name last_name email municipal_permissions')
        .lean();

      // Filter and format inspectors for this municipality
      const inspectors = inspectorUsers.map((user) => {
        const muniPerm = user.municipal_permissions.find(
          (p) => p.municipality_id.toString() === municipalityId,
        );

        // Find if this inspector is already in inspectionSettings
        const existingInspector =
          municipality.inspectionSettings?.inspectors?.find(
            (insp) => insp.userId?.toString() === user._id.toString(),
          );

        return {
          userId: user._id,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          department: muniPerm?.department,
          role: muniPerm?.role,
          // Use existing settings if available, otherwise defaults
          inspectionTypes: existingInspector?.inspectionTypes || [],
          maxPerDay: existingInspector?.maxPerDay || 8,
          isActive: existingInspector?.isActive ?? true,
        };
      });

      res.json({
        success: true,
        inspectionSettings: municipality.inspectionSettings || {
          availableTimeSlots: [],
          inspectors: [],
        },
        inspectors,
      });
    } catch (error) {
      console.error('❌ Error fetching inspection settings:', error);
      res.status(500).json({
        error: error.message || 'Failed to fetch inspection settings',
      });
    }
  },
);

/**
 * PUT /municipalities/:municipalityId/inspection-settings/availability
 * Update general inspection availability time slots
 * @access Municipal admin/staff
 */
router.put(
  '/:municipalityId/inspection-settings/availability',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { availableTimeSlots } = req.body;

      // Verify user has admin or staff access
      const hasAccess = req.user.municipal_permissions?.some(
        (perm) =>
          perm.municipality_id.toString() === municipalityId &&
          ['admin', 'department_head', 'staff'].includes(perm.role),
      );

      if (
        !hasAccess &&
        !['avitar_staff', 'avitar_admin'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          error: 'You do not have permission to update inspection availability',
        });
      }

      // Validate time slots
      if (!Array.isArray(availableTimeSlots)) {
        return res
          .status(400)
          .json({ error: 'availableTimeSlots must be an array' });
      }

      for (const slot of availableTimeSlots) {
        if (
          typeof slot.dayOfWeek !== 'number' ||
          slot.dayOfWeek < 0 ||
          slot.dayOfWeek > 6
        ) {
          return res
            .status(400)
            .json({ error: 'Invalid dayOfWeek (must be 0-6)' });
        }

        if (
          !slot.startTime ||
          !slot.endTime ||
          !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(slot.startTime) ||
          !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(slot.endTime)
        ) {
          return res
            .status(400)
            .json({ error: 'Invalid time format (must be HH:MM)' });
        }

        if (
          slot.slotDuration &&
          (slot.slotDuration < 15 || slot.slotDuration > 480)
        ) {
          return res
            .status(400)
            .json({ error: 'slotDuration must be between 15 and 480 minutes' });
        }
      }

      // Update municipality
      const municipality = await Municipality.findByIdAndUpdate(
        municipalityId,
        {
          'inspectionSettings.availableTimeSlots': availableTimeSlots,
          lastModified: new Date(),
        },
        { new: true, runValidators: true },
      ).select('inspectionSettings');

      res.json({
        success: true,
        inspectionSettings: municipality.inspectionSettings,
      });
    } catch (error) {
      console.error('Error updating inspection availability:', error);
      res.status(500).json({
        error: error.message || 'Failed to update inspection availability',
      });
    }
  },
);

/**
 * PUT /municipalities/:municipalityId/inspection-settings/inspectors
 * Update inspector list and their settings
 * @access Municipal admin/staff
 */
router.put(
  '/:municipalityId/inspection-settings/inspectors',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { inspectors } = req.body;

      // Verify user has admin access
      const hasAccess = req.user.municipal_permissions?.some(
        (perm) =>
          perm.municipality_id.toString() === municipalityId &&
          ['admin', 'department_head', 'staff'].includes(perm.role),
      );

      if (
        !hasAccess &&
        !['avitar_staff', 'avitar_admin'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          error: 'You do not have permission to update inspector settings',
        });
      }

      // Validate inspectors
      if (!Array.isArray(inspectors)) {
        return res.status(400).json({ error: 'inspectors must be an array' });
      }

      for (const inspector of inspectors) {
        if (!inspector.userId) {
          return res
            .status(400)
            .json({ error: 'Each inspector must have a userId' });
        }

        if (
          inspector.maxPerDay &&
          (inspector.maxPerDay < 1 || inspector.maxPerDay > 20)
        ) {
          return res
            .status(400)
            .json({ error: 'maxPerDay must be between 1 and 20' });
        }

        if (
          inspector.inspectionTypes &&
          !Array.isArray(inspector.inspectionTypes)
        ) {
          return res
            .status(400)
            .json({ error: 'inspectionTypes must be an array' });
        }
      }

      // Update municipality
      const municipality = await Municipality.findByIdAndUpdate(
        municipalityId,
        {
          'inspectionSettings.inspectors': inspectors,
          lastModified: new Date(),
        },
        { new: true, runValidators: true },
      ).select('inspectionSettings');

      res.json({
        success: true,
        inspectionSettings: municipality.inspectionSettings,
      });
    } catch (error) {
      console.error('Error updating inspector settings:', error);
      res.status(500).json({
        error: error.message || 'Failed to update inspector settings',
      });
    }
  },
);

/**
 * GET /municipalities/:municipalityId/inspections/today-count
 * Get count of today's inspections for badge display
 */
router.get(
  '/:municipalityId/inspections/today-count',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Verify user has access to municipality
      const hasAccess = req.user.municipal_permissions?.some(
        (perm) =>
          perm.municipality_id.toString() === municipalityId &&
          ['admin', 'department_head', 'staff'].includes(perm.role),
      );

      if (
        !hasAccess &&
        !['avitar_staff', 'avitar_admin'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          error: 'You do not have permission to view inspection data',
        });
      }

      const PermitInspection = require('../models/PermitInspection');
      const mongoose = require('mongoose');

      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      const count = await PermitInspection.countDocuments({
        municipalityId: new mongoose.Types.ObjectId(municipalityId),
        isActive: true,
        scheduledDate: {
          $gte: startOfToday,
          $lte: endOfToday,
        },
      });

      res.json({ count });
    } catch (error) {
      console.error("Error fetching today's inspection count:", error);
      res.status(500).json({
        error: 'Failed to fetch inspection count',
        message: error.message,
      });
    }
  },
);

module.exports = router;
