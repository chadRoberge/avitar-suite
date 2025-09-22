const express = require('express');
const Municipality = require('../models/Municipality');
const { authenticateToken } = require('../middleware/auth');
const { PERMISSION_LEVELS } = require('../config/permissions');

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

    // Check if user belongs to this municipality or is Avitar staff
    const hasAccess =
      ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
      req.user.municipal_permissions?.some(
        (perm) =>
          perm.municipality_id.toString() === municipality._id.toString(),
      );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this municipality',
      });
    }

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
        isActive: municipality.is_active,
        setupCompleted: municipality.setup_completed,
        createdAt: municipality.createdAt,
        updatedAt: municipality.updatedAt,
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
// @desc    Get municipality details
// @access  Private (requires authentication)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const municipality = await Municipality.findById(id);
    if (!municipality) {
      return res.status(404).json({
        success: false,
        message: 'Municipality not found',
      });
    }

    // Check if user belongs to this municipality or is Avitar staff
    const hasAccess =
      ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
      req.user.municipal_permissions?.some(
        (perm) => perm.municipality_id.toString() === id,
      );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this municipality',
      });
    }

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
        module_config: municipality.module_config,
        isActive: municipality.is_active,
        setupCompleted: municipality.setup_completed,
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

module.exports = router;
