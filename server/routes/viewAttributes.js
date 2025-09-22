const express = require('express');
const router = express.Router();
const ViewAttribute = require('../models/ViewAttribute');

// Get all view attributes for a municipality
router.get(
  '/municipalities/:municipalityId/view-attributes',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const viewAttributes =
        await ViewAttribute.findByMunicipality(municipalityId);

      res.json({
        success: true,
        viewAttributes,
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
router.get(
  '/municipalities/:municipalityId/view-attributes/type/:attributeType',
  async (req, res) => {
    try {
      const { municipalityId, attributeType } = req.params;
      const viewAttributes = await ViewAttribute.findByMunicipalityAndType(
        municipalityId,
        attributeType,
      );

      res.json({
        success: true,
        viewAttributes,
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
router.post(
  '/municipalities/:municipalityId/view-attributes',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { attributeType, name, description, displayText, factor } =
        req.body;

      console.log('POST /view-attributes - municipalityId:', municipalityId);
      console.log('POST /view-attributes - body:', req.body);

      // Validation (simplified to match waterfront)
      if (
        !attributeType ||
        !name ||
        !description ||
        !displayText ||
        factor === undefined
      ) {
        console.log('Validation failed - missing required fields');
        return res.status(400).json({
          success: false,
          message:
            'Attribute type, name, description, display text, and factor are required',
        });
      }

      if (factor < 0 || factor > 1000) {
        console.log('Validation failed - factor out of range:', factor);
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
      });

      console.log('Creating view attribute:', viewAttribute);
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
            'A view attribute with this name already exists for this type',
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
            'A view attribute with this name already exists for this type',
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
router.post(
  '/municipalities/:municipalityId/view-attributes/defaults',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const viewAttributes = await ViewAttribute.createDefaults(municipalityId);

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
