const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const LandAssessmentCalculationService = require('../services/landAssessmentCalculationService');

const router = express.Router();

// @route   POST /api/municipalities/:municipalityId/land-assessments/recalculate
// @desc    Recalculate all land assessments for a municipality
// @access  Private (Admin/Staff only)
router.post(
  '/municipalities/:municipalityId/land-assessments/recalculate',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { batchSize, save } = req.body;

      // Check if user has admin access to this municipality
      const hasAdminAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            ['admin', 'assessing_admin'].includes(perm.role),
        );

      if (!hasAdminAccess) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required for municipality-wide recalculations',
        });
      }

      console.log(
        `Starting municipality-wide recalculation for ${municipalityId}`,
      );

      const calculationService = new LandAssessmentCalculationService();
      const result = await calculationService.recalculateAllProperties(
        municipalityId,
        { batchSize, save },
      );

      console.log('Recalculation completed:', result);

      res.json({
        success: true,
        message: 'Municipality-wide recalculation completed',
        data: result,
      });
    } catch (error) {
      console.error('Error in municipality-wide recalculation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete municipality-wide recalculation',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/land-assessments/recalculate-affected
// @desc    Recalculate properties affected by reference data changes
// @access  Private (Admin/Staff only)
router.post(
  '/municipalities/:municipalityId/land-assessments/recalculate-affected',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { changeType, changeId } = req.body;

      // Check if user has admin access to this municipality
      const hasAdminAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) =>
            perm.municipality_id.toString() === municipalityId &&
            ['admin', 'assessing_admin'].includes(perm.role),
        );

      if (!hasAdminAccess) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required for selective recalculations',
        });
      }

      if (!changeType || !changeId) {
        return res.status(400).json({
          success: false,
          message: 'changeType and changeId are required',
        });
      }

      console.log(
        `Starting selective recalculation for ${municipalityId}, changeType: ${changeType}, changeId: ${changeId}`,
      );

      const calculationService = new LandAssessmentCalculationService();
      const result = await calculationService.recalculateAffectedProperties(
        municipalityId,
        changeType,
        changeId,
      );

      console.log('Selective recalculation completed:', result);

      res.json({
        success: true,
        message: 'Selective recalculation completed',
        data: result,
      });
    } catch (error) {
      console.error('Error in selective recalculation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete selective recalculation',
        error: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/land-assessments/validate
// @desc    Validate calculation consistency across properties
// @access  Private (Admin/Staff only)
router.post(
  '/municipalities/:municipalityId/land-assessments/validate',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { sampleSize = 50 } = req.body;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this municipality',
        });
      }

      console.log(
        `Starting calculation validation for ${municipalityId}, sample size: ${sampleSize}`,
      );

      const calculationService = new LandAssessmentCalculationService();
      const result = await calculationService.validateCalculations(
        municipalityId,
        parseInt(sampleSize),
      );

      console.log('Validation completed:', result);

      res.json({
        success: true,
        message: 'Calculation validation completed',
        data: result,
      });
    } catch (error) {
      console.error('Error in calculation validation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete calculation validation',
        error: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/land-assessments/calculation-status
// @desc    Get current calculation status and statistics
// @access  Private
router.get(
  '/municipalities/:municipalityId/land-assessments/calculation-status',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.municipal_permissions?.some(
          (perm) => perm.municipality_id.toString() === municipalityId,
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this municipality',
        });
      }

      const LandAssessment = require('../models/LandAssessment');
      const PropertyTreeNode = require('../models/PropertyTreeNode');

      // Get basic statistics
      const totalProperties = await PropertyTreeNode.countDocuments({
        municipalityId: municipalityId,
        parentId: null, // Only count root properties, not sub-parcels
      });
      const totalLandAssessments = await LandAssessment.countDocuments({
        municipality_id: municipalityId,
      });
      const landAssessmentsWithCalculatedTotals =
        await LandAssessment.countDocuments({
          municipality_id: municipalityId,
          calculated_totals: { $exists: true },
        });

      // Get properties with recent calculations (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentlyCalculated = await LandAssessment.countDocuments({
        municipality_id: municipalityId,
        last_calculated: { $gte: thirtyDaysAgo },
      });

      const status = {
        municipalityId,
        totalProperties,
        totalLandAssessments,
        landAssessmentsWithCalculatedTotals,
        recentlyCalculated,
        calculationCoverage:
          totalLandAssessments > 0
            ? Math.round(
                (landAssessmentsWithCalculatedTotals / totalLandAssessments) *
                  100,
              )
            : 0,
        assessmentCoverage:
          totalProperties > 0
            ? Math.round((totalLandAssessments / totalProperties) * 100)
            : 0,
        checkedAt: new Date(),
      };

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('Error getting calculation status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get calculation status',
        error: error.message,
      });
    }
  },
);

module.exports = router;
