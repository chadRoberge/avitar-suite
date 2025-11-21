const express = require('express');
const router = express.Router();
const BuildingFeatureCode = require('../models/BuildingFeatureCode');
const { body, param, validationResult } = require('express-validator');

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

      let buildingFeatureCodes;
      if (featureType) {
        buildingFeatureCodes =
          await BuildingFeatureCode.findByMunicipalityAndType(
            municipalityId,
            featureType,
          );
      } else {
        buildingFeatureCodes =
          await BuildingFeatureCode.findByMunicipality(municipalityId);
      }

      res.json(buildingFeatureCodes);
    } catch (error) {
      console.error('Error fetching building feature codes:', error);
      res.status(500).json({ error: 'Failed to fetch building feature codes' });
    }
  },
);

// POST /api/municipalities/:municipalityId/building-feature-codes
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
      .isNumeric()
      .withMessage('Points must be a number')
      .isInt({ min: -1000, max: 1000 })
      .withMessage('Points must be between -1000 and 1000'),
    body('featureType')
      .isIn(validFeatureTypes)
      .withMessage(
        `Feature type must be one of: ${validFeatureTypes.join(', ')}`,
      ),
  ],
  async (req, res) => {
    try {
      console.log('POST /building-feature-codes request body:', req.body);
      console.log('Municipality ID:', req.params.municipalityId);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      console.log('Validation passed, proceeding with database operations...');

      const { municipalityId } = req.params;
      const { description, displayText, points, featureType } = req.body;

      // Check if display text already exists for this feature type in this municipality
      console.log('Checking for existing code with:', {
        municipalityId,
        displayText: displayText.trim(),
        featureType: featureType.toLowerCase(),
        isActive: true,
      });

      const existingCode = await BuildingFeatureCode.findOne({
        municipalityId,
        displayText: displayText.trim(),
        featureType: featureType.toLowerCase(),
        isActive: true,
      });

      console.log('Existing code found:', existingCode);

      if (existingCode) {
        console.log('Duplicate found, returning 400 error');
        return res.status(400).json({
          success: false,
          error: `A ${featureType.replace('_', ' ')} feature code with display text "${displayText.trim()}" already exists in this municipality.`,
          field: 'displayText',
        });
      }

      console.log('No duplicate found, creating new feature code...');

      const buildingFeatureCode = new BuildingFeatureCode({
        description: description.trim(),
        displayText: displayText.trim(),
        points: parseInt(points, 10),
        featureType: featureType.toLowerCase(),
        municipalityId,
      });

      await buildingFeatureCode.save();

      res.status(201).json({ buildingFeatureCode });
    } catch (error) {
      console.error('Error creating building feature code:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error: 'A feature code with this display text already exists',
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
      .isNumeric()
      .withMessage('Points must be a number')
      .isInt({ min: -1000, max: 1000 })
      .withMessage('Points must be between -1000 and 1000'),
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

      // Check if another code with the same display text and feature type exists (excluding current one)
      const existingCode = await BuildingFeatureCode.findOne({
        _id: { $ne: codeId },
        municipalityId,
        displayText: displayText.trim(),
        featureType: featureType.toLowerCase(),
        isActive: true,
      });

      if (existingCode) {
        return res.status(400).json({
          error:
            'A feature code with this display text already exists for this feature type in this municipality',
        });
      }

      const buildingFeatureCode = await BuildingFeatureCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        {
          description: description.trim(),
          displayText: displayText.trim(),
          points: parseInt(points, 10),
          featureType: featureType.toLowerCase(),
        },
        { new: true, runValidators: true },
      );

      if (!buildingFeatureCode) {
        return res
          .status(404)
          .json({ error: 'Building feature code not found' });
      }

      res.json({ buildingFeatureCode });
    } catch (error) {
      console.error('Error updating building feature code:', error);
      if (error.code === 11000) {
        res.status(400).json({
          error: 'A feature code with this display text already exists',
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

      // Soft delete by setting isActive to false
      const buildingFeatureCode = await BuildingFeatureCode.findOneAndUpdate(
        { _id: codeId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      if (!buildingFeatureCode) {
        return res
          .status(404)
          .json({ error: 'Building feature code not found' });
      }

      res.json({ message: 'Building feature code deleted successfully' });
    } catch (error) {
      console.error('Error deleting building feature code:', error);
      res.status(500).json({ error: 'Failed to delete building feature code' });
    }
  },
);

module.exports = router;
