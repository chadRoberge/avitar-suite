const express = require('express');
const router = express.Router();
const WaterfrontAttribute = require('../models/WaterfrontAttribute');

console.log('🏖️ Waterfront Attributes routes loaded');

// Get all waterfront attributes for a municipality
router.get(
  '/municipalities/:municipalityId/waterfront-attributes',
  async (req, res) => {
    console.log(
      '🔍 GET waterfront attributes request for municipality:',
      req.params.municipalityId,
    );
    try {
      const { municipalityId } = req.params;
      const waterfrontAttributes =
        await WaterfrontAttribute.findByMunicipality(municipalityId);

      res.json({
        success: true,
        waterfrontAttributes,
      });
    } catch (error) {
      console.error('Error fetching waterfront attributes:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching waterfront attributes',
      });
    }
  },
);

// Get a specific waterfront attribute by municipality and type
router.get(
  '/municipalities/:municipalityId/waterfront-attributes/:attributeType',
  async (req, res) => {
    try {
      const { municipalityId, attributeType } = req.params;
      const waterfrontAttribute =
        await WaterfrontAttribute.findByMunicipalityAndType(
          municipalityId,
          attributeType,
        );

      if (!waterfrontAttribute) {
        return res.status(404).json({
          success: false,
          message: 'Waterfront attribute not found',
        });
      }

      res.json({
        success: true,
        waterfrontAttribute,
      });
    } catch (error) {
      console.error('Error fetching waterfront attribute:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching waterfront attribute',
      });
    }
  },
);

// Create a new waterfront attribute
router.post(
  '/municipalities/:municipalityId/waterfront-attributes',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { attributeType, name, description, displayText, factor } =
        req.body;

      console.log('Received waterfront attribute creation request:');
      console.log('Municipality ID:', municipalityId);
      console.log('Request body:', req.body);

      // Validation
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

      const waterfrontAttribute = new WaterfrontAttribute({
        municipalityId,
        attributeType,
        name,
        description,
        displayText,
        factor,
      });

      console.log('Creating waterfront attribute:', waterfrontAttribute);
      await waterfrontAttribute.save();

      res.status(201).json({
        success: true,
        waterfrontAttribute,
      });
    } catch (error) {
      console.error('Error creating waterfront attribute:', error);

      if (error.code === 11000) {
        console.log('Duplicate key error:', error);
        const isDuplicateName = error.keyValue?.name;
        const isDuplicateDisplayText = error.keyValue?.displayText;

        let message = 'Duplicate attribute detected';
        if (isDuplicateName) {
          message = `An attribute with the name "${error.keyValue.name}" already exists in this municipality`;
        } else if (isDuplicateDisplayText) {
          message = `An attribute with the display text "${error.keyValue.displayText}" already exists in this municipality`;
        }

        return res.status(400).json({
          success: false,
          message,
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error creating waterfront attribute',
      });
    }
  },
);

// Update an existing waterfront attribute
router.put(
  '/municipalities/:municipalityId/waterfront-attributes/:attributeId',
  async (req, res) => {
    try {
      const { municipalityId, attributeId } = req.params;
      const { name, description, displayText, factor } = req.body;

      const waterfrontAttribute = await WaterfrontAttribute.findOne({
        _id: attributeId,
        municipalityId,
        isActive: true,
      });

      if (!waterfrontAttribute) {
        return res.status(404).json({
          success: false,
          message: 'Waterfront attribute not found',
        });
      }

      // Update fields if provided
      if (name) waterfrontAttribute.name = name;
      if (description) waterfrontAttribute.description = description;
      if (displayText) waterfrontAttribute.displayText = displayText;
      if (factor !== undefined) {
        if (factor < 0 || factor > 1000) {
          return res.status(400).json({
            success: false,
            message: 'Factor must be between 0 and 1000',
          });
        }
        waterfrontAttribute.factor = factor;
      }

      await waterfrontAttribute.save();

      res.json({
        success: true,
        waterfrontAttribute,
      });
    } catch (error) {
      console.error('Error updating waterfront attribute:', error);

      if (error.code === 11000) {
        const isDuplicateName = error.keyValue?.name;
        const isDuplicateDisplayText = error.keyValue?.displayText;

        let message = 'Duplicate attribute detected';
        if (isDuplicateName) {
          message = `An attribute with the name "${error.keyValue.name}" already exists in this municipality`;
        } else if (isDuplicateDisplayText) {
          message = `An attribute with the display text "${error.keyValue.displayText}" already exists in this municipality`;
        }

        return res.status(400).json({
          success: false,
          message,
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error updating waterfront attribute',
      });
    }
  },
);

// Create default waterfront attributes for a municipality
router.post(
  '/municipalities/:municipalityId/waterfront-attributes/defaults',
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const waterfrontAttributes =
        await WaterfrontAttribute.createDefaults(municipalityId);

      res.json({
        success: true,
        waterfrontAttributes,
      });
    } catch (error) {
      console.error('Error creating default waterfront attributes:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating default waterfront attributes',
      });
    }
  },
);

// Delete a waterfront attribute (soft delete)
router.delete(
  '/municipalities/:municipalityId/waterfront-attributes/:attributeId',
  async (req, res) => {
    try {
      const { municipalityId, attributeId } = req.params;

      const waterfrontAttribute = await WaterfrontAttribute.findOne({
        _id: attributeId,
        municipalityId,
        isActive: true,
      });

      if (!waterfrontAttribute) {
        return res.status(404).json({
          success: false,
          message: 'Waterfront attribute not found',
        });
      }

      waterfrontAttribute.isActive = false;
      await waterfrontAttribute.save();

      res.json({
        success: true,
        message: 'Waterfront attribute deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting waterfront attribute:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting waterfront attribute',
      });
    }
  },
);

module.exports = router;
