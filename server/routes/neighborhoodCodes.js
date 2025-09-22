const express = require('express');
const router = express.Router();
const NeighborhoodCode = require('../models/NeighborhoodCode');
const { body, param, validationResult } = require('express-validator');

// GET /api/municipalities/:municipalityId/neighborhood-codes
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
      const neighborhoodCodes =
        await NeighborhoodCode.findByMunicipality(municipalityId);

      res.json({ neighborhoodCodes });
    } catch (error) {
      console.error('Error fetching neighborhood codes:', error);
      res.status(500).json({ error: 'Failed to fetch neighborhood codes' });
    }
  },
);

// POST /api/municipalities/:municipalityId/neighborhood-codes
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
      .isLength({ min: 1, max: 2 })
      .withMessage('Code must be 1-2 characters')
      .isAlpha()
      .withMessage('Code must contain only letters'),
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

      const { municipalityId } = req.params;
      const { description, code, rate } = req.body;

      // Check if code already exists for this municipality
      const existingCode = await NeighborhoodCode.findOne({
        municipalityId,
        code: code.toUpperCase(),
        isActive: true,
      });

      if (existingCode) {
        return res.status(400).json({
          error:
            'A neighborhood code with this code already exists for this municipality',
        });
      }

      const neighborhoodCode = new NeighborhoodCode({
        description: description.trim(),
        code: code.toUpperCase().trim(),
        rate: parseInt(rate, 10),
        municipalityId,
      });

      await neighborhoodCode.save();

      res.status(201).json({ neighborhoodCode });
    } catch (error) {
      console.error('Error creating neighborhood code:', error);
      if (error.code === 11000) {
        res
          .status(400)
          .json({ error: 'A neighborhood code with this code already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create neighborhood code' });
      }
    }
  },
);

// PUT /api/municipalities/:municipalityId/neighborhood-codes/:codeId
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
      .isLength({ min: 1, max: 2 })
      .withMessage('Code must be 1-2 characters')
      .isAlpha()
      .withMessage('Code must contain only letters'),
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

      // Check if another code with the same code exists (excluding current one)
      const existingCode = await NeighborhoodCode.findOne({
        _id: { $ne: codeId },
        municipalityId,
        code: code.toUpperCase(),
        isActive: true,
      });

      if (existingCode) {
        return res.status(400).json({
          error:
            'A neighborhood code with this code already exists for this municipality',
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

      if (!neighborhoodCode) {
        return res.status(404).json({ error: 'Neighborhood code not found' });
      }

      res.json({ neighborhoodCode });
    } catch (error) {
      console.error('Error updating neighborhood code:', error);
      if (error.code === 11000) {
        res
          .status(400)
          .json({ error: 'A neighborhood code with this code already exists' });
      } else {
        res.status(500).json({ error: 'Failed to update neighborhood code' });
      }
    }
  },
);

// DELETE /api/municipalities/:municipalityId/neighborhood-codes/:codeId
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

      // Soft delete by setting isActive to false
      const neighborhoodCode = await NeighborhoodCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      if (!neighborhoodCode) {
        return res.status(404).json({ error: 'Neighborhood code not found' });
      }

      res.json({ message: 'Neighborhood code deleted successfully' });
    } catch (error) {
      console.error('Error deleting neighborhood code:', error);
      res.status(500).json({ error: 'Failed to delete neighborhood code' });
    }
  },
);

module.exports = router;
