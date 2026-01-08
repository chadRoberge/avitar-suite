const express = require('express');
const router = express.Router();
const WaterBody = require('../models/WaterBody');
const WaterBodyLadder = require('../models/WaterBodyLadder');
const {
  checkYearLock,
  getEffectiveYear,
  isYearLocked,
} = require('../middleware/checkYearLock');

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
      const { name, description, waterBodyType, baseWaterValue } = req.body;

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
        baseWaterValue: baseWaterValue || 0,
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
      const { name, description, waterBodyType, baseWaterValue } = req.body;

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
      if (baseWaterValue !== undefined)
        waterBody.baseWaterValue = baseWaterValue;

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

      waterBody.isActive = false;
      await waterBody.save();

      // Also soft delete associated ladder entries
      await WaterBodyLadder.updateMany(
        { waterBodyId, isActive: true },
        { isActive: false },
      );

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
// @query year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const year = getEffectiveYear(req);

      // Use year-aware query method
      const ladderEntries =
        await WaterBodyLadder.findByMunicipalityAndWaterBodyForYear(
          municipalityId,
          waterBodyId,
          year,
        );

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        success: true,
        ladderEntries,
        year,
        isYearLocked: yearLocked,
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
// @query year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/water-body-ladders',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const year = getEffectiveYear(req);

      // Use year-aware query method
      const ladderEntries = await WaterBodyLadder.findByMunicipalityForYear(
        municipalityId,
        year,
      );

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        success: true,
        ladderEntries,
        year,
        isYearLocked: yearLocked,
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
// @body effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder',
  checkYearLock,
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const { frontage, factor, order, effective_year } = req.body;

      // Validation
      if (frontage === undefined || factor === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Frontage and factor are required',
        });
      }

      if (!effective_year) {
        return res.status(400).json({
          success: false,
          message: 'effective_year is required',
        });
      }

      const ladderEntry = new WaterBodyLadder({
        municipalityId,
        waterBodyId,
        frontage,
        factor,
        order: order || 0,
        effective_year,
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
            'A ladder entry with this frontage already exists for this water body and year',
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
// @body effective_year - required, the year for this configuration
router.put(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder/bulk',
  checkYearLock,
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const { entries, effective_year } = req.body;

      if (!entries || !Array.isArray(entries)) {
        return res.status(400).json({
          success: false,
          message: 'Entries array is required',
        });
      }

      if (!effective_year) {
        return res.status(400).json({
          success: false,
          message: 'effective_year is required',
        });
      }

      // First, soft delete all existing entries for this water body and year
      await WaterBodyLadder.updateMany(
        { municipalityId, waterBodyId, effective_year, isActive: true },
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
          effective_year,
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
// Supports copy-on-write: if editing an inherited entry from a locked year,
// creates a new entry for the target year instead of modifying the original
router.put(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder/:ladderEntryId',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId, ladderEntryId } = req.params;
      const { frontage, factor, order } = req.body;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

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

      const sourceYear = ladderEntry.effective_year;
      const sourceYearLocked = await isYearLocked(municipalityId, sourceYear);
      const isInherited = sourceYear !== targetYear;

      // If editing an inherited entry OR the source year is locked, use copy-on-write
      if (isInherited || sourceYearLocked) {
        // Check if the target year is locked
        const targetYearLocked = await isYearLocked(municipalityId, targetYear);
        if (targetYearLocked) {
          return res.status(403).json({
            success: false,
            message: `Configuration for year ${targetYear} is locked and cannot be modified.`,
            isYearLocked: true,
          });
        }

        // Check if an entry with this frontage already exists for target year
        const existingTargetEntry = await WaterBodyLadder.findOne({
          waterBodyId,
          frontage: frontage !== undefined ? frontage : ladderEntry.frontage,
          effective_year: targetYear,
          isActive: true,
        });

        if (existingTargetEntry) {
          // Update the existing target year entry instead
          if (frontage !== undefined) existingTargetEntry.frontage = frontage;
          if (factor !== undefined) existingTargetEntry.factor = factor;
          if (order !== undefined) existingTargetEntry.order = order;
          await existingTargetEntry.save();

          return res.json({
            success: true,
            ladderEntry: existingTargetEntry,
            copyOnWrite: true,
            message: `Updated existing entry for year ${targetYear}`,
          });
        }

        // Create a new entry for the target year (copy-on-write)
        const newEntry = new WaterBodyLadder({
          frontage: frontage !== undefined ? frontage : ladderEntry.frontage,
          factor: factor !== undefined ? factor : ladderEntry.factor,
          order: order !== undefined ? order : ladderEntry.order,
          waterBodyId,
          municipalityId,
          effective_year: targetYear,
          effective_year_end: null,
          previous_version_id: ladderEntryId,
          next_version_id: null,
          isActive: true,
        });

        await newEntry.save();

        // Update the source entry with version chain
        await WaterBodyLadder.findByIdAndUpdate(ladderEntryId, {
          effective_year_end: targetYear,
          next_version_id: newEntry._id,
        });

        return res.status(201).json({
          success: true,
          ladderEntry: newEntry,
          copyOnWrite: true,
          previousVersionId: ladderEntryId,
          message: `Created new entry for year ${targetYear} (supersedes entry from ${sourceYear})`,
        });
      }

      // Direct update for non-inherited, non-locked entries
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
            'A ladder entry with this frontage already exists for this water body and year',
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
// Supports temporal deletion: if deleting an inherited entry from a locked year,
// marks it as ending in the target year instead of permanently deleting
router.delete(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder/:ladderEntryId',
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId, ladderEntryId } = req.params;

      // Get the target year from query params (the year the user is currently viewing)
      const targetYear = getEffectiveYear(req);

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

      const sourceYear = ladderEntry.effective_year;
      const sourceYearLocked = await isYearLocked(municipalityId, sourceYear);
      const isInherited = sourceYear !== targetYear;

      // If deleting an inherited entry OR the source year is locked, use temporal deletion
      if (isInherited || sourceYearLocked) {
        // Check if the target year is locked
        const targetYearLocked = await isYearLocked(municipalityId, targetYear);
        if (targetYearLocked) {
          return res.status(403).json({
            success: false,
            message: `Configuration for year ${targetYear} is locked and cannot be modified.`,
            isYearLocked: true,
          });
        }

        // Temporal delete: mark the entry as ending in the target year
        // This hides it for targetYear and all future years
        await WaterBodyLadder.findByIdAndUpdate(ladderEntryId, {
          effective_year_end: targetYear,
        });

        return res.json({
          success: true,
          message: `Ladder entry hidden for year ${targetYear} and beyond`,
          temporalDelete: true,
          effectiveYearEnd: targetYear,
        });
      }

      // Direct delete for entries from the current unlocked year
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
// @body effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/ladder/defaults',
  checkYearLock,
  async (req, res) => {
    try {
      const { municipalityId, waterBodyId } = req.params;
      const { effective_year } = req.body;

      if (!effective_year) {
        return res.status(400).json({
          success: false,
          message: 'effective_year is required',
        });
      }

      // Note: createDefaults needs to be updated to accept effective_year
      // For now, create defaults with the specified year
      const defaults = [
        { frontage: 50, factor: 80, order: 1 },
        { frontage: 100, factor: 100, order: 2 },
        { frontage: 200, factor: 120, order: 3 },
        { frontage: 500, factor: 150, order: 4 },
      ];

      const ladderEntries = [];
      for (const defaultEntry of defaults) {
        try {
          const existing = await WaterBodyLadder.findOne({
            municipalityId,
            waterBodyId,
            frontage: defaultEntry.frontage,
            effective_year,
            isActive: true,
          });

          if (!existing) {
            const created = await WaterBodyLadder.create({
              municipalityId,
              waterBodyId,
              ...defaultEntry,
              effective_year,
            });
            ladderEntries.push(created);
          } else {
            ladderEntries.push(existing);
          }
        } catch (err) {
          if (err.code !== 11000) {
            throw err;
          }
        }
      }

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
// @query year - optional, defaults to current year
router.post(
  '/municipalities/:municipalityId/water-bodies/:waterBodyId/calculate-value',
  async (req, res) => {
    try {
      const { waterBodyId } = req.params;
      const { frontage } = req.body;
      const year = getEffectiveYear(req);

      if (frontage === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Frontage is required',
        });
      }

      // Use year-aware calculation method
      const calculatedValue = await WaterBodyLadder.calculateValueForYear(
        waterBodyId,
        frontage,
        year,
      );

      res.json({
        success: true,
        frontage,
        calculatedValue,
        year,
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
