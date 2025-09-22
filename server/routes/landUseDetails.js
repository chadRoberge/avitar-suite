const express = require('express');
const router = express.Router();
const LandUseDetail = require('../models/LandUseDetail');

// GET /api/municipalities/:municipalityId/land-use-details - Get all land use details for a municipality
router.get(
  '/municipalities/:municipalityId/land-use-details',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      const landUseDetails = await LandUseDetail.find({
        municipalityId,
        isActive: true,
      }).sort({ code: 1 });

      res.json({ landUseDetails });
    } catch (error) {
      console.error('Error fetching land use details:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/municipalities/:municipalityId/land-use-details - Create a new land use detail
router.post(
  '/municipalities/:municipalityId/land-use-details',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { code, displayText, landUseType } = req.body;

      // Validation
      if (!code || !displayText || !landUseType) {
        return res.status(400).json({
          error: 'Missing required fields: code, displayText, landUseType',
        });
      }

      const validLandUseTypes = [
        'residential',
        'residential_waterfront',
        'commercial',
        'residential_multifamily',
      ];
      if (!validLandUseTypes.includes(landUseType)) {
        return res.status(400).json({
          error: 'landUseType must be one of: ' + validLandUseTypes.join(', '),
        });
      }

      const landUseDetail = new LandUseDetail({
        municipalityId,
        code: code.toUpperCase().trim(),
        displayText: displayText.trim(),
        landUseType,
      });

      const savedLandUseDetail = await landUseDetail.save();
      res.status(201).json({ landUseDetail: savedLandUseDetail });
    } catch (error) {
      console.error('Error creating land use detail:', error);

      if (error.code === 11000) {
        // Duplicate key error
        return res.status(400).json({
          error:
            'A land use detail with this code already exists for this municipality',
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

// PUT /api/municipalities/:municipalityId/land-use-details/:id - Update a land use detail
router.put(
  '/municipalities/:municipalityId/land-use-details/:id',
  async (req, res) => {
    try {
      const { municipalityId, id } = req.params;
      const { code, displayText, landUseType } = req.body;

      // Validation
      if (!code || !displayText || !landUseType) {
        return res.status(400).json({
          error: 'Missing required fields: code, displayText, landUseType',
        });
      }

      const validLandUseTypes = [
        'residential',
        'residential_waterfront',
        'commercial',
        'residential_multifamily',
      ];
      if (!validLandUseTypes.includes(landUseType)) {
        return res.status(400).json({
          error: 'landUseType must be one of: ' + validLandUseTypes.join(', '),
        });
      }

      const landUseDetail = await LandUseDetail.findOneAndUpdate(
        { _id: id, municipalityId },
        {
          code: code.toUpperCase().trim(),
          displayText: displayText.trim(),
          landUseType,
          updatedAt: new Date(),
        },
        { new: true },
      );

      if (!landUseDetail) {
        return res.status(404).json({ error: 'Land use detail not found' });
      }

      res.json({ landUseDetail });
    } catch (error) {
      console.error('Error updating land use detail:', error);

      if (error.code === 11000) {
        // Duplicate key error
        return res.status(400).json({
          error:
            'A land use detail with this code already exists for this municipality',
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

// DELETE /api/municipalities/:municipalityId/land-use-details/:id - Delete a land use detail (soft delete)
router.delete(
  '/municipalities/:municipalityId/land-use-details/:id',
  async (req, res) => {
    try {
      const { municipalityId, id } = req.params;

      const landUseDetail = await LandUseDetail.findOneAndUpdate(
        { _id: id, municipalityId },
        { isActive: false, updatedAt: new Date() },
        { new: true },
      );

      if (!landUseDetail) {
        return res.status(404).json({ error: 'Land use detail not found' });
      }

      res.json({ message: 'Land use detail deleted successfully' });
    } catch (error) {
      console.error('Error deleting land use detail:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
