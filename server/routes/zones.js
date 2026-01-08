const express = require('express');
const Zone = require('../models/Zone');
const LandLadder = require('../models/LandLadder');
const NeighborhoodCode = require('../models/NeighborhoodCode');
const SiteCondition = require('../models/SiteCondition');
const DrivewayType = require('../models/DrivewayType');
const RoadType = require('../models/RoadType');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/moduleAuth');
const updateMunicipalityTimestamp = require('../middleware/updateMunicipalityTimestamp');
const {
  checkYearLock,
  getEffectiveYear,
  isYearLocked,
} = require('../middleware/checkYearLock');

const router = express.Router();

// @route   GET /api/municipalities/:municipalityId/zones
// @desc    Get all zones for a municipality
// @access  Private (requires Assessing module access)
router.get(
  '/municipalities/:municipalityId/zones',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      const zones = await Zone.findByMunicipality(municipalityId);

      res.json({
        success: true,
        zones,
      });
    } catch (error) {
      console.error('Get zones error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve zones',
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/zones
// @desc    Create a new zone
// @access  Private (requires Assessing module access)
router.post(
  '/municipalities/:municipalityId/zones',
  authenticateToken,
  requireModuleAccess('assessing'),
  updateMunicipalityTimestamp,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        name,
        description,
        minimumAcreage,
        minimumFrontage,
        excessLandCostPerAcre,
        baseViewValue,
      } = req.body;

      const zone = new Zone({
        name,
        description,
        minimumAcreage,
        minimumFrontage,
        excessLandCostPerAcre: excessLandCostPerAcre || 0,
        baseViewValue: baseViewValue || 0,
        municipalityId,
      });

      await zone.save();

      res.status(201).json({
        success: true,
        zone,
      });
    } catch (error) {
      console.error('Create zone error:', error);

      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(error.errors).map((e) => e.message),
        });
      }

      // Handle duplicate key error
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'A zone with this name already exists in this municipality',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create zone',
      });
    }
  },
);

// @route   PUT /api/municipalities/:municipalityId/zones/:zoneId
// @desc    Update a zone
// @access  Private (requires Assessing module access)
router.put(
  '/municipalities/:municipalityId/zones/:zoneId',
  authenticateToken,
  requireModuleAccess('assessing'),
  updateMunicipalityTimestamp,
  async (req, res) => {
    try {
      const { municipalityId, zoneId } = req.params;
      const {
        name,
        description,
        minimumAcreage,
        minimumFrontage,
        excessLandCostPerAcre,
        baseViewValue,
      } = req.body;

      const zone = await Zone.findOneAndUpdate(
        { _id: zoneId, municipalityId, isActive: true },
        {
          name,
          description,
          minimumAcreage,
          minimumFrontage,
          excessLandCostPerAcre: excessLandCostPerAcre || 0,
          baseViewValue: baseViewValue || 0,
        },
        { new: true, runValidators: true },
      );

      if (!zone) {
        return res.status(404).json({
          success: false,
          message: 'Zone not found',
        });
      }

      res.json({
        success: true,
        zone,
      });
    } catch (error) {
      console.error('Update zone error:', error);

      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(error.errors).map((e) => e.message),
        });
      }

      // Handle duplicate key error
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'A zone with this name already exists in this municipality',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update zone',
      });
    }
  },
);

// @route   DELETE /api/municipalities/:municipalityId/zones/:zoneId
// @desc    Delete a zone (soft delete)
// @access  Private (requires Assessing module access)
router.delete(
  '/municipalities/:municipalityId/zones/:zoneId',
  authenticateToken,
  requireModuleAccess('assessing'),
  updateMunicipalityTimestamp,
  async (req, res) => {
    try {
      const { municipalityId, zoneId } = req.params;

      const zone = await Zone.findOneAndUpdate(
        { _id: zoneId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      if (!zone) {
        return res.status(404).json({
          success: false,
          message: 'Zone not found',
        });
      }

      res.json({
        success: true,
        message: 'Zone deleted successfully',
      });
    } catch (error) {
      console.error('Delete zone error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete zone',
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/land-ladders
// @desc    Get all land ladders for a municipality (grouped by zone)
// @access  Private (requires Assessing module access)
// @query   year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/land-ladders',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const year = getEffectiveYear(req);

      // Use year-aware query method
      const landLadders = await LandLadder.findGroupedByZoneForYear(
        municipalityId,
        year,
      );

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        success: true,
        landLadders: landLadders || [],
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Get land ladders error:', error);
      // Return empty array instead of error when no land ladders exist
      res.json({
        success: true,
        landLadders: [],
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/zones/:zoneId/land-ladder
// @desc    Get land ladder tiers for a specific zone
// @access  Private (requires Assessing module access)
// @query   year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/zones/:zoneId/land-ladder',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId, zoneId } = req.params;
      const year = getEffectiveYear(req);

      // Use year-aware query method
      const tiers = await LandLadder.findByZoneForYear(zoneId, year);

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        success: true,
        tiers,
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Get zone land ladder error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve zone land ladder',
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/zones/:zoneId/land-ladder
// @desc    Add a new tier to a zone's land ladder
// @access  Private (requires Assessing module access)
// @body    effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/zones/:zoneId/land-ladder',
  authenticateToken,
  requireModuleAccess('assessing'),
  checkYearLock,
  updateMunicipalityTimestamp,
  async (req, res) => {
    try {
      const { municipalityId, zoneId } = req.params;
      const { acreage, value, effective_year } = req.body;

      // Require effective_year
      if (!effective_year) {
        return res.status(400).json({
          success: false,
          message: 'effective_year is required',
        });
      }

      // Get the next order number for this zone and year
      const lastTier = await LandLadder.findOne({
        zoneId,
        effective_year,
        isActive: true,
      }).sort({ order: -1 });
      const order = lastTier ? lastTier.order + 1 : 0;

      const tier = new LandLadder({
        acreage,
        value,
        order,
        zoneId,
        municipalityId,
        effective_year,
      });

      await tier.save();

      res.status(201).json({
        success: true,
        tier,
      });
    } catch (error) {
      console.error('Create land ladder tier error:', error);

      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(error.errors).map((e) => e.message),
        });
      }

      // Handle duplicate acreage error
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message:
            'A tier with this acreage already exists for this zone and year',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create land ladder tier',
      });
    }
  },
);

// @route   PUT /api/municipalities/:municipalityId/zones/:zoneId/land-ladder/:tierId
// @desc    Update a land ladder tier
// @access  Private (requires Assessing module access)
// Supports copy-on-write: if editing an inherited tier from a locked year,
// creates a new tier for the target year instead of modifying the original
router.put(
  '/municipalities/:municipalityId/zones/:zoneId/land-ladder/:tierId',
  authenticateToken,
  requireModuleAccess('assessing'),
  updateMunicipalityTimestamp,
  async (req, res) => {
    try {
      const { municipalityId, zoneId, tierId } = req.params;
      const { acreage, value } = req.body;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

      // First, find the tier to check its effective_year
      const existingTier = await LandLadder.findOne({
        _id: tierId,
        zoneId,
        municipalityId,
        isActive: true,
      });

      if (!existingTier) {
        return res.status(404).json({
          success: false,
          message: 'Land ladder tier not found',
        });
      }

      const sourceYear = existingTier.effective_year;
      const sourceYearLocked = await isYearLocked(municipalityId, sourceYear);
      const isInherited = sourceYear !== targetYear;

      // If editing an inherited tier OR the source year is locked, use copy-on-write
      if (isInherited || sourceYearLocked) {
        // Check if the target year is locked
        const targetYearLocked = await isYearLocked(municipalityId, targetYear);
        if (targetYearLocked) {
          return res.status(403).json({
            success: false,
            message: `Configuration for year ${targetYear} is locked and cannot be modified.`,
            isYearLocked: true,
          });
        }

        // Check if a tier with this acreage already exists for target year
        const existingTargetTier = await LandLadder.findOne({
          zoneId,
          acreage,
          effective_year: targetYear,
          isActive: true,
        });

        if (existingTargetTier) {
          // Update the existing target year tier instead
          const updatedTier = await LandLadder.findOneAndUpdate(
            { _id: existingTargetTier._id },
            { acreage, value },
            { new: true, runValidators: true },
          );

          return res.json({
            success: true,
            tier: updatedTier,
            copyOnWrite: true,
            message: `Updated existing tier for year ${targetYear}`,
          });
        }

        // Create a new tier for the target year (copy-on-write)
        const newTier = new LandLadder({
          acreage,
          value,
          order: existingTier.order,
          zoneId,
          municipalityId,
          effective_year: targetYear,
          effective_year_end: null, // New tier is open-ended
          previous_version_id: tierId, // Link to the tier we're replacing
          next_version_id: null,
          isActive: true,
        });

        await newTier.save();

        // Update the source tier:
        // 1. Set effective_year_end to mark when it stops being active
        // 2. Set next_version_id to link to the new tier
        await LandLadder.findByIdAndUpdate(tierId, {
          effective_year_end: targetYear,
          next_version_id: newTier._id,
        });

        return res.status(201).json({
          success: true,
          tier: newTier,
          copyOnWrite: true,
          previousVersionId: tierId,
          message: `Created new tier for year ${targetYear} (supersedes tier from ${sourceYear})`,
        });
      }

      // Direct update for non-inherited, non-locked tiers
      const tier = await LandLadder.findOneAndUpdate(
        { _id: tierId, zoneId, municipalityId, isActive: true },
        { acreage, value },
        { new: true, runValidators: true },
      );

      res.json({
        success: true,
        tier,
      });
    } catch (error) {
      console.error('Update land ladder tier error:', error);

      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(error.errors).map((e) => e.message),
        });
      }

      // Handle duplicate acreage error
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message:
            'A tier with this acreage already exists for this zone and year',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update land ladder tier',
      });
    }
  },
);

// @route   DELETE /api/municipalities/:municipalityId/zones/:zoneId/land-ladder/:tierId
// @desc    Delete a land ladder tier
// @access  Private (requires Assessing module access)
// Supports temporal deletion: if deleting an inherited tier from a locked year,
// marks it as ending in the target year instead of permanently deleting
router.delete(
  '/municipalities/:municipalityId/zones/:zoneId/land-ladder/:tierId',
  authenticateToken,
  requireModuleAccess('assessing'),
  updateMunicipalityTimestamp,
  async (req, res) => {
    try {
      const { municipalityId, zoneId, tierId } = req.params;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

      // First, find the tier to check its effective_year
      const existingTier = await LandLadder.findOne({
        _id: tierId,
        zoneId,
        municipalityId,
        isActive: true,
      });

      if (!existingTier) {
        return res.status(404).json({
          success: false,
          message: 'Land ladder tier not found',
        });
      }

      const sourceYear = existingTier.effective_year;
      const sourceYearLocked = await isYearLocked(municipalityId, sourceYear);
      const isInherited = sourceYear !== targetYear;

      // If deleting an inherited tier OR the source year is locked, use temporal deletion
      if (isInherited || sourceYearLocked) {
        // Check if the target year is locked
        const targetYearLocked = await isYearLocked(municipalityId, targetYear);
        if (targetYearLocked) {
          return res.status(403).json({
            success: false,
            message: `Configuration for year ${targetYear} is locked and cannot be modified.`,
            isYearLocked: true,
          });
        }

        // Temporal delete: mark the tier as ending in the target year
        // This hides it for targetYear and all future years
        await LandLadder.findByIdAndUpdate(tierId, {
          effective_year_end: targetYear,
        });

        return res.json({
          success: true,
          message: `Land ladder tier hidden for year ${targetYear} and beyond`,
          temporalDelete: true,
          effectiveYearEnd: targetYear,
        });
      }

      // Direct delete for tiers from the current unlocked year
      await LandLadder.findOneAndUpdate(
        { _id: tierId, zoneId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      res.json({
        success: true,
        message: 'Land ladder tier deleted successfully',
      });
    } catch (error) {
      console.error('Delete land ladder tier error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete land ladder tier',
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/neighborhoods
// @desc    Get all neighborhoods for a municipality
// @access  Private (requires Assessing module access)
// @query   year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/neighborhoods',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const year = getEffectiveYear(req);

      // Use year-aware query method
      const neighborhoods = await NeighborhoodCode.findByMunicipalityForYear(
        municipalityId,
        year,
      );

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        success: true,
        neighborhoods,
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Get neighborhoods error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve neighborhoods',
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/site-conditions
// @desc    Get all site conditions for a municipality
// @access  Private (requires Assessing module access)
router.get(
  '/municipalities/:municipalityId/site-conditions',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      const siteConditions =
        await SiteCondition.findByMunicipality(municipalityId);

      res.json({
        success: true,
        siteConditions,
      });
    } catch (error) {
      console.error('Get site conditions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve site conditions',
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/driveway-types
// @desc    Get all driveway types for a municipality
// @access  Private (requires Assessing module access)
router.get(
  '/municipalities/:municipalityId/driveway-types',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      const drivewayTypes =
        await DrivewayType.findByMunicipality(municipalityId);

      res.json({
        success: true,
        drivewayTypes,
      });
    } catch (error) {
      console.error('Get driveway types error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve driveway types',
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/road-types
// @desc    Get all road types for a municipality
// @access  Private (requires Assessing module access)
router.get(
  '/municipalities/:municipalityId/road-types',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      const roadTypes = await RoadType.findByMunicipality(municipalityId);

      res.json({
        success: true,
        roadTypes,
      });
    } catch (error) {
      console.error('Get road types error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve road types',
      });
    }
  },
);

module.exports = router;
