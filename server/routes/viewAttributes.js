const express = require('express');
const router = express.Router();
const ViewAttribute = require('../models/ViewAttribute');
const PropertyView = require('../models/PropertyView');
const {
  checkYearLock,
  getEffectiveYear,
  isYearLocked,
} = require('../middleware/checkYearLock');

// Get all view attributes for a municipality
// @query year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/view-attributes',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const year = getEffectiveYear(req);

      // Use year-aware query method
      const viewAttributes = await ViewAttribute.findByMunicipalityForYear(
        municipalityId,
        year,
      );

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        success: true,
        viewAttributes,
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Error fetching view attributes:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching view attributes',
      });
    }
  },
);

// Get all view attributes of a specific type for a municipality
// @query year - optional, defaults to current year
router.get(
  '/municipalities/:municipalityId/view-attributes/type/:attributeType',
  async (req, res) => {
    try {
      const { municipalityId, attributeType } = req.params;
      const year = getEffectiveYear(req);

      // Use year-aware query method
      const viewAttributes = await ViewAttribute.findByMunicipalityAndTypeForYear(
        municipalityId,
        attributeType,
        year,
      );

      // Check if the year is locked
      const yearLocked = await isYearLocked(municipalityId, year);

      res.json({
        success: true,
        viewAttributes,
        year,
        isYearLocked: yearLocked,
      });
    } catch (error) {
      console.error('Error fetching view attributes by type:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching view attributes',
      });
    }
  },
);

// Get a specific view attribute by ID
router.get(
  '/municipalities/:municipalityId/view-attributes/:attributeId',
  async (req, res) => {
    try {
      const { municipalityId, attributeId } = req.params;
      const viewAttribute = await ViewAttribute.findByMunicipalityAndId(
        municipalityId,
        attributeId,
      );

      if (!viewAttribute) {
        return res.status(404).json({
          success: false,
          message: 'View attribute not found',
        });
      }

      res.json({
        success: true,
        viewAttribute,
      });
    } catch (error) {
      console.error('Error fetching view attribute:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching view attribute',
      });
    }
  },
);

// Create a new view attribute
// @body effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/view-attributes',
  checkYearLock,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        attributeType,
        name,
        description,
        displayText,
        factor,
        effective_year,
      } = req.body;

      // Validation
      if (
        !attributeType ||
        !name ||
        !description ||
        !displayText ||
        factor === undefined ||
        !effective_year
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Attribute type, name, description, display text, factor, and effective_year are required',
        });
      }

      if (factor < 0 || factor > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Factor must be between 0 and 1000',
        });
      }

      const viewAttribute = new ViewAttribute({
        municipalityId,
        attributeType,
        name,
        description,
        displayText,
        factor,
        effective_year,
      });

      await viewAttribute.save();

      res.status(201).json({
        success: true,
        viewAttribute,
      });
    } catch (error) {
      console.error('Error creating view attribute:', error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message:
            'A view attribute with this name already exists for this type and year',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error creating view attribute',
      });
    }
  },
);

// Update a view attribute
router.put(
  '/municipalities/:municipalityId/view-attributes/:attributeId',
  async (req, res) => {
    try {
      const { municipalityId, attributeId } = req.params;
      const { name, description, displayText, factor } = req.body;

      const viewAttribute = await ViewAttribute.findByMunicipalityAndId(
        municipalityId,
        attributeId,
      );

      if (!viewAttribute) {
        return res.status(404).json({
          success: false,
          message: 'View attribute not found',
        });
      }

      // Check if the year is locked
      const yearLocked = await isYearLocked(
        municipalityId,
        viewAttribute.effective_year,
      );
      if (yearLocked) {
        return res.status(403).json({
          success: false,
          message: `Configuration for year ${viewAttribute.effective_year} is locked and cannot be modified.`,
          isYearLocked: true,
        });
      }

      // Validate input
      if (factor !== undefined && (factor < 0 || factor > 1000)) {
        return res.status(400).json({
          success: false,
          message: 'Factor must be between 0 and 1000',
        });
      }

      if (name && name.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Name must be 100 characters or less',
        });
      }

      if (description && description.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Description must be 200 characters or less',
        });
      }

      if (displayText && displayText.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Display text must be 50 characters or less',
        });
      }

      // Update fields
      if (name !== undefined) viewAttribute.name = name.trim();
      if (description !== undefined)
        viewAttribute.description = description.trim();
      if (displayText !== undefined)
        viewAttribute.displayText = displayText.trim();
      if (factor !== undefined) viewAttribute.factor = factor;

      await viewAttribute.save();

      // Update all property views that reference this attribute
      try {
        const updatedViewsCount = await PropertyView.updateViewsForAttribute(
          attributeId,
          viewAttribute,
        );
        console.log(
          `Updated ${updatedViewsCount} property views after attribute update`,
        );
      } catch (error) {
        console.error(
          'Error updating property views after attribute update:',
          error,
        );
        // Don't fail the main operation, but log the error
      }

      res.json({
        success: true,
        viewAttribute,
      });
    } catch (error) {
      console.error('Error updating view attribute:', error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message:
            'A view attribute with this name already exists for this type and year',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error updating view attribute',
      });
    }
  },
);

// Delete a view attribute (soft delete)
router.delete(
  '/municipalities/:municipalityId/view-attributes/:attributeId',
  async (req, res) => {
    try {
      const { municipalityId, attributeId } = req.params;

      const viewAttribute = await ViewAttribute.findByMunicipalityAndId(
        municipalityId,
        attributeId,
      );

      if (!viewAttribute) {
        return res.status(404).json({
          success: false,
          message: 'View attribute not found',
        });
      }

      // Check if the year is locked
      const yearLocked = await isYearLocked(
        municipalityId,
        viewAttribute.effective_year,
      );
      if (yearLocked) {
        return res.status(403).json({
          success: false,
          message: `Configuration for year ${viewAttribute.effective_year} is locked and cannot be modified.`,
          isYearLocked: true,
        });
      }

      viewAttribute.isActive = false;
      await viewAttribute.save();

      res.json({
        success: true,
        message: 'View attribute deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting view attribute:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting view attribute',
      });
    }
  },
);

// Create default view attributes for a municipality
// @body effective_year - required, the year for this configuration
router.post(
  '/municipalities/:municipalityId/view-attributes/defaults',
  checkYearLock,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { effective_year } = req.body;

      if (!effective_year) {
        return res.status(400).json({
          success: false,
          message: 'effective_year is required',
        });
      }

      // Create defaults with the specified year
      const defaults = [
        {
          attributeType: 'subject',
          name: 'Mountains',
          description:
            'View of mountain regions that extend 100+ feet out of the ground',
          displayText: 'Mountains',
          factor: 100,
        },
        {
          attributeType: 'subject',
          name: 'Ocean',
          description: 'View of open ocean water',
          displayText: 'Ocean View',
          factor: 120,
        },
        {
          attributeType: 'width',
          name: 'Panoramic',
          description: 'Wide panoramic view covering 180 degrees or more',
          displayText: 'Panoramic',
          factor: 150,
        },
        {
          attributeType: 'width',
          name: 'Partial',
          description: 'Limited view covering less than 90 degrees',
          displayText: 'Partial View',
          factor: 80,
        },
        {
          attributeType: 'distance',
          name: 'Close',
          description: 'View subject is within 1 mile',
          displayText: 'Close Distance',
          factor: 130,
        },
        {
          attributeType: 'distance',
          name: 'Distant',
          description: 'View subject is more than 5 miles away',
          displayText: 'Distant View',
          factor: 90,
        },
        {
          attributeType: 'depth',
          name: 'Deep',
          description: 'Extensive depth with multiple layers of view',
          displayText: 'Deep View',
          factor: 110,
        },
        {
          attributeType: 'depth',
          name: 'Shallow',
          description: 'Limited depth with obstructed or shallow view',
          displayText: 'Shallow View',
          factor: 85,
        },
      ];

      const viewAttributes = [];
      for (const defaultAttr of defaults) {
        try {
          const existing = await ViewAttribute.findOne({
            municipalityId,
            attributeType: defaultAttr.attributeType,
            name: defaultAttr.name,
            effective_year,
            isActive: true,
          });

          if (!existing) {
            const created = await ViewAttribute.create({
              municipalityId,
              ...defaultAttr,
              effective_year,
            });
            viewAttributes.push(created);
          } else {
            viewAttributes.push(existing);
          }
        } catch (err) {
          if (err.code !== 11000) {
            throw err;
          }
        }
      }

      res.json({
        success: true,
        viewAttributes,
      });
    } catch (error) {
      console.error('Error creating default view attributes:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating default view attributes',
      });
    }
  },
);

module.exports = router;
