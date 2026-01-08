const express = require('express');
const router = express.Router();
const CurrentUse = require('../models/CurrentUse');
const CurrentUseSettings = require('../models/CurrentUseSettings');

// GET /api/municipalities/:municipalityId/current-use - Get all current use categories for a municipality
// Supports year parameter for year-aware queries (inheritance pattern)
router.get('/municipalities/:municipalityId/current-use', async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const requestedYear = parseInt(req.query.year) || new Date().getFullYear();

    console.log(
      `[CurrentUse] Finding categories for municipality ${municipalityId}, year <= ${requestedYear}`,
    );

    // Find the most recent effective year <= requested year
    const latestCategory = await CurrentUse.findOne({
      municipalityId,
      effective_year: { $lte: requestedYear },
      isActive: true,
    })
      .sort({ effective_year: -1 })
      .select('effective_year');

    if (!latestCategory) {
      console.log(
        `[CurrentUse] No categories found for year <= ${requestedYear}`,
      );
      return res.json({
        currentUseCategories: [],
        year: requestedYear,
        isYearLocked: false,
      });
    }

    const effectiveYear = latestCategory.effective_year;
    console.log(`[CurrentUse] Found latest year: ${effectiveYear}`);

    const currentUseCategories = await CurrentUse.find({
      municipalityId,
      effective_year: effectiveYear,
      isActive: true,
    }).sort({ code: 1 });

    console.log(
      `[CurrentUse] Returning ${currentUseCategories.length} categories`,
    );

    res.json({
      currentUseCategories,
      year: effectiveYear,
      isYearLocked: effectiveYear < requestedYear, // Locked if viewing inherited year
    });
  } catch (error) {
    console.error('Error fetching current use categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/municipalities/:municipalityId/current-use - Create a new current use category
// Supports year query parameter or effective_year in body
router.post('/municipalities/:municipalityId/current-use', async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const { code, description, displayText, minRate, maxRate, effective_year } =
      req.body;
    const effectiveYear =
      effective_year || parseInt(req.query.year) || new Date().getFullYear();

    // Validation
    if (
      !code ||
      !description ||
      !displayText ||
      minRate === undefined ||
      maxRate === undefined
    ) {
      return res.status(400).json({
        error:
          'Missing required fields: code, description, displayText, minRate, maxRate',
      });
    }

    if (typeof minRate !== 'number' || minRate < 0) {
      return res.status(400).json({
        error: 'minRate must be a positive number',
      });
    }

    if (typeof maxRate !== 'number' || maxRate < 0) {
      return res.status(400).json({
        error: 'maxRate must be a positive number',
      });
    }

    if (minRate > maxRate) {
      return res.status(400).json({
        error: 'Minimum rate cannot be greater than maximum rate',
      });
    }

    const currentUse = new CurrentUse({
      municipalityId,
      code: code.toUpperCase().trim(),
      description: description.trim(),
      displayText: displayText.trim(),
      minRate: parseFloat(minRate),
      maxRate: parseFloat(maxRate),
      effective_year: effectiveYear,
    });

    const savedCurrentUse = await currentUse.save();
    res.status(201).json({ currentUse: savedCurrentUse });
  } catch (error) {
    console.error('Error creating current use category:', error);

    if (error.code === 11000) {
      // Duplicate key error
      return res.status(400).json({
        error:
          'A current use category with this code already exists for this municipality',
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
});

// PUT /api/municipalities/:municipalityId/current-use/:id - Update a current use category
router.put(
  '/municipalities/:municipalityId/current-use/:id',
  async (req, res) => {
    try {
      const { municipalityId, id } = req.params;
      const { code, description, displayText, minRate, maxRate } = req.body;

      // Validation
      if (
        !code ||
        !description ||
        !displayText ||
        minRate === undefined ||
        maxRate === undefined
      ) {
        return res.status(400).json({
          error:
            'Missing required fields: code, description, displayText, minRate, maxRate',
        });
      }

      if (typeof minRate !== 'number' || minRate < 0) {
        return res.status(400).json({
          error: 'minRate must be a positive number',
        });
      }

      if (typeof maxRate !== 'number' || maxRate < 0) {
        return res.status(400).json({
          error: 'maxRate must be a positive number',
        });
      }

      if (minRate > maxRate) {
        return res.status(400).json({
          error: 'Minimum rate cannot be greater than maximum rate',
        });
      }

      const currentUse = await CurrentUse.findOneAndUpdate(
        { _id: id, municipalityId },
        {
          code: code.toUpperCase().trim(),
          description: description.trim(),
          displayText: displayText.trim(),
          minRate: parseFloat(minRate),
          maxRate: parseFloat(maxRate),
          updatedAt: new Date(),
        },
        { new: true },
      );

      if (!currentUse) {
        return res
          .status(404)
          .json({ error: 'Current use category not found' });
      }

      res.json({ currentUse });
    } catch (error) {
      console.error('Error updating current use category:', error);

      if (error.code === 11000) {
        // Duplicate key error
        return res.status(400).json({
          error:
            'A current use category with this code already exists for this municipality',
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

// DELETE /api/municipalities/:municipalityId/current-use/:id - Delete a current use category (soft delete)
router.delete(
  '/municipalities/:municipalityId/current-use/:id',
  async (req, res) => {
    try {
      const { municipalityId, id } = req.params;

      const currentUse = await CurrentUse.findOneAndUpdate(
        { _id: id, municipalityId },
        { isActive: false, updatedAt: new Date() },
        { new: true },
      );

      if (!currentUse) {
        return res
          .status(404)
          .json({ error: 'Current use category not found' });
      }

      res.json({ message: 'Current use category deleted successfully' });
    } catch (error) {
      console.error('Error deleting current use category:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/municipalities/:municipalityId/current-use-settings - Get current use settings for a municipality
router.get(
  '/municipalities/:municipalityId/current-use-settings',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      let settings = await CurrentUseSettings.findOne({ municipalityId });

      // If no settings exist, create default settings
      if (!settings) {
        settings = new CurrentUseSettings({
          municipalityId,
          showAdValorem: true,
        });
        await settings.save();
      }

      res.json({ settings });
    } catch (error) {
      console.error('Error fetching current use settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/current-use-settings - Update current use settings for a municipality
router.put(
  '/municipalities/:municipalityId/current-use-settings',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { showAdValorem } = req.body;

      // Validation
      if (typeof showAdValorem !== 'boolean') {
        return res.status(400).json({
          error: 'showAdValorem must be a boolean value',
        });
      }

      let settings = await CurrentUseSettings.findOneAndUpdate(
        { municipalityId },
        { showAdValorem, updatedAt: new Date() },
        { new: true, upsert: true },
      );

      res.json({ settings });
    } catch (error) {
      console.error('Error updating current use settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
