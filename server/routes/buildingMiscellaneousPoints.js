const express = require('express');
const router = express.Router();
const BuildingCalculationConfig = require('../models/BuildingCalculationConfig');
const { body, param, validationResult } = require('express-validator');

// GET /api/municipalities/:municipalityId/building-miscellaneous-points
router.get(
  '/municipalities/:municipalityId/building-miscellaneous-points',
  [param('municipalityId').isMongoId().withMessage('Invalid municipality ID')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId } = req.params;

      // Get or create building calculation config for the municipality
      const config = await BuildingCalculationConfig.getOrCreateForMunicipality(
        municipalityId,
        new Date().getFullYear(),
      );

      // Extract miscellaneous points for backward compatibility
      const points = {
        _id: config._id,
        municipalityId: config.municipality_id,
        airConditioningPoints:
          config.miscellaneous_points?.air_conditioning?.total_points || 4,
        extraKitchenPoints:
          config.miscellaneous_points?.extra_kitchen?.points_per_kitchen || 1,
        generatorPoints:
          config.miscellaneous_points?.generator?.default_points || 5,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      };

      res.json(points);
    } catch (error) {
      console.error('Error fetching building miscellaneous points:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch building miscellaneous points' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/building-miscellaneous-points
router.put(
  '/municipalities/:municipalityId/building-miscellaneous-points',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    body('airConditioningPoints')
      .isNumeric()
      .withMessage('Air conditioning points must be a number')
      .isInt({ min: -1000, max: 1000 })
      .withMessage('Air conditioning points must be between -1000 and 1000'),
    body('extraKitchenPoints')
      .isNumeric()
      .withMessage('Extra kitchen points must be a number')
      .isInt({ min: -1000, max: 1000 })
      .withMessage('Extra kitchen points must be between -1000 and 1000'),
    body('generatorPoints')
      .isNumeric()
      .withMessage('Generator points must be a number')
      .isInt({ min: -1000, max: 1000 })
      .withMessage('Generator points must be between -1000 and 1000'),
  ],
  async (req, res) => {
    try {
      console.log('PUT /building-miscellaneous-points request body:', req.body);
      console.log('Municipality ID:', req.params.municipalityId);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      console.log('Validation passed, proceeding with database operations...');

      const { municipalityId } = req.params;
      const { airConditioningPoints, extraKitchenPoints, generatorPoints } =
        req.body;

      // Get or create building calculation config
      const config = await BuildingCalculationConfig.getOrCreateForMunicipality(
        municipalityId,
        new Date().getFullYear(),
      );

      // Update miscellaneous points in the comprehensive config
      config.miscellaneous_points = {
        ...config.miscellaneous_points,
        air_conditioning: {
          total_points: parseInt(airConditioningPoints, 10),
        },
        extra_kitchen: {
          points_per_kitchen: parseInt(extraKitchenPoints, 10),
        },
        generator: {
          default_points: parseInt(generatorPoints, 10),
        },
      };

      config.updated_at = new Date();
      config.last_changed = new Date();
      config.change_reason = 'policy_change';

      await config.save();
      console.log('Updated building calculation config miscellaneous points:', {
        airConditioningPoints: parseInt(airConditioningPoints, 10),
        extraKitchenPoints: parseInt(extraKitchenPoints, 10),
        generatorPoints: parseInt(generatorPoints, 10),
      });

      // Return data in expected format for backward compatibility
      const points = {
        _id: config._id,
        municipalityId: config.municipality_id,
        airConditioningPoints: parseInt(airConditioningPoints, 10),
        extraKitchenPoints: parseInt(extraKitchenPoints, 10),
        generatorPoints: parseInt(generatorPoints, 10),
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      };

      res.json({ buildingMiscellaneousPoints: points });
    } catch (error) {
      console.error('Error saving building miscellaneous points:', error);
      res
        .status(500)
        .json({ error: 'Failed to save building miscellaneous points' });
    }
  },
);

module.exports = router;
