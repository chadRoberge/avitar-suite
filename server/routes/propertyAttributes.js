const express = require('express');
const router = express.Router();
const {
  PropertyAttribute,
  SiteAttribute,
  DrivewayAttribute,
  RoadAttribute,
  TopologyAttribute,
} = require('../models/PropertyAttribute');
const { body, param, validationResult } = require('express-validator');

// Map attribute types to their models
const attributeModels = {
  site: SiteAttribute,
  driveway: DrivewayAttribute,
  road: RoadAttribute,
  topology: TopologyAttribute,
};

// Map attribute types to response keys
const responseKeys = {
  site: 'siteAttribute',
  driveway: 'drivewayAttribute',
  road: 'roadAttribute',
  topology: 'topologyAttribute',
};

// Validation middleware for attribute data
const validateAttributeData = [
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('displayText')
    .trim()
    .notEmpty()
    .withMessage('Display text is required')
    .isLength({ max: 10 })
    .withMessage('Display text cannot exceed 10 characters'),
  body('rate').isNumeric().withMessage('Rate must be a number'),
];

// Helper function to get model and validate type
function getAttributeModel(attributeType) {
  const model = attributeModels[attributeType];
  if (!model) {
    throw new Error(`Invalid attribute type: ${attributeType}`);
  }
  return model;
}

// GET /api/municipalities/:municipalityId/:attributeType-attributes
router.get(
  '/municipalities/:municipalityId/:attributeType-attributes',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('attributeType')
      .isIn(['site', 'driveway', 'road', 'topology'])
      .withMessage('Invalid attribute type'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, attributeType } = req.params;
      const Model = getAttributeModel(attributeType);

      const attributes = await Model.find({
        municipalityId,
        isActive: true,
      }).sort({ displayText: 1 });

      const responseKey = `${attributeType}Attributes`;
      res.json({ [responseKey]: attributes });
    } catch (error) {
      console.error(
        `Error fetching ${req.params.attributeType} attributes:`,
        error,
      );
      res.status(500).json({
        error: `Failed to fetch ${req.params.attributeType} attributes`,
      });
    }
  },
);

// POST /api/municipalities/:municipalityId/:attributeType-attributes
router.post(
  '/municipalities/:municipalityId/:attributeType-attributes',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('attributeType')
      .isIn(['site', 'driveway', 'road', 'topology'])
      .withMessage('Invalid attribute type'),
    ...validateAttributeData,
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, attributeType } = req.params;
      const { description, displayText, rate } = req.body;
      const Model = getAttributeModel(attributeType);

      // Check if displayText already exists for this municipality and type
      const existingAttribute = await Model.findOne({
        municipalityId,
        displayText: displayText.trim(),
        isActive: true,
      });

      if (existingAttribute) {
        return res.status(400).json({
          error: `A ${attributeType} attribute with this display text already exists`,
        });
      }

      const attribute = new Model({
        description: description.trim(),
        displayText: displayText.trim(),
        rate: parseFloat(rate),
        municipalityId,
      });

      await attribute.save();

      const responseKey = responseKeys[attributeType];
      res.status(201).json({ [responseKey]: attribute });
    } catch (error) {
      console.error(
        `Error creating ${req.params.attributeType} attribute:`,
        error,
      );
      res.status(500).json({
        error: `Failed to create ${req.params.attributeType} attribute`,
      });
    }
  },
);

// PUT /api/municipalities/:municipalityId/:attributeType-attributes/:attributeId
router.put(
  '/municipalities/:municipalityId/:attributeType-attributes/:attributeId',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('attributeType')
      .isIn(['site', 'driveway', 'road', 'topology'])
      .withMessage('Invalid attribute type'),
    param('attributeId').isMongoId().withMessage('Invalid attribute ID'),
    ...validateAttributeData,
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, attributeType, attributeId } = req.params;
      const { description, displayText, rate } = req.body;
      const Model = getAttributeModel(attributeType);

      // Check if another attribute with the same display text exists (excluding current one)
      const existingAttribute = await Model.findOne({
        _id: { $ne: attributeId },
        municipalityId,
        displayText: displayText.trim(),
        isActive: true,
      });

      if (existingAttribute) {
        return res.status(400).json({
          error: `A ${attributeType} attribute with this display text already exists`,
        });
      }

      const attribute = await Model.findOneAndUpdate(
        { _id: attributeId, municipalityId, isActive: true },
        {
          description: description.trim(),
          displayText: displayText.trim(),
          rate: parseFloat(rate),
        },
        { new: true, runValidators: true },
      );

      if (!attribute) {
        return res
          .status(404)
          .json({ error: `${attributeType} attribute not found` });
      }

      const responseKey = responseKeys[attributeType];
      res.json({ [responseKey]: attribute });
    } catch (error) {
      console.error(
        `Error updating ${req.params.attributeType} attribute:`,
        error,
      );
      res.status(500).json({
        error: `Failed to update ${req.params.attributeType} attribute`,
      });
    }
  },
);

// DELETE /api/municipalities/:municipalityId/:attributeType-attributes/:attributeId
router.delete(
  '/municipalities/:municipalityId/:attributeType-attributes/:attributeId',
  [
    param('municipalityId').isMongoId().withMessage('Invalid municipality ID'),
    param('attributeType')
      .isIn(['site', 'driveway', 'road', 'topology'])
      .withMessage('Invalid attribute type'),
    param('attributeId').isMongoId().withMessage('Invalid attribute ID'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { municipalityId, attributeType, attributeId } = req.params;
      const Model = getAttributeModel(attributeType);

      // Soft delete by setting isActive to false
      const attribute = await Model.findOneAndUpdate(
        { _id: attributeId, municipalityId, isActive: true },
        { isActive: false },
        { new: true },
      );

      if (!attribute) {
        return res
          .status(404)
          .json({ error: `${attributeType} attribute not found` });
      }

      res.json({ message: `${attributeType} attribute deleted successfully` });
    } catch (error) {
      console.error(
        `Error deleting ${req.params.attributeType} attribute:`,
        error,
      );
      res.status(500).json({
        error: `Failed to delete ${req.params.attributeType} attribute`,
      });
    }
  },
);

module.exports = router;
