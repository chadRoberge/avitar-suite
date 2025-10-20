const express = require('express');
const PropertyView = require('../models/PropertyView');
const ViewAttribute = require('../models/ViewAttribute');
const Zone = require('../models/Zone');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/moduleAuth');

const router = express.Router();

// @route   GET /api/properties/:propertyId/views
// @desc    Get all views for a property
// @access  Private (requires Assessing module access)
router.get(
  '/properties/:propertyId/views',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { propertyId } = req.params;

      console.log('Fetching views for propertyId:', propertyId);
      const views = await PropertyView.findByProperty(propertyId);
      console.log('Found views:', views.length, 'items');

      // Log first few results for debugging
      if (views.length > 0) {
        console.log('First view:', JSON.stringify(views[0], null, 2));
        if (views.length > 1) {
          console.log(
            'Sample view propertyIds:',
            views.slice(0, 5).map((v) => v.propertyId),
          );
        }
      }

      res.json({
        success: true,
        views,
      });
    } catch (error) {
      console.error('Get property views error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve property views',
      });
    }
  },
);

// @route   POST /api/properties/:propertyId/views
// @desc    Create a new property view
// @access  Private (requires Assessing module access)
router.post(
  '/properties/:propertyId/views',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { propertyId } = req.params;
      const {
        subjectId,
        widthId,
        distanceId,
        depthId,
        conditionFactor,
        conditionNotes,
        baseValue,
        municipalityId,
      } = req.body;

      // Fetch the view attributes to get current values
      const [subject, width, distance, depth] = await Promise.all([
        ViewAttribute.findByMunicipalityAndId(municipalityId, subjectId),
        ViewAttribute.findByMunicipalityAndId(municipalityId, widthId),
        ViewAttribute.findByMunicipalityAndId(municipalityId, distanceId),
        ViewAttribute.findByMunicipalityAndId(municipalityId, depthId),
      ]);

      if (!subject || !width || !distance || !depth) {
        return res.status(400).json({
          success: false,
          message: 'One or more view attributes not found',
        });
      }

      console.log('Creating PropertyView with:', {
        propertyId,
        municipalityId,
        subjectId,
        widthId,
        distanceId,
        depthId,
        subjectName: subject.name,
        subjectFactor: subject.factor / 100,
        widthName: width.name,
        widthFactor: width.factor / 100,
        distanceName: distance.name,
        distanceFactor: distance.factor / 100,
        depthName: depth.name,
        depthFactor: depth.factor / 100,
        conditionFactor: conditionFactor || 1.0,
        conditionNotes: conditionNotes || '',
        baseValue,
      });

      const propertyView = new PropertyView({
        propertyId,
        municipalityId,
        subjectId,
        widthId,
        distanceId,
        depthId,
        subjectName: subject.name,
        subjectFactor: subject.factor / 100,
        widthName: width.name,
        widthFactor: width.factor / 100,
        distanceName: distance.name,
        distanceFactor: distance.factor / 100,
        depthName: depth.name,
        depthFactor: depth.factor / 100,
        conditionFactor: conditionFactor || 1.0,
        conditionNotes: conditionNotes || '',
        baseValue,
      });

      console.log('PropertyView before save:', propertyView.toObject());
      console.log(
        'Calculated value before save:',
        propertyView.calculatedValue,
      );

      // Manually calculate the value before save
      propertyView.recalculateValue();
      console.log(
        'Calculated value after manual recalculate:',
        propertyView.calculatedValue,
      );

      // Debug calculation step by step
      console.log('=== DEBUGGING CALCULATION ===');
      console.log('baseValue:', propertyView.baseValue);
      console.log('subjectFactor:', propertyView.subjectFactor);
      console.log('widthFactor:', propertyView.widthFactor);
      console.log('distanceFactor:', propertyView.distanceFactor);
      console.log('depthFactor:', propertyView.depthFactor);
      console.log('conditionFactor:', propertyView.conditionFactor);
      const manualCalc =
        propertyView.baseValue *
        propertyView.subjectFactor *
        propertyView.widthFactor *
        propertyView.distanceFactor *
        propertyView.depthFactor *
        propertyView.conditionFactor;
      console.log('Manual calculation:', manualCalc);
      console.log('Model calculatedValue:', propertyView.calculatedValue);
      console.log('=== END DEBUGGING ===');

      await propertyView.save();

      res.status(201).json({
        success: true,
        view: propertyView,
      });
    } catch (error) {
      console.error('Create property view error:', error);

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
        message: 'Failed to create property view',
      });
    }
  },
);

// @route   PUT /api/properties/:propertyId/views/:viewId
// @desc    Update a property view
// @access  Private (requires Assessing module access)
router.put(
  '/properties/:propertyId/views/:viewId',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { propertyId, viewId } = req.params;
      const {
        subjectId,
        widthId,
        distanceId,
        depthId,
        conditionFactor,
        conditionNotes,
        baseValue,
        municipalityId,
      } = req.body;

      // Fetch the view attributes to get current values
      const [subject, width, distance, depth] = await Promise.all([
        ViewAttribute.findByMunicipalityAndId(municipalityId, subjectId),
        ViewAttribute.findByMunicipalityAndId(municipalityId, widthId),
        ViewAttribute.findByMunicipalityAndId(municipalityId, distanceId),
        ViewAttribute.findByMunicipalityAndId(municipalityId, depthId),
      ]);

      if (!subject || !width || !distance || !depth) {
        return res.status(400).json({
          success: false,
          message: 'One or more view attributes not found',
        });
      }

      console.log('=== UPDATE VIEW DEBUGGING ===');
      console.log('Original factors from database:');
      console.log('subject.factor:', subject.factor);
      console.log('width.factor:', width.factor);
      console.log('distance.factor:', distance.factor);
      console.log('depth.factor:', depth.factor);
      console.log('Factors after division by 100:');
      console.log('subjectFactor:', subject.factor / 100);
      console.log('widthFactor:', width.factor / 100);
      console.log('distanceFactor:', distance.factor / 100);
      console.log('depthFactor:', depth.factor / 100);
      console.log('baseValue:', baseValue);
      console.log('conditionFactor:', conditionFactor || 1.0);

      const expectedCalculation =
        baseValue *
        (subject.factor / 100) *
        (width.factor / 100) *
        (distance.factor / 100) *
        (depth.factor / 100) *
        (conditionFactor || 1.0);
      console.log('Expected calculation result:', expectedCalculation);
      console.log('=== END UPDATE DEBUG ===');

      // Find the existing view first
      const propertyView = await PropertyView.findOne({
        _id: viewId,
        propertyId,
        isActive: true,
      });

      if (!propertyView) {
        return res.status(404).json({
          success: false,
          message: 'Property view not found',
        });
      }

      // Update the properties
      propertyView.subjectId = subjectId;
      propertyView.widthId = widthId;
      propertyView.distanceId = distanceId;
      propertyView.depthId = depthId;
      propertyView.subjectName = subject.name;
      propertyView.subjectFactor = subject.factor / 100;
      propertyView.widthName = width.name;
      propertyView.widthFactor = width.factor / 100;
      propertyView.distanceName = distance.name;
      propertyView.distanceFactor = distance.factor / 100;
      propertyView.depthName = depth.name;
      propertyView.depthFactor = depth.factor / 100;
      propertyView.conditionFactor = conditionFactor || 1.0;
      propertyView.conditionNotes = conditionNotes || '';
      propertyView.baseValue = baseValue;

      // Save the view (this will trigger pre-save middleware and recalculate the value)
      await propertyView.save();

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
          '⚠️ Failed to recalculate land assessment after view update:',
          error,
        );
        // Don't fail the view update if land assessment recalculation fails
      }

      res.json({
        success: true,
        view: propertyView,
      });
    } catch (error) {
      console.error('Update property view error:', error);

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
        message: 'Failed to update property view',
      });
    }
  },
);

// @route   DELETE /api/properties/:propertyId/views/:viewId
// @desc    Delete a property view (soft delete)
// @access  Private (requires Assessing module access)
router.delete(
  '/properties/:propertyId/views/:viewId',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { propertyId, viewId } = req.params;

      const propertyView = await PropertyView.findOneAndUpdate(
        { _id: viewId, propertyId, isActive: true },
        { isActive: false },
        { new: true },
      );

      if (!propertyView) {
        return res.status(404).json({
          success: false,
          message: 'Property view not found',
        });
      }

      res.json({
        success: true,
        message: 'Property view deleted successfully',
      });
    } catch (error) {
      console.error('Delete property view error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete property view',
      });
    }
  },
);

module.exports = router;
