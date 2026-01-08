const express = require('express');
const router = express.Router();
const NeighborhoodCode = require('../models/NeighborhoodCode');
const { body, param, validationResult } = require('express-validator');
const {
  checkYearLock,
  getEffectiveYear,
  isYearLocked,
} = require('../middleware/checkYearLock');

// GET /api/municipalities/:municipalityId/neighborhood-codes
// @query year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/neighborhood-codes',
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
      const neighborhoodCodes =
        await NeighborhoodCode.findByMunicipalityForYear(municipalityId, year);

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        neighborhoodCodes,
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Error fetching neighborhood codes:', error);
      res.status(500).json({ error: 'Failed to fetch neighborhood codes' });
    }
  },
);

// POST /api/municipalities/:municipalityId/neighborhood-codes
// @body effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/neighborhood-codes',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Description is required'),
    body('code')
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage('Code must be 1-10 characters'),
    body('rate')
      .isInt({ min: 0, max: 1000 })
      .withMessage('Rate must be an integer between 0 and 1000'),
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
      const { description, code, rate, effective_year } = req.body;

      // Check if code already exists for this municipality and year
      const existingCode = await NeighborhoodCode.findOne({
        municipalityId,
        code: code.toUpperCase(),
        effective_year,
        isActive: true,
      });

      if (existingCode) {
        return res.status(400).json({
          error:
            'A neighborhood code with this code already exists for this municipality and year',
        });
      }

      const neighborhoodCode = new NeighborhoodCode({
        description: description.trim(),
        code: code.toUpperCase().trim(),
        rate: parseInt(rate, 10),
        municipalityId,
        effective_year,
      });

      await neighborhoodCode.save();

      res.status(201).json({ neighborhoodCode });
    } catch (error) {
      console.error('Error creating neighborhood code:', error);
      if (error.code === 11000) {
        res
          .status(400)
          .json({ error: 'A neighborhood code with this code already exists for this year' });
      } else {
        res.status(500).json({ error: 'Failed to create neighborhood code' });
      }
    }
  },
);

// PUT /api/municipalities/:municipalityId/neighborhood-codes/:codeId
// Supports copy-on-write: if editing an inherited code from a locked year,
// creates a new code for the target year instead of modifying the original
router.put(
  '/municipalities/:municipalityId/neighborhood-codes/:codeId',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('codeId').isMongoId().withMessage('Invalid code ID'),
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Description is required'),
    body('code')
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage('Code must be 1-10 characters'),
    body('rate')
      .isInt({ min: 0, max: 1000 })
      .withMessage('Rate must be an integer between 0 and 1000'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, codeId } = req.params;
      const { description, code, rate } = req.body;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

      // First, find the code to check its effective_year
      const existingNeighborhoodCode = await NeighborhoodCode.findOne({
        _id: codeId,
        municipalityId,
        isActive: true,
      });

      if (!existingNeighborhoodCode) {
        return res.status(404).json({ error: 'Neighborhood code not found' });
      }

      const sourceYear = existingNeighborhoodCode.effective_year;
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
        const existingTargetCode = await NeighborhoodCode.findOne({
          municipalityId,
          code: code.toUpperCase(),
          effective_year: targetYear,
          isActive: true,
        });

        if (existingTargetCode) {
          // Update the existing target year code instead
          const updatedCode = await NeighborhoodCode.findOneAndUpdate(
            { _id: existingTargetCode._id },
            {
              description: description.trim(),
              code: code.toUpperCase().trim(),
              rate: parseInt(rate, 10),
            },
            { new: true, runValidators: true },
          );

          return res.json({
            neighborhoodCode: updatedCode,
            copyOnWrite: true,
            message: `Updated existing code for year ${targetYear}`,
          });
        }

        // Create a new code for the target year (copy-on-write)
        const newCode = new NeighborhoodCode({
          description: description.trim(),
          code: code.toUpperCase().trim(),
          rate: parseInt(rate, 10),
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
        await NeighborhoodCode.findByIdAndUpdate(codeId, {
          effective_year_end: targetYear,
          next_version_id: newCode._id,
        });

        return res.status(201).json({
          neighborhoodCode: newCode,
          copyOnWrite: true,
          previousVersionId: codeId,
          message: `Created new code for year ${targetYear} (supersedes code from ${sourceYear})`,
        });
      }

      // Direct update for non-inherited, non-locked codes
      // Check if another code with the same code exists (excluding current one)
      const duplicateCode = await NeighborhoodCode.findOne({
        _id: { $ne: codeId },
        municipalityId,
        code: code.toUpperCase(),
        effective_year: existingNeighborhoodCode.effective_year,
        isActive: true,
      });

      if (duplicateCode) {
        return res.status(400).json({
          error:
            'A neighborhood code with this code already exists for this municipality and year',
        });
      }

      const neighborhoodCode = await NeighborhoodCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        {
          description: description.trim(),
          code: code.toUpperCase().trim(),
          rate: parseInt(rate, 10),
        },
        { new: true, runValidators: true },
      );

      res.json({ neighborhoodCode });
    } catch (error) {
      console.error('Error updating neighborhood code:', error);
      if (error.code === 11000) {
        res
          .status(400)
          .json({ error: 'A neighborhood code with this code already exists for this year' });
      } else {
        res.status(500).json({ error: 'Failed to update neighborhood code' });
      }
    }
  },
);

// DELETE /api/municipalities/:municipalityId/neighborhood-codes/:codeId
// Supports temporal deletion: if deleting an inherited code from a locked year,
// marks it as ending in the target year instead of permanently deleting
router.delete(
  '/municipalities/:municipalityId/neighborhood-codes/:codeId',
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
      const existingNeighborhoodCode = await NeighborhoodCode.findOne({
        _id: codeId,
        municipalityId,
        isActive: true,
      });

      if (!existingNeighborhoodCode) {
        return res.status(404).json({ error: 'Neighborhood code not found' });
      }

      const sourceYear = existingNeighborhoodCode.effective_year;
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
        await NeighborhoodCode.findByIdAndUpdate(codeId, {
          effective_year_end: targetYear,
        });

        return res.json({
          message: `Neighborhood code hidden for year ${targetYear} and beyond`,
          temporalDelete: true,
          effectiveYearEnd: targetYear,
        });
      }

      // Direct delete for codes from the current unlocked year
      // Soft delete by setting isActive to false
      await NeighborhoodCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      res.json({ message: 'Neighborhood code deleted successfully' });
    } catch (error) {
      console.error('Error deleting neighborhood code:', error);
      res.status(500).json({ error: 'Failed to delete neighborhood code' });
    }
  },
);

module.exports = router;
