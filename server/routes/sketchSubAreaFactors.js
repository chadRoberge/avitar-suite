const express = require('express');
const router = express.Router();
const SketchSubAreaFactor = require('../models/SketchSubAreaFactor');
const { body, param, validationResult } = require('express-validator');

// GET /api/municipalities/:municipalityId/sketch-sub-area-factors
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
      const sketchSubAreaFactors =
        await SketchSubAreaFactor.findByMunicipality(municipalityId);

      res.json({ sketchSubAreaFactors });
    } catch (error) {
      console.error('Error fetching sketch sub area factors:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch sketch sub area factors' });
    }
  },
);

// POST /api/municipalities/:municipalityId/sketch-sub-area-factors
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
      .isInt({ min: -1000, max: 1000 })
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

      const { municipalityId } = req.params;
      const { description, displayText, points, livingSpace } = req.body;

      // Check if display text already exists in this municipality
      const existingFactor = await SketchSubAreaFactor.findOne({
        municipalityId,
        displayText: displayText.trim(),
        isActive: true,
      });

      if (existingFactor) {
        return res.status(400).json({
          error:
            'A sub area factor with this display text already exists in this municipality',
        });
      }

      const sketchSubAreaFactor = new SketchSubAreaFactor({
        description: description.trim(),
        displayText: displayText.trim(),
        points: parseInt(points, 10),
        livingSpace: Boolean(livingSpace),
        municipalityId,
      });

      await sketchSubAreaFactor.save();

      res.status(201).json({ sketchSubAreaFactor });
    } catch (error) {
      console.error('Error creating sketch sub area factor:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error: 'A sub area factor with this display text already exists',
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
      .isInt({ min: -1000, max: 1000 })
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

      // Check if another factor with the same display text exists (excluding current one)
      const existingFactor = await SketchSubAreaFactor.findOne({
        _id: { $ne: factorId },
        municipalityId,
        displayText: displayText.trim(),
        isActive: true,
      });

      if (existingFactor) {
        return res.status(400).json({
          error:
            'A sub area factor with this display text already exists in this municipality',
        });
      }

      const sketchSubAreaFactor = await SketchSubAreaFactor.findOneAndUpdate(
        { _id: factorId, municipalityId, isActive: true },
        {
          description: description.trim(),
          displayText: displayText.trim(),
          points: parseInt(points, 10),
          livingSpace: Boolean(livingSpace),
        },
        { new: true, runValidators: true },
      );

      if (!sketchSubAreaFactor) {
        return res
          .status(404)
          .json({ error: 'Sketch sub area factor not found' });
      }

      res.json({ sketchSubAreaFactor });
    } catch (error) {
      console.error('Error updating sketch sub area factor:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error: 'A sub area factor with this display text already exists',
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

      // Soft delete by setting isActive to false
      const sketchSubAreaFactor = await SketchSubAreaFactor.findOneAndUpdate(
        { _id: factorId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      if (!sketchSubAreaFactor) {
        return res
          .status(404)
          .json({ error: 'Sketch sub area factor not found' });
      }

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
