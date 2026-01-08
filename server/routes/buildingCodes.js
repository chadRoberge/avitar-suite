const express = require('express');
const router = express.Router();
const BuildingCode = require('../models/BuildingCode');
const { body, param, validationResult } = require('express-validator');
const {
  checkYearLock,
  getEffectiveYear,
  isYearLocked,
} = require('../middleware/checkYearLock');

const validBuildingTypes = [
  'residential',
  'commercial',
  'exempt',
  'manufactured',
  'industrial',
  'utility',
];

// GET /api/municipalities/:municipalityId/building-codes
// @query year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/building-codes',
  [param('municipalityId').isMongoId().withMessage('Invalid municipality ID')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId } = req.params;
      const year = getEffectiveYear(req);

      // Use year-aware query method
      const buildingCodes = await BuildingCode.findByMunicipalityForYear(
        municipalityId,
        year,
      );

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        buildingCodes,
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Error fetching building codes:', error);
      res.status(500).json({ error: 'Failed to fetch building codes' });
    }
  },
);

// POST /api/municipalities/:municipalityId/building-codes
// @body effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/building-codes',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Description is required'),
    body('code')
      .trim()
      .isLength({ min: 3, max: 3 })
      .withMessage('Code must be exactly 3 characters')
      .isAlpha()
      .withMessage('Code must contain only letters'),
    body('rate')
      .isNumeric()
      .withMessage('Rate must be a number')
      .isFloat({ min: 0 })
      .withMessage('Rate must be 0 or greater'),
    body('buildingType')
      .isIn(validBuildingTypes)
      .withMessage(
        `Building type must be one of: ${validBuildingTypes.join(', ')}`,
      ),
    body('sizeAdjustmentCategory')
      .isIn(validBuildingTypes)
      .withMessage(
        `Size adjustment category must be one of: ${validBuildingTypes.join(', ')}`,
      ),
    body('depreciation')
      .isNumeric()
      .withMessage('Depreciation must be a number')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Depreciation must be between 0 and 100'),
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
      const {
        description,
        code,
        rate,
        buildingType,
        sizeAdjustmentCategory,
        depreciation,
        effective_year,
      } = req.body;

      // Check if code already exists for this municipality and year
      const existingCode = await BuildingCode.findOne({
        municipalityId,
        code: code.toUpperCase(),
        effective_year,
        isActive: true,
      });

      if (existingCode) {
        return res.status(400).json({
          error:
            'A building code with this code already exists for this municipality and year',
        });
      }

      const buildingCode = new BuildingCode({
        description: description.trim(),
        code: code.toUpperCase().trim(),
        rate: parseFloat(rate),
        buildingType: buildingType.toLowerCase(),
        sizeAdjustmentCategory: sizeAdjustmentCategory.toLowerCase(),
        depreciation: parseFloat(depreciation),
        municipalityId,
        effective_year,
      });

      await buildingCode.save();

      res.status(201).json({ buildingCode });
    } catch (error) {
      console.error('Error creating building code:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error:
            'A building code with this code already exists for this year',
        });
      } else {
        res.status(500).json({ error: 'Failed to create building code' });
      }
    }
  },
);

// PUT /api/municipalities/:municipalityId/building-codes/:codeId
// Supports copy-on-write: if editing an inherited code from a locked year,
// creates a new code for the target year instead of modifying the original
router.put(
  '/municipalities/:municipalityId/building-codes/:codeId',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('codeId').isMongoId().withMessage('Invalid code ID'),
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Description is required'),
    body('code')
      .trim()
      .isLength({ min: 3, max: 3 })
      .withMessage('Code must be exactly 3 characters')
      .isAlpha()
      .withMessage('Code must contain only letters'),
    body('rate')
      .isNumeric()
      .withMessage('Rate must be a number')
      .isFloat({ min: 0 })
      .withMessage('Rate must be 0 or greater'),
    body('buildingType')
      .isIn(validBuildingTypes)
      .withMessage(
        `Building type must be one of: ${validBuildingTypes.join(', ')}`,
      ),
    body('sizeAdjustmentCategory')
      .isIn(validBuildingTypes)
      .withMessage(
        `Size adjustment category must be one of: ${validBuildingTypes.join(', ')}`,
      ),
    body('depreciation')
      .isNumeric()
      .withMessage('Depreciation must be a number')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Depreciation must be between 0 and 100'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, codeId } = req.params;
      const {
        description,
        code,
        rate,
        buildingType,
        sizeAdjustmentCategory,
        depreciation,
      } = req.body;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

      // First, find the code to check its effective_year
      const existingBuildingCode = await BuildingCode.findOne({
        _id: codeId,
        municipalityId,
        isActive: true,
      });

      if (!existingBuildingCode) {
        return res.status(404).json({ error: 'Building code not found' });
      }

      const sourceYear = existingBuildingCode.effective_year;
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

        // Check if a code with this code already exists for target year
        const existingTargetCode = await BuildingCode.findOne({
          municipalityId,
          code: code.toUpperCase(),
          effective_year: targetYear,
          isActive: true,
        });

        if (existingTargetCode) {
          // Update the existing target year code instead
          const updatedCode = await BuildingCode.findOneAndUpdate(
            { _id: existingTargetCode._id },
            {
              description: description.trim(),
              code: code.toUpperCase().trim(),
              rate: parseFloat(rate),
              buildingType: buildingType.toLowerCase(),
              sizeAdjustmentCategory: sizeAdjustmentCategory.toLowerCase(),
              depreciation: parseFloat(depreciation),
            },
            { new: true, runValidators: true },
          );

          return res.json({
            buildingCode: updatedCode,
            copyOnWrite: true,
            message: `Updated existing code for year ${targetYear}`,
          });
        }

        // Create a new code for the target year (copy-on-write)
        const newCode = new BuildingCode({
          description: description.trim(),
          code: code.toUpperCase().trim(),
          rate: parseFloat(rate),
          buildingType: buildingType.toLowerCase(),
          sizeAdjustmentCategory: sizeAdjustmentCategory.toLowerCase(),
          depreciation: parseFloat(depreciation),
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
        await BuildingCode.findByIdAndUpdate(codeId, {
          effective_year_end: targetYear,
          next_version_id: newCode._id,
        });

        return res.status(201).json({
          buildingCode: newCode,
          copyOnWrite: true,
          previousVersionId: codeId,
          message: `Created new code for year ${targetYear} (supersedes code from ${sourceYear})`,
        });
      }

      // Direct update for non-inherited, non-locked codes
      // Check if another code with the same code exists (excluding current one)
      const duplicateCode = await BuildingCode.findOne({
        _id: { $ne: codeId },
        municipalityId,
        code: code.toUpperCase(),
        effective_year: existingBuildingCode.effective_year,
        isActive: true,
      });

      if (duplicateCode) {
        return res.status(400).json({
          error:
            'A building code with this code already exists for this municipality and year',
        });
      }

      const buildingCode = await BuildingCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        {
          description: description.trim(),
          code: code.toUpperCase().trim(),
          rate: parseFloat(rate),
          buildingType: buildingType.toLowerCase(),
          sizeAdjustmentCategory: sizeAdjustmentCategory.toLowerCase(),
          depreciation: parseFloat(depreciation),
        },
        { new: true, runValidators: true },
      );

      res.json({ buildingCode });
    } catch (error) {
      console.error('Error updating building code:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error:
            'A building code with this code already exists for this year',
        });
      } else {
        res.status(500).json({ error: 'Failed to update building code' });
      }
    }
  },
);

// DELETE /api/municipalities/:municipalityId/building-codes/:codeId
// Supports temporal deletion: if deleting an inherited code from a locked year,
// marks it as ending in the target year instead of permanently deleting
router.delete(
  '/municipalities/:municipalityId/building-codes/:codeId',
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
      const existingBuildingCode = await BuildingCode.findOne({
        _id: codeId,
        municipalityId,
        isActive: true,
      });

      if (!existingBuildingCode) {
        return res.status(404).json({ error: 'Building code not found' });
      }

      const sourceYear = existingBuildingCode.effective_year;
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
        await BuildingCode.findByIdAndUpdate(codeId, {
          effective_year_end: targetYear,
        });

        return res.json({
          message: `Building code hidden for year ${targetYear} and beyond`,
          temporalDelete: true,
          effectiveYearEnd: targetYear,
        });
      }

      // Direct delete for codes from the current unlocked year
      // Soft delete by setting isActive to false
      await BuildingCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      res.json({ message: 'Building code deleted successfully' });
    } catch (error) {
      console.error('Error deleting building code:', error);
      res.status(500).json({ error: 'Failed to delete building code' });
    }
  },
);

module.exports = router;
