const express = require('express');
const router = express.Router();
const LandTaxationCategory = require('../models/LandTaxationCategory');
const { authenticateToken } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/moduleAuth');

// GET /api/municipalities/:municipalityId/land-taxation-categories - Get land taxation categories
router.get(
  '/municipalities/:municipalityId/land-taxation-categories',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      const categories = await LandTaxationCategory.find({
        municipalityId,
      }).sort({ order: 1, name: 1 });

      res.json({ landTaxationCategories: categories });
    } catch (error) {
      console.error('Error fetching land taxation categories:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PUT /api/municipalities/:municipalityId/land-taxation-categories - Update land taxation categories
router.put(
  '/municipalities/:municipalityId/land-taxation-categories',
  authenticateToken,
  requireModuleAccess('assessing'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { categories } = req.body;

      // Validation
      if (!Array.isArray(categories)) {
        return res.status(400).json({
          error: 'Categories must be an array',
        });
      }

      // Validate each category
      for (const category of categories) {
        if (
          !category.name ||
          typeof category.name !== 'string' ||
          !category.name.trim()
        ) {
          return res.status(400).json({
            error: 'Each category must have a non-empty name',
          });
        }

        const taxPercentage = Number(category.taxPercentage);
        if (isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) {
          return res.status(400).json({
            error: 'Tax percentage must be a number between 0 and 100',
          });
        }
      }

      // Check for duplicate names within the request
      const names = categories.map((cat) => cat.name.trim().toLowerCase());
      const uniqueNames = new Set(names);
      if (names.length !== uniqueNames.size) {
        return res.status(400).json({
          error: 'Category names must be unique',
        });
      }

      // Remove all existing categories for this municipality
      await LandTaxationCategory.deleteMany({ municipalityId });

      // Create new categories
      const newCategories = [];
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const newCategory = new LandTaxationCategory({
          municipalityId,
          name: category.name.trim(),
          taxPercentage: Number(category.taxPercentage),
          order: i,
          createdBy: req.user.id,
          updatedBy: req.user.id,
        });
        await newCategory.save();
        newCategories.push(newCategory);
      }

      res.json({
        success: true,
        message: 'Land taxation categories updated successfully',
        landTaxationCategories: newCategories,
      });
    } catch (error) {
      console.error('Error updating land taxation categories:', error);

      // Handle unique constraint errors
      if (error.code === 11000) {
        return res.status(400).json({
          error: 'A category with this name already exists',
        });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

module.exports = router;
