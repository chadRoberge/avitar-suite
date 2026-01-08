const express = require('express');
const router = express.Router();
const FeatureCode = require('../models/FeatureCode');
const {
  checkYearLock,
  getEffectiveYear,
  isYearLocked,
} = require('../middleware/checkYearLock');

// GET /api/municipalities/:municipalityId/feature-codes - Get all feature codes for a municipality
// @query year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/feature-codes',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const year = getEffectiveYear(req);

      // Use year-aware query method
      const featureCodes = await FeatureCode.findByMunicipalityForYear(
        municipalityId,
        year,
      );

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        featureCodes,
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Error fetching feature codes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/municipalities/:municipalityId/feature-codes - Create a new feature code
// @body effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/feature-codes',
  checkYearLock,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        code,
        description,
        rate,
        sizeAdjustment,
        measurementType,
        effective_year,
      } = req.body;

      // Validation
      if (
        !code ||
        !description ||
        rate === undefined ||
        !sizeAdjustment ||
        !measurementType ||
        !effective_year
      ) {
        return res.status(400).json({
          error:
            'Missing required fields: code, description, rate, sizeAdjustment, measurementType, effective_year',
        });
      }

      if (!['normal', 'zero'].includes(sizeAdjustment)) {
        return res.status(400).json({
          error: 'sizeAdjustment must be either "normal" or "zero"',
        });
      }

      if (!['length_width', 'units'].includes(measurementType)) {
        return res.status(400).json({
          error: 'measurementType must be either "length_width" or "units"',
        });
      }

      if (typeof rate !== 'number' || rate < 0) {
        return res.status(400).json({
          error: 'Rate must be a positive number',
        });
      }

      // Check if code already exists for this municipality and year
      const existingCode = await FeatureCode.findOne({
        municipalityId,
        code: code.toUpperCase().trim(),
        effective_year,
        isActive: true,
      });

      if (existingCode) {
        return res.status(400).json({
          error:
            'A feature code with this code already exists for this municipality and year',
        });
      }

      const featureCode = new FeatureCode({
        municipalityId,
        code: code.toUpperCase().trim(),
        description: description.trim(),
        rate: parseFloat(rate),
        sizeAdjustment,
        measurementType,
        effective_year,
      });

      const savedFeatureCode = await featureCode.save();
      res.status(201).json({ featureCode: savedFeatureCode });
    } catch (error) {
      console.error('Error creating feature code:', error);

      if (error.code === 11000) {
        // Duplicate key error
        return res.status(400).json({
          error:
            'A feature code with this code already exists for this municipality and year',
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: Object.values(error.errors)
            .map((err) => err.message)
            .join(', '),
        });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/feature-codes/:id - Update a feature code
router.put(
  '/municipalities/:municipalityId/feature-codes/:id',
  async (req, res) => {
    try {
      const { municipalityId, id } = req.params;
      const { code, description, rate, sizeAdjustment, measurementType } =
        req.body;

      // Validation
      if (
        !code ||
        !description ||
        rate === undefined ||
        !sizeAdjustment ||
        !measurementType
      ) {
        return res.status(400).json({
          error:
            'Missing required fields: code, description, rate, sizeAdjustment, measurementType',
        });
      }

      if (!['normal', 'zero'].includes(sizeAdjustment)) {
        return res.status(400).json({
          error: 'sizeAdjustment must be either "normal" or "zero"',
        });
      }

      if (!['length_width', 'units'].includes(measurementType)) {
        return res.status(400).json({
          error: 'measurementType must be either "length_width" or "units"',
        });
      }

      if (typeof rate !== 'number' || rate < 0) {
        return res.status(400).json({
          error: 'Rate must be a positive number',
        });
      }

      // First, find the feature code to check its effective_year
      const existingFeatureCode = await FeatureCode.findOne({
        _id: id,
        municipalityId,
        isActive: true,
      });

      if (!existingFeatureCode) {
        return res.status(404).json({ error: 'Feature code not found' });
      }

      // Check if the year is locked
      const yearLocked = await isYearLocked(
        municipalityId,
        existingFeatureCode.effective_year,
      );
      if (yearLocked) {
        return res.status(403).json({
          error: `Configuration for year ${existingFeatureCode.effective_year} is locked and cannot be modified.`,
          isYearLocked: true,
        });
      }

      // Check if another code with the same code exists (excluding current one)
      const duplicateCode = await FeatureCode.findOne({
        _id: { $ne: id },
        municipalityId,
        code: code.toUpperCase().trim(),
        effective_year: existingFeatureCode.effective_year,
        isActive: true,
      });

      if (duplicateCode) {
        return res.status(400).json({
          error:
            'A feature code with this code already exists for this municipality and year',
        });
      }

      const featureCode = await FeatureCode.findOneAndUpdate(
        { _id: id, municipalityId, isActive: true },
        {
          code: code.toUpperCase().trim(),
          description: description.trim(),
          rate: parseFloat(rate),
          sizeAdjustment,
          measurementType,
          updatedAt: new Date(),
        },
        { new: true },
      );

      res.json({ featureCode });
    } catch (error) {
      console.error('Error updating feature code:', error);

      if (error.code === 11000) {
        // Duplicate key error
        return res.status(400).json({
          error:
            'A feature code with this code already exists for this municipality and year',
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: Object.values(error.errors)
            .map((err) => err.message)
            .join(', '),
        });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/municipalities/:municipalityId/feature-codes/:id - Delete a feature code (soft delete)
router.delete(
  '/municipalities/:municipalityId/feature-codes/:id',
  async (req, res) => {
    try {
      const { municipalityId, id } = req.params;

      // First, find the feature code to check its effective_year
      const existingFeatureCode = await FeatureCode.findOne({
        _id: id,
        municipalityId,
        isActive: true,
      });

      if (!existingFeatureCode) {
        return res.status(404).json({ error: 'Feature code not found' });
      }

      // Check if the year is locked
      const yearLocked = await isYearLocked(
        municipalityId,
        existingFeatureCode.effective_year,
      );
      if (yearLocked) {
        return res.status(403).json({
          error: `Configuration for year ${existingFeatureCode.effective_year} is locked and cannot be modified.`,
          isYearLocked: true,
        });
      }

      existingFeatureCode.isActive = false;
      existingFeatureCode.updatedAt = new Date();
      await existingFeatureCode.save();

      res.json({ message: 'Feature code deleted successfully' });
    } catch (error) {
      console.error('Error deleting feature code:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
