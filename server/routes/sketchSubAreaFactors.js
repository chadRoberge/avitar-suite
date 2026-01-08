const express = require('express');
const router = express.Router();
const SketchSubAreaFactor = require('../models/SketchSubAreaFactor');
const { body, param, validationResult } = require('express-validator');
const {
  checkYearLock,
  getEffectiveYear,
  isYearLocked,
} = require('../middleware/checkYearLock');

// GET /api/municipalities/:municipalityId/sketch-sub-area-factors
// @query year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/sketch-sub-area-factors',
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
      const sketchSubAreaFactors =
        await SketchSubAreaFactor.findByMunicipalityForYear(
          municipalityId,
          year,
        );

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        sketchSubAreaFactors,
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Error fetching sketch sub area factors:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch sketch sub area factors' });
    }
  },
);

// POST /api/municipalities/:municipalityId/sketch-sub-area-factors
// @body effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/sketch-sub-area-factors',
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
      .isNumeric()
      .withMessage('Points must be a number')
      .isFloat({ min: -1000, max: 1000 })
      .withMessage('Points must be between -1000 and 1000'),
    body('livingSpace')
      .isBoolean()
      .withMessage('Living space must be true or false'),
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
      const { description, displayText, points, livingSpace, effective_year } =
        req.body;

      // Check if display text already exists in this municipality and year
      const existingFactor = await SketchSubAreaFactor.findOne({
        municipalityId,
        displayText: displayText.trim(),
        effective_year,
        isActive: true,
      });

      if (existingFactor) {
        return res.status(400).json({
          error:
            'A sub area factor with this display text already exists in this municipality for this year',
        });
      }

      const sketchSubAreaFactor = new SketchSubAreaFactor({
        description: description.trim(),
        displayText: displayText.trim(),
        points: parseFloat(points),
        livingSpace: Boolean(livingSpace),
        municipalityId,
        effective_year,
      });

      await sketchSubAreaFactor.save();

      res.status(201).json({ sketchSubAreaFactor });
    } catch (error) {
      console.error('Error creating sketch sub area factor:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error:
            'A sub area factor with this display text already exists for this year',
        });
      } else {
        res
          .status(500)
          .json({ error: 'Failed to create sketch sub area factor' });
      }
    }
  },
);

// PUT /api/municipalities/:municipalityId/sketch-sub-area-factors/:factorId
// Supports copy-on-write: if editing an inherited factor from a locked year,
// creates a new factor for the target year instead of modifying the original
router.put(
  '/municipalities/:municipalityId/sketch-sub-area-factors/:factorId',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('factorId').isMongoId().withMessage('Invalid factor ID'),
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
      .isNumeric()
      .withMessage('Points must be a number')
      .isFloat({ min: -1000, max: 1000 })
      .withMessage('Points must be between -1000 and 1000'),
    body('livingSpace')
      .isBoolean()
      .withMessage('Living space must be true or false'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, factorId } = req.params;
      const { description, displayText, points, livingSpace } = req.body;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

      // First, find the factor to check its effective_year
      const existingSketchFactor = await SketchSubAreaFactor.findOne({
        _id: factorId,
        municipalityId,
        isActive: true,
      });

      if (!existingSketchFactor) {
        return res
          .status(404)
          .json({ error: 'Sketch sub area factor not found' });
      }

      const sourceYear = existingSketchFactor.effective_year;
      const sourceYearLocked = await isYearLocked(municipalityId, sourceYear);
      const isInherited = sourceYear !== targetYear;

      // If editing an inherited factor OR the source year is locked, use copy-on-write
      if (isInherited || sourceYearLocked) {
        // Check if the target year is locked
        const targetYearLocked = await isYearLocked(municipalityId, targetYear);
        if (targetYearLocked) {
          return res.status(403).json({
            error: `Configuration for year ${targetYear} is locked and cannot be modified.`,
            isYearLocked: true,
          });
        }

        // Check if a factor with this display text already exists for target year
        const existingTargetFactor = await SketchSubAreaFactor.findOne({
          municipalityId,
          displayText: displayText.trim(),
          effective_year: targetYear,
          isActive: true,
        });

        if (existingTargetFactor) {
          // Update the existing target year factor instead
          const updatedFactor = await SketchSubAreaFactor.findOneAndUpdate(
            { _id: existingTargetFactor._id },
            {
              description: description.trim(),
              displayText: displayText.trim(),
              points: parseFloat(points),
              livingSpace: Boolean(livingSpace),
            },
            { new: true, runValidators: true },
          );

          return res.json({
            sketchSubAreaFactor: updatedFactor,
            copyOnWrite: true,
            message: `Updated existing factor for year ${targetYear}`,
          });
        }

        // Create a new factor for the target year (copy-on-write)
        const newFactor = new SketchSubAreaFactor({
          description: description.trim(),
          displayText: displayText.trim(),
          points: parseFloat(points),
          livingSpace: Boolean(livingSpace),
          municipalityId,
          effective_year: targetYear,
          effective_year_end: null, // New factor is open-ended
          previous_version_id: factorId, // Link to the factor we're replacing
          next_version_id: null,
          isActive: true,
        });

        await newFactor.save();

        // Update the source factor:
        // 1. Set effective_year_end to mark when it stops being active
        // 2. Set next_version_id to link to the new factor
        await SketchSubAreaFactor.findByIdAndUpdate(factorId, {
          effective_year_end: targetYear,
          next_version_id: newFactor._id,
        });

        return res.status(201).json({
          sketchSubAreaFactor: newFactor,
          copyOnWrite: true,
          previousVersionId: factorId,
          message: `Created new factor for year ${targetYear} (supersedes factor from ${sourceYear})`,
        });
      }

      // Direct update for non-inherited, non-locked factors
      // Check if another factor with the same display text exists (excluding current one)
      const duplicateFactor = await SketchSubAreaFactor.findOne({
        _id: { $ne: factorId },
        municipalityId,
        displayText: displayText.trim(),
        effective_year: existingSketchFactor.effective_year,
        isActive: true,
      });

      if (duplicateFactor) {
        return res.status(400).json({
          error:
            'A sub area factor with this display text already exists in this municipality for this year',
        });
      }

      const sketchSubAreaFactor = await SketchSubAreaFactor.findOneAndUpdate(
        { _id: factorId, municipalityId, isActive: true },
        {
          description: description.trim(),
          displayText: displayText.trim(),
          points: parseFloat(points),
          livingSpace: Boolean(livingSpace),
        },
        { new: true, runValidators: true },
      );

      res.json({ sketchSubAreaFactor });
    } catch (error) {
      console.error('Error updating sketch sub area factor:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error:
            'A sub area factor with this display text already exists for this year',
        });
      } else {
        res
          .status(500)
          .json({ error: 'Failed to update sketch sub area factor' });
      }
    }
  },
);

// DELETE /api/municipalities/:municipalityId/sketch-sub-area-factors/:factorId
// Supports temporal deletion: if deleting an inherited factor from a locked year,
// marks it as ending in the target year instead of permanently deleting
router.delete(
  '/municipalities/:municipalityId/sketch-sub-area-factors/:factorId',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('factorId').isMongoId().withMessage('Invalid factor ID'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, factorId } = req.params;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

      // First, find the factor to check its effective_year
      const existingSketchFactor = await SketchSubAreaFactor.findOne({
        _id: factorId,
        municipalityId,
        isActive: true,
      });

      if (!existingSketchFactor) {
        return res
          .status(404)
          .json({ error: 'Sketch sub area factor not found' });
      }

      const sourceYear = existingSketchFactor.effective_year;
      const sourceYearLocked = await isYearLocked(municipalityId, sourceYear);
      const isInherited = sourceYear !== targetYear;

      // If deleting an inherited factor OR the source year is locked, use temporal deletion
      if (isInherited || sourceYearLocked) {
        // Check if the target year is locked
        const targetYearLocked = await isYearLocked(municipalityId, targetYear);
        if (targetYearLocked) {
          return res.status(403).json({
            error: `Configuration for year ${targetYear} is locked and cannot be modified.`,
            isYearLocked: true,
          });
        }

        // Temporal delete: mark the factor as ending in the target year
        // This hides it for targetYear and all future years
        await SketchSubAreaFactor.findByIdAndUpdate(factorId, {
          effective_year_end: targetYear,
        });

        return res.json({
          message: `Sketch sub area factor hidden for year ${targetYear} and beyond`,
          temporalDelete: true,
          effectiveYearEnd: targetYear,
        });
      }

      // Direct delete for factors from the current unlocked year
      // Soft delete by setting isActive to false
      existingSketchFactor.isActive = false;
      await existingSketchFactor.save();

      res.json({ message: 'Sketch sub area factor deleted successfully' });
    } catch (error) {
      console.error('Error deleting sketch sub area factor:', error);
      res
        .status(500)
        .json({ error: 'Failed to delete sketch sub area factor' });
    }
  },
);

module.exports = router;
