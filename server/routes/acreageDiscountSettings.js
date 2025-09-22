const express = require('express');
const router = express.Router();
const AcreageDiscountSettings = require('../models/AcreageDiscountSettings');

// GET /api/municipalities/:municipalityId/acreage-discount-settings - Get acreage discount settings for a municipality
router.get(
  '/municipalities/:municipalityId/acreage-discount-settings',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      let settings =
        await AcreageDiscountSettings.findByMunicipality(municipalityId);

      // If no settings exist, create default ones
      if (!settings) {
        settings = await AcreageDiscountSettings.createDefault(municipalityId);
      }

      res.json({ acreageDiscountSettings: settings });
    } catch (error) {
      console.error('Error fetching acreage discount settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/acreage-discount-settings - Update acreage discount settings
router.put(
  '/municipalities/:municipalityId/acreage-discount-settings',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        minimumQualifyingAcreage,
        maximumQualifyingAcreage,
        maximumDiscountPercentage,
      } = req.body;

      // Validation
      if (
        minimumQualifyingAcreage === undefined ||
        maximumQualifyingAcreage === undefined ||
        maximumDiscountPercentage === undefined
      ) {
        return res.status(400).json({
          error:
            'Missing required fields: minimumQualifyingAcreage, maximumQualifyingAcreage, maximumDiscountPercentage',
        });
      }

      if (
        typeof minimumQualifyingAcreage !== 'number' ||
        minimumQualifyingAcreage < 0.1 ||
        minimumQualifyingAcreage > 1000
      ) {
        return res.status(400).json({
          error:
            'minimumQualifyingAcreage must be a number between 0.1 and 1000',
        });
      }

      if (
        typeof maximumQualifyingAcreage !== 'number' ||
        maximumQualifyingAcreage < 1 ||
        maximumQualifyingAcreage > 10000
      ) {
        return res.status(400).json({
          error:
            'maximumQualifyingAcreage must be a number between 1 and 10000',
        });
      }

      if (
        typeof maximumDiscountPercentage !== 'number' ||
        maximumDiscountPercentage < 1 ||
        maximumDiscountPercentage > 95
      ) {
        return res.status(400).json({
          error: 'maximumDiscountPercentage must be a number between 1 and 95',
        });
      }

      if (maximumQualifyingAcreage <= minimumQualifyingAcreage) {
        return res.status(400).json({
          error:
            'maximumQualifyingAcreage must be greater than minimumQualifyingAcreage',
        });
      }

      // Find existing settings or create new ones
      let settings =
        await AcreageDiscountSettings.findByMunicipality(municipalityId);

      if (settings) {
        // Update existing settings
        settings.minimumQualifyingAcreage = minimumQualifyingAcreage;
        settings.maximumQualifyingAcreage = maximumQualifyingAcreage;
        settings.maximumDiscountPercentage = maximumDiscountPercentage;
        settings.updatedAt = new Date();

        await settings.save();
      } else {
        // Create new settings
        settings = new AcreageDiscountSettings({
          municipalityId,
          minimumQualifyingAcreage,
          maximumQualifyingAcreage,
          maximumDiscountPercentage,
        });

        await settings.save();
      }

      res.json({ acreageDiscountSettings: settings });
    } catch (error) {
      console.error('Error updating acreage discount settings:', error);

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

// POST /api/municipalities/:municipalityId/acreage-discount-settings/calculate - Calculate discount for given acreage
router.post(
  '/municipalities/:municipalityId/acreage-discount-settings/calculate',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { acreage } = req.body;

      if (typeof acreage !== 'number' || acreage <= 0) {
        return res.status(400).json({
          error: 'acreage must be a positive number',
        });
      }

      let settings =
        await AcreageDiscountSettings.findByMunicipality(municipalityId);

      // If no settings exist, create default ones
      if (!settings) {
        settings = await AcreageDiscountSettings.createDefault(municipalityId);
      }

      const discountPercentage = settings.calculateDiscount(acreage);

      res.json({
        acreage,
        discountPercentage,
        settings: {
          minimumQualifyingAcreage: settings.minimumQualifyingAcreage,
          maximumQualifyingAcreage: settings.maximumQualifyingAcreage,
          maximumDiscountPercentage: settings.maximumDiscountPercentage,
        },
      });
    } catch (error) {
      console.error('Error calculating acreage discount:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
