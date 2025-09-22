const express = require('express');
const router = express.Router();
const BuildingCode = require('../models/BuildingCode');
const { body, param, validationResult } = require('express-validator');

const validBuildingTypes = [
  'residential',
  'commercial',
  'exempt',
  'manufactured',
  'industrial',
  'utility',
];

// GET /api/municipalities/:municipalityId/building-codes
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
      const buildingCodes =
        await BuildingCode.findByMunicipality(municipalityId);

      res.json({ buildingCodes });
    } catch (error) {
      console.error('Error fetching building codes:', error);
      res.status(500).json({ error: 'Failed to fetch building codes' });
    }
  },
);

// POST /api/municipalities/:municipalityId/building-codes
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
  ],
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
      } = req.body;

      // Check if code already exists for this municipality
      const existingCode = await BuildingCode.findOne({
        municipalityId,
        code: code.toUpperCase(),
        isActive: true,
      });

      if (existingCode) {
        return res.status(400).json({
          error:
            'A building code with this code already exists for this municipality',
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
      });

      await buildingCode.save();

      res.status(201).json({ buildingCode });
    } catch (error) {
      console.error('Error creating building code:', error);
      if (error.code === 11000) {
        res
          .status(400)
          .json({ error: 'A building code with this code already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create building code' });
      }
    }
  },
);

// PUT /api/municipalities/:municipalityId/building-codes/:codeId
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

      // Check if another code with the same code exists (excluding current one)
      const existingCode = await BuildingCode.findOne({
        _id: { $ne: codeId },
        municipalityId,
        code: code.toUpperCase(),
        isActive: true,
      });

      if (existingCode) {
        return res.status(400).json({
          error:
            'A building code with this code already exists for this municipality',
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

      if (!buildingCode) {
        return res.status(404).json({ error: 'Building code not found' });
      }

      res.json({ buildingCode });
    } catch (error) {
      console.error('Error updating building code:', error);
      if (error.code === 11000) {
        res
          .status(400)
          .json({ error: 'A building code with this code already exists' });
      } else {
        res.status(500).json({ error: 'Failed to update building code' });
      }
    }
  },
);

// DELETE /api/municipalities/:municipalityId/building-codes/:codeId
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

      // Soft delete by setting isActive to false
      const buildingCode = await BuildingCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      if (!buildingCode) {
        return res.status(404).json({ error: 'Building code not found' });
      }

      res.json({ message: 'Building code deleted successfully' });
    } catch (error) {
      console.error('Error deleting building code:', error);
      res.status(500).json({ error: 'Failed to delete building code' });
    }
  },
);

module.exports = router;
