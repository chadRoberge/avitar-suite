const express = require('express');
const router = express.Router();
const BuildingFeatureCode = require('../models/BuildingFeatureCode');
const { body, param, validationResult } = require('express-validator');
const {
  checkYearLock,
  getEffectiveYear,
  isYearLocked,
} = require('../middleware/checkYearLock');

const validFeatureTypes = [
  'interior_wall',
  'exterior_wall',
  'roofing',
  'roof_style',
  'flooring',
  'heating_fuel',
  'heating_type',
  'quality',
  'story_height',
  'frame',
  'ceiling_height',
];

// GET /api/municipalities/:municipalityId/building-feature-codes
// @query year - optional, defaults to current year
// @query featureType - optional, filter by feature type
router.get(
  '/municipalities/:municipalityId/building-feature-codes',
  [param('municipalityId').isMongoId().withMessage('Invalid municipality ID')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId } = req.params;
      const { featureType } = req.query;
      const year = getEffectiveYear(req);

      let buildingFeatureCodes;
      if (featureType) {
        // Use year-aware query method for specific feature type
        buildingFeatureCodes =
          await BuildingFeatureCode.findByMunicipalityAndTypeForYear(
            municipalityId,
            featureType,
            year,
          );
      } else {
        // Use year-aware query method for all feature codes
        buildingFeatureCodes =
          await BuildingFeatureCode.findByMunicipalityForYear(
            municipalityId,
            year,
          );
      }

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        buildingFeatureCodes,
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Error fetching building feature codes:', error);
      res.status(500).json({ error: 'Failed to fetch building feature codes' });
    }
  },
);

// POST /api/municipalities/:municipalityId/building-feature-codes
// @body effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/building-feature-codes',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Description is required'),
    body('displayText')
      .trim()
      .notEmpty()
      .withMessage('Display text is required')
      .isLength({ max: 15 })
      .withMessage('Display text must be 15 characters or less'),
    body('points')
      .isFloat({ min: -1000, max: 1000 })
      .withMessage('Points must be a number between -1000 and 1000'),
    body('featureType')
      .isIn(validFeatureTypes)
      .withMessage(
        `Feature type must be one of: ${validFeatureTypes.join(', ')}`,
      ),
    body('effective_year')
      .isInt({ min: 2000, max: 2099 })
      .withMessage('Effective year must be between 2000 and 2099'),
  ],
  checkYearLock,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId } = req.params;
      const { description, displayText, points, featureType, effective_year } =
        req.body;

      // Check if display text already exists for this feature type, municipality, and year
      const existingCode = await BuildingFeatureCode.findOne({
        municipalityId,
        displayText: displayText.trim(),
        featureType: featureType.toLowerCase(),
        effective_year,
        isActive: true,
      });

      if (existingCode) {
        return res.status(400).json({
          success: false,
          error: `A ${featureType.replace('_', ' ')} feature code with display text "${displayText.trim()}" already exists for this municipality and year.`,
          field: 'displayText',
        });
      }

      const buildingFeatureCode = new BuildingFeatureCode({
        code: displayText.trim(),
        description: description.trim(),
        displayText: displayText.trim(),
        points: parseFloat(points),
        featureType: featureType.toLowerCase(),
        municipalityId,
        effective_year,
      });

      await buildingFeatureCode.save();

      res.status(201).json({ buildingFeatureCode });
    } catch (error) {
      console.error('Error creating building feature code:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error:
            'A feature code with this display text already exists for this year',
        });
      } else {
        res
          .status(500)
          .json({ error: 'Failed to create building feature code' });
      }
    }
  },
);

// PUT /api/municipalities/:municipalityId/building-feature-codes/:codeId
// Supports copy-on-write: if editing an inherited code from a locked year,
// creates a new code for the target year instead of modifying the original
router.put(
  '/municipalities/:municipalityId/building-feature-codes/:codeId',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('codeId').isMongoId().withMessage('Invalid code ID'),
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Description is required'),
    body('displayText')
      .trim()
      .notEmpty()
      .withMessage('Display text is required')
      .isLength({ max: 15 })
      .withMessage('Display text must be 15 characters or less'),
    body('points')
      .isFloat({ min: -1000, max: 1000 })
      .withMessage('Points must be a number between -1000 and 1000'),
    body('featureType')
      .isIn(validFeatureTypes)
      .withMessage(
        `Feature type must be one of: ${validFeatureTypes.join(', ')}`,
      ),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, codeId } = req.params;
      const { description, displayText, points, featureType } = req.body;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

      // First, find the code to check its effective_year
      const existingFeatureCode = await BuildingFeatureCode.findOne({
        _id: codeId,
        municipalityId,
        isActive: true,
      });

      if (!existingFeatureCode) {
        return res
          .status(404)
          .json({ error: 'Building feature code not found' });
      }

      const sourceYear = existingFeatureCode.effective_year;
      const sourceYearLocked = await isYearLocked(municipalityId, sourceYear);
      const isInherited = sourceYear !== targetYear;

      // If editing an inherited code OR the source year is locked, use copy-on-write
      if (isInherited || sourceYearLocked) {
        // Check if the target year is locked
        const targetYearLocked = await isYearLocked(municipalityId, targetYear);
        if (targetYearLocked) {
          return res.status(403).json({
            error: `Configuration for year ${targetYear} is locked and cannot be modified.`,
            isYearLocked: true,
          });
        }

        // Check if a code with this display text already exists for target year
        const existingTargetCode = await BuildingFeatureCode.findOne({
          municipalityId,
          displayText: displayText.trim(),
          featureType: featureType.toLowerCase(),
          effective_year: targetYear,
          isActive: true,
        });

        if (existingTargetCode) {
          // Update the existing target year code instead
          const updatedCode = await BuildingFeatureCode.findOneAndUpdate(
            { _id: existingTargetCode._id },
            {
              code: displayText.trim(),
              description: description.trim(),
              displayText: displayText.trim(),
              points: parseFloat(points),
              featureType: featureType.toLowerCase(),
            },
            { new: true, runValidators: true },
          );

          return res.json({
            buildingFeatureCode: updatedCode,
            copyOnWrite: true,
            message: `Updated existing code for year ${targetYear}`,
          });
        }

        // Create a new code for the target year (copy-on-write)
        const newCode = new BuildingFeatureCode({
          code: displayText.trim(),
          description: description.trim(),
          displayText: displayText.trim(),
          points: parseFloat(points),
          featureType: featureType.toLowerCase(),
          municipalityId,
          effective_year: targetYear,
          effective_year_end: null, // New code is open-ended
          previous_version_id: codeId, // Link to the code we're replacing
          next_version_id: null,
          isActive: true,
        });

        await newCode.save();

        // Update the source code:
        // 1. Set effective_year_end to mark when it stops being active
        // 2. Set next_version_id to link to the new code
        // This is allowed even for locked years because we're not changing the code's data,
        // just marking when it stops being the active version and linking to its successor
        await BuildingFeatureCode.findByIdAndUpdate(codeId, {
          effective_year_end: targetYear,
          next_version_id: newCode._id,
        });

        return res.status(201).json({
          buildingFeatureCode: newCode,
          copyOnWrite: true,
          previousVersionId: codeId,
          message: `Created new code for year ${targetYear} (supersedes code from ${sourceYear})`,
        });
      }

      // Direct update for non-inherited, non-locked codes
      // Check if another code with the same display text and feature type exists (excluding current one)
      const duplicateCode = await BuildingFeatureCode.findOne({
        _id: { $ne: codeId },
        municipalityId,
        displayText: displayText.trim(),
        featureType: featureType.toLowerCase(),
        effective_year: existingFeatureCode.effective_year,
        isActive: true,
      });

      if (duplicateCode) {
        return res.status(400).json({
          error:
            'A feature code with this display text already exists for this feature type and year',
        });
      }

      const buildingFeatureCode = await BuildingFeatureCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        {
          code: displayText.trim(),
          description: description.trim(),
          displayText: displayText.trim(),
          points: parseFloat(points),
          featureType: featureType.toLowerCase(),
        },
        { new: true, runValidators: true },
      );

      res.json({ buildingFeatureCode });
    } catch (error) {
      console.error('Error updating building feature code:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error:
            'A feature code with this display text already exists for this year',
        });
      } else {
        res
          .status(500)
          .json({ error: 'Failed to update building feature code' });
      }
    }
  },
);

// DELETE /api/municipalities/:municipalityId/building-feature-codes/:codeId
// Supports temporal deletion: if deleting an inherited code from a locked year,
// marks it as ending in the target year instead of permanently deleting
router.delete(
  '/municipalities/:municipalityId/building-feature-codes/:codeId',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('codeId').isMongoId().withMessage('Invalid code ID'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, codeId } = req.params;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

      // First, find the code to check its effective_year
      const existingFeatureCode = await BuildingFeatureCode.findOne({
        _id: codeId,
        municipalityId,
        isActive: true,
      });

      if (!existingFeatureCode) {
        return res
          .status(404)
          .json({ error: 'Building feature code not found' });
      }

      const sourceYear = existingFeatureCode.effective_year;
      const sourceYearLocked = await isYearLocked(municipalityId, sourceYear);
      const isInherited = sourceYear !== targetYear;

      // If deleting an inherited code OR the source year is locked, use temporal deletion
      if (isInherited || sourceYearLocked) {
        // Check if the target year is locked
        const targetYearLocked = await isYearLocked(municipalityId, targetYear);
        if (targetYearLocked) {
          return res.status(403).json({
            error: `Configuration for year ${targetYear} is locked and cannot be modified.`,
            isYearLocked: true,
          });
        }

        // Temporal delete: mark the code as ending in the target year
        // This hides it for targetYear and all future years
        await BuildingFeatureCode.findByIdAndUpdate(codeId, {
          effective_year_end: targetYear,
        });

        return res.json({
          message: `Building feature code hidden for year ${targetYear} and beyond`,
          temporalDelete: true,
          effectiveYearEnd: targetYear,
        });
      }

      // Direct delete for codes from the current unlocked year
      // Soft delete by setting isActive to false
      await BuildingFeatureCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      res.json({ message: 'Building feature code deleted successfully' });
    } catch (error) {
      console.error('Error deleting building feature code:', error);
      res.status(500).json({ error: 'Failed to delete building feature code' });
    }
  },
);

module.exports = router;
