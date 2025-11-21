const express = require('express');
const router = express.Router();
const WaterBody = require('../models/WaterBody');
const WaterBodyLadder = require('../models/WaterBodyLadder');

// Get all water bodies for a municipality
router.get('/municipalities/:municipalityId/water-bodies', async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const waterBodies = await WaterBody.findByMunicipality(municipalityId);

    res.json({
      success: true,
      waterBodies,
    });
  } catch (error) {
    console.error('Error fetching water bodies:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching water bodies',
    });
  }
});

// Get a specific water body
router.get(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const waterBody = await WaterBody.findByMunicipalityAndId(
        municipalityId,
        waterBodyId,
      );

      if (!waterBody) {
        return res.status(404).json({
          success: false,
          message: 'Water body not found',
        });
      }

      res.json({
        success: true,
        waterBody,
      });
    } catch (error) {
      console.error('Error fetching water body:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching water body',
      });
    }
  },
);

// Create a new water body
router.post(
  '/municipalities/:municipalityId/water-bodies',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { name, description, waterBodyType } = req.body;

      // Validation
      if (!name || !description || !waterBodyType) {
        return res.status(400).json({
          success: false,
          message: 'Name, description, and water body type are required',
        });
      }

      const waterBody = new WaterBody({
        municipalityId,
        name,
        description,
        waterBodyType,
      });

      await waterBody.save();

      res.status(201).json({
        success: true,
        waterBody,
      });
    } catch (error) {
      console.error('Error creating water body:', error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'A water body with this name already exists',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error creating water body',
      });
    }
  },
);

// Update a water body
router.put(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const { name, description, waterBodyType } = req.body;

      const waterBody = await WaterBody.findByMunicipalityAndId(
        municipalityId,
        waterBodyId,
      );

      if (!waterBody) {
        return res.status(404).json({
          success: false,
          message: 'Water body not found',
        });
      }

      if (name) waterBody.name = name;
      if (description) waterBody.description = description;
      if (waterBodyType) waterBody.waterBodyType = waterBodyType;

      await waterBody.save();

      res.json({
        success: true,
        waterBody,
      });
    } catch (error) {
      console.error('Error updating water body:', error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'A water body with this name already exists',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error updating water body',
      });
    }
  },
);

// Delete a water body (soft delete)
router.delete(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      console.log(
        'Deleting water body:',
        waterBodyId,
        'for municipality:',
        municipalityId,
      );

      const waterBody = await WaterBody.findByMunicipalityAndId(
        municipalityId,
        waterBodyId,
      );
      console.log('Found water body:', waterBody ? 'Yes' : 'No');

      if (!waterBody) {
        return res.status(404).json({
          success: false,
          message: 'Water body not found',
        });
      }

      waterBody.isActive = false;
      await waterBody.save();
      console.log('Water body soft deleted');

      // Also soft delete associated ladder entries
      const WaterBodyLadder = require('../models/WaterBodyLadder');
      await WaterBodyLadder.updateMany(
        { waterBodyId, isActive: true },
        { isActive: false },
      );
      console.log('Associated ladder entries soft deleted');

      res.json({
        success: true,
        message: 'Water body deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting water body:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting water body',
      });
    }
  },
);

// Create default water bodies for a municipality
router.post(
  '/municipalities/:municipalityId/water-bodies/defaults',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const waterBodies = await WaterBody.createDefaults(municipalityId);

      res.json({
        success: true,
        waterBodies,
      });
    } catch (error) {
      console.error('Error creating default water bodies:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating default water bodies',
      });
    }
  },
);

// === WATER BODY LADDER ROUTES ===

// Get ladder entries for a water body
router.get(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const ladderEntries =
        await WaterBodyLadder.findByMunicipalityAndWaterBody(
          municipalityId,
          waterBodyId,
        );

      res.json({
        success: true,
        ladderEntries,
      });
    } catch (error) {
      console.error('Error fetching water body ladder:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching water body ladder',
      });
    }
  },
);

// Get all ladders for a municipality
router.get(
  '/municipalities/:municipalityId/water-body-ladders',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const ladderEntries =
        await WaterBodyLadder.findByMunicipality(municipalityId);

      res.json({
        success: true,
        ladderEntries,
      });
    } catch (error) {
      console.error('Error fetching water body ladders:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching water body ladders',
      });
    }
  },
);

// Create a ladder entry
router.post(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const { frontage, factor, order } = req.body;

      // Validation
      if (frontage === undefined || factor === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Frontage and factor are required',
        });
      }

      const ladderEntry = new WaterBodyLadder({
        municipalityId,
        waterBodyId,
        frontage,
        factor,
        order: order || 0,
      });

      await ladderEntry.save();

      res.status(201).json({
        success: true,
        ladderEntry,
      });
    } catch (error) {
      console.error('Error creating ladder entry:', error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message:
            'A ladder entry with this frontage already exists for this water body',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error creating ladder entry',
      });
    }
  },
);

// Bulk update/create ladder entries for a water body
router.put(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder/bulk',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const { entries } = req.body;

      if (!entries || !Array.isArray(entries)) {
        return res.status(400).json({
          success: false,
          message: 'Entries array is required',
        });
      }

      // First, soft delete all existing entries for this water body
      await WaterBodyLadder.updateMany(
        { municipalityId, waterBodyId, isActive: true },
        { isActive: false },
      );

      // Create new entries
      const newEntries = [];
      for (const entry of entries) {
        const { frontage, factor, order } = entry;

        if (frontage === undefined || factor === undefined) {
          return res.status(400).json({
            success: false,
            message: 'Each entry must have frontage and factor',
          });
        }

        const ladderEntry = new WaterBodyLadder({
          municipalityId,
          waterBodyId,
          frontage,
          factor,
          order: order || 0,
        });

        await ladderEntry.save();
        newEntries.push(ladderEntry);
      }

      res.json({
        success: true,
        ladderEntries: newEntries,
      });
    } catch (error) {
      console.error('Error bulk updating ladder entries:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating ladder entries',
      });
    }
  },
);

// Update a ladder entry
router.put(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder/:ladderEntryId',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId, ladderEntryId } = req.params;
      const { frontage, factor, order } = req.body;

      const ladderEntry = await WaterBodyLadder.findOne({
        _id: ladderEntryId,
        municipalityId,
        waterBodyId,
        isActive: true,
      });

      if (!ladderEntry) {
        return res.status(404).json({
          success: false,
          message: 'Ladder entry not found',
        });
      }

      if (frontage !== undefined) ladderEntry.frontage = frontage;
      if (factor !== undefined) ladderEntry.factor = factor;
      if (order !== undefined) ladderEntry.order = order;

      await ladderEntry.save();

      res.json({
        success: true,
        ladderEntry,
      });
    } catch (error) {
      console.error('Error updating ladder entry:', error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message:
            'A ladder entry with this frontage already exists for this water body',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error updating ladder entry',
      });
    }
  },
);

// Delete a ladder entry
router.delete(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder/:ladderEntryId',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId, ladderEntryId } = req.params;

      const ladderEntry = await WaterBodyLadder.findOne({
        _id: ladderEntryId,
        municipalityId,
        waterBodyId,
        isActive: true,
      });

      if (!ladderEntry) {
        return res.status(404).json({
          success: false,
          message: 'Ladder entry not found',
        });
      }

      ladderEntry.isActive = false;
      await ladderEntry.save();

      res.json({
        success: true,
        message: 'Ladder entry deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting ladder entry:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting ladder entry',
      });
    }
  },
);

// Create default ladder for a water body
router.post(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder/defaults',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const ladderEntries = await WaterBodyLadder.createDefaults(
        municipalityId,
        waterBodyId,
      );

      res.json({
        success: true,
        ladderEntries,
      });
    } catch (error) {
      console.error('Error creating default ladder:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating default ladder',
      });
    }
  },
);

// Calculate value for a given frontage
router.post(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/calculate-value',
  async (req, res) => {
    try {
      const { waterBodyId } = req.params;
      const { frontage } = req.body;

      if (frontage === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Frontage is required',
        });
      }

      const calculatedValue = await WaterBodyLadder.calculateValue(
        waterBodyId,
        frontage,
      );

      res.json({
        success: true,
        frontage,
        calculatedValue,
      });
    } catch (error) {
      console.error('Error calculating value:', error);
      res.status(500).json({
        success: false,
        message: 'Error calculating value',
      });
    }
  },
);

module.exports = router;
