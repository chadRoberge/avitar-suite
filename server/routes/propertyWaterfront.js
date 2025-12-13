const express = require('express');
const PropertyWaterfront = require('../models/PropertyWaterfront');
const WaterBody = require('../models/WaterBody');
const WaterfrontAttribute = require('../models/WaterfrontAttribute');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/moduleAuth');

const router = express.Router();

// @route   GET /api/properties/:propertyId/waterfront
// @desc    Get all waterfronts for a property
// @access  Private (requires Assessing module access)
router.get(
  '/properties/:propertyId/waterfront',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { propertyId } = req.params;

      console.log('Fetching waterfronts for propertyId:', propertyId);
      const waterfronts = await PropertyWaterfront.findByProperty(propertyId);
      console.log('Found waterfronts:', waterfronts.length, 'items');

      res.json({
        success: true,
        waterfronts,
      });
    } catch (error) {
      console.error('Get property waterfronts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve property waterfronts',
      });
    }
  },
);

// @route   POST /api/properties/:propertyId/waterfront
// @desc    Create a new property waterfront
// @access  Private (requires Assessing module access)
router.post(
  '/properties/:propertyId/waterfront',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { propertyId } = req.params;
      const {
        water_body_id,
        water_body_name,
        frontage,
        frontage_factor,
        access_id,
        access_name,
        access_factor,
        topography_id,
        topography_name,
        topography_factor,
        location_id,
        location_name,
        location_factor,
        condition,
        condition_factor,
        current_use,
        base_value,
        calculated_value,
        assessed_value,
        municipalityId,
      } = req.body;

      console.log('Creating PropertyWaterfront with:', {
        propertyId,
        municipalityId,
        water_body_id,
        frontage,
        access_id,
        topography_id,
        location_id,
        condition,
        current_use,
      });

      const propertyWaterfront = new PropertyWaterfront({
        propertyId,
        municipalityId,
        waterBodyId: water_body_id,
        waterBodyName: water_body_name,
        frontage,
        frontageFactor: frontage_factor ?? 1.0,
        accessId: access_id,
        accessName: access_name,
        accessFactor: access_factor,
        topographyId: topography_id,
        topographyName: topography_name,
        topographyFactor: topography_factor,
        locationId: location_id,
        locationName: location_name,
        locationFactor: location_factor,
        condition: condition ?? 100,
        currentUse: current_use || false,
        baseValue: base_value,
      });

      console.log(
        'PropertyWaterfront before save:',
        propertyWaterfront.toObject(),
      );

      await propertyWaterfront.save();

      console.log(
        'Calculated value after save:',
        propertyWaterfront.calculatedValue,
      );
      console.log(
        'Assessed value after save:',
        propertyWaterfront.assessedValue,
      );

      // Trigger land assessment recalculation for this property
      try {
        const LandAssessmentCalculationService = require('../services/landAssessmentCalculationService');
        const calculationService = new LandAssessmentCalculationService();

        console.log(
          '🔄 Triggering land assessment recalculation for property:',
          propertyId,
        );
        await calculationService.recalculatePropertyAssessment(propertyId);
        console.log('✅ Land assessment recalculation completed');
      } catch (error) {
        console.error(
          '⚠️ Failed to recalculate land assessment after waterfront creation:',
          error,
        );
        // Don't fail the waterfront creation if land assessment recalculation fails
      }

      res.status(201).json({
        success: true,
        waterfront: propertyWaterfront,
      });
    } catch (error) {
      console.error('Create property waterfront error:', error);

      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(error.errors).map((e) => e.message),
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create property waterfront',
      });
    }
  },
);

// @route   PUT /api/properties/:propertyId/waterfront/:waterfrontId
// @desc    Update a property waterfront
// @access  Private (requires Assessing module access)
router.put(
  '/properties/:propertyId/waterfront/:waterfrontId',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { propertyId, waterfrontId } = req.params;
      const {
        water_body_id,
        water_body_name,
        frontage,
        frontage_factor,
        access_id,
        access_name,
        access_factor,
        topography_id,
        topography_name,
        topography_factor,
        location_id,
        location_name,
        location_factor,
        condition,
        condition_factor,
        current_use,
        base_value,
      } = req.body;

      console.log('Updating PropertyWaterfront:', waterfrontId);

      // Find the existing waterfront first
      const propertyWaterfront = await PropertyWaterfront.findOne({
        _id: waterfrontId,
        propertyId,
        isActive: true,
      });

      if (!propertyWaterfront) {
        return res.status(404).json({
          success: false,
          message: 'Property waterfront not found',
        });
      }

      // Update the properties
      propertyWaterfront.waterBodyId = water_body_id;
      propertyWaterfront.waterBodyName = water_body_name;
      propertyWaterfront.frontage = frontage;
      propertyWaterfront.frontageFactor = frontage_factor ?? 1.0;
      propertyWaterfront.accessId = access_id;
      propertyWaterfront.accessName = access_name;
      propertyWaterfront.accessFactor = access_factor;
      propertyWaterfront.topographyId = topography_id;
      propertyWaterfront.topographyName = topography_name;
      propertyWaterfront.topographyFactor = topography_factor;
      propertyWaterfront.locationId = location_id;
      propertyWaterfront.locationName = location_name;
      propertyWaterfront.locationFactor = location_factor;
      propertyWaterfront.condition = condition ?? 100;
      propertyWaterfront.currentUse = current_use || false;
      propertyWaterfront.baseValue = base_value;

      // Save the waterfront (this will trigger pre-save middleware and recalculate the value)
      await propertyWaterfront.save();

      // Trigger land assessment recalculation for this property
      try {
        const LandAssessmentCalculationService = require('../services/landAssessmentCalculationService');
        const calculationService = new LandAssessmentCalculationService();

        console.log(
          '🔄 Triggering land assessment recalculation for property:',
          propertyId,
        );
        await calculationService.recalculatePropertyAssessment(propertyId);
        console.log('✅ Land assessment recalculation completed');
      } catch (error) {
        console.error(
          '⚠️ Failed to recalculate land assessment after waterfront update:',
          error,
        );
        // Don't fail the waterfront update if land assessment recalculation fails
      }

      res.json({
        success: true,
        waterfront: propertyWaterfront,
      });
    } catch (error) {
      console.error('Update property waterfront error:', error);

      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(error.errors).map((e) => e.message),
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update property waterfront',
      });
    }
  },
);

// @route   DELETE /api/properties/:propertyId/waterfront/:waterfrontId
// @desc    Delete a property waterfront (soft delete)
// @access  Private (requires Assessing module access)
router.delete(
  '/properties/:propertyId/waterfront/:waterfrontId',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { propertyId, waterfrontId } = req.params;

      const propertyWaterfront = await PropertyWaterfront.findOneAndUpdate(
        { _id: waterfrontId, propertyId, isActive: true },
        { isActive: false },
        { new: true },
      );

      if (!propertyWaterfront) {
        return res.status(404).json({
          success: false,
          message: 'Property waterfront not found',
        });
      }

      // Trigger land assessment recalculation for this property
      try {
        const LandAssessmentCalculationService = require('../services/landAssessmentCalculationService');
        const calculationService = new LandAssessmentCalculationService();

        console.log(
          '🔄 Triggering land assessment recalculation for property:',
          propertyId,
        );
        await calculationService.recalculatePropertyAssessment(propertyId);
        console.log('✅ Land assessment recalculation completed');
      } catch (error) {
        console.error(
          '⚠️ Failed to recalculate land assessment after waterfront deletion:',
          error,
        );
        // Don't fail the waterfront deletion if land assessment recalculation fails
      }

      res.json({
        success: true,
        message: 'Property waterfront deleted successfully',
      });
    } catch (error) {
      console.error('Delete property waterfront error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete property waterfront',
      });
    }
  },
);

module.exports = router;
