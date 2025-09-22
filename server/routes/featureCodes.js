const express = require('express');
const router = express.Router();
const FeatureCode = require('../models/FeatureCode');

// GET /api/municipalities/:municipalityId/feature-codes - Get all feature codes for a municipality
router.get(
  '/municipalities/:municipalityId/feature-codes',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      const featureCodes = await FeatureCode.find({
        municipalityId,
        isActive: true,
      }).sort({ code: 1 });

      res.json({ featureCodes });
    } catch (error) {
      console.error('Error fetching feature codes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/municipalities/:municipalityId/feature-codes - Create a new feature code
router.post(
  '/municipalities/:municipalityId/feature-codes',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
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

      const featureCode = new FeatureCode({
        municipalityId,
        code: code.toUpperCase().trim(),
        description: description.trim(),
        rate: parseFloat(rate),
        sizeAdjustment,
        measurementType,
      });

      const savedFeatureCode = await featureCode.save();
      res.status(201).json({ featureCode: savedFeatureCode });
    } catch (error) {
      console.error('Error creating feature code:', error);

      if (error.code === 11000) {
        // Duplicate key error
        return res.status(400).json({
          error:
            'A feature code with this code already exists for this municipality',
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

      const featureCode = await FeatureCode.findOneAndUpdate(
        { _id: id, municipalityId },
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

      if (!featureCode) {
        return res.status(404).json({ error: 'Feature code not found' });
      }

      res.json({ featureCode });
    } catch (error) {
      console.error('Error updating feature code:', error);

      if (error.code === 11000) {
        // Duplicate key error
        return res.status(400).json({
          error:
            'A feature code with this code already exists for this municipality',
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

      const featureCode = await FeatureCode.findOneAndUpdate(
        { _id: id, municipalityId },
        { isActive: false, updatedAt: new Date() },
        { new: true },
      );

      if (!featureCode) {
        return res.status(404).json({ error: 'Feature code not found' });
      }

      res.json({ message: 'Feature code deleted successfully' });
    } catch (error) {
      console.error('Error deleting feature code:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
