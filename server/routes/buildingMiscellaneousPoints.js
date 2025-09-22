const express = require('express');
const router = express.Router();
const BuildingMiscellaneousPoints = require('../models/BuildingMiscellaneousPoints');
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

      // Get or create miscellaneous points for the municipality
      const points =
        await BuildingMiscellaneousPoints.getOrCreateForMunicipality(
          municipalityId,
        );

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

      // Find existing record or create new one
      let points = await BuildingMiscellaneousPoints.findOne({
        municipalityId,
      });

      if (points) {
        // Update existing record
        points.airConditioningPoints = parseInt(airConditioningPoints, 10);
        points.extraKitchenPoints = parseInt(extraKitchenPoints, 10);
        points.generatorPoints = parseInt(generatorPoints, 10);
        points.updatedAt = new Date();

        await points.save();
        console.log('Updated existing miscellaneous points:', points);
      } else {
        // Create new record
        points = new BuildingMiscellaneousPoints({
          municipalityId,
          airConditioningPoints: parseInt(airConditioningPoints, 10),
          extraKitchenPoints: parseInt(extraKitchenPoints, 10),
          generatorPoints: parseInt(generatorPoints, 10),
        });

        await points.save();
        console.log('Created new miscellaneous points:', points);
      }

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
