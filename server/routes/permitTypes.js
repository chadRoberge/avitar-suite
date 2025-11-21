const express = require('express');
const router = express.Router();
const PermitType = require('../models/PermitType');
const { authenticateToken } = require('../middleware/auth');

/**
 * Middleware to check if user has access to municipality
 */
const checkMunicipalityAccess = async (req, res, next) => {
  const { municipalityId } = req.params;

  // Avitar staff have access to all municipalities
  if (
    req.user.global_role === 'avitar_staff' ||
    req.user.global_role === 'avitar_admin'
  ) {
    return next();
  }

  // Check if user has access to this municipality
  if (!req.user.hasAccessToMunicipality(municipalityId)) {
    return res
      .status(403)
      .json({ error: 'Access denied to this municipality' });
  }

  next();
};

/**
 * Middleware to check module permission for building permits
 */
const checkPermitTypePermission = (action) => {
  return (req, res, next) => {
    const { municipalityId } = req.params;

    // Avitar staff have all permissions
    if (
      req.user.global_role === 'avitar_staff' ||
      req.user.global_role === 'avitar_admin'
    ) {
      return next();
    }

    // Check buildingPermits module permission
    if (!req.user.hasModulePermission(municipalityId, 'buildingPermits', action)) {
      return res
        .status(403)
        .json({ error: `Insufficient permissions to ${action} permit types` });
    }

    next();
  };
};

/**
 * GET /api/municipalities/:municipalityId/permit-types
 * List all permit types for a municipality
 */
router.get(
  '/municipalities/:municipalityId/permit-types',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitTypePermission('read'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { status = 'all' } = req.query;

      const query = { municipalityId };

      // Filter by status
      if (status === 'active') {
        query.isActive = true;
      } else if (status === 'inactive') {
        query.isActive = false;
      }

      const permitTypes = await PermitType.find(query)
        .populate('createdBy', 'first_name last_name')
        .populate('updatedBy', 'first_name last_name')
        .sort({ name: 1 })
        .lean();

      res.json({
        permitTypes,
        total: permitTypes.length,
      });
    } catch (error) {
      console.error('Error fetching permit types:', error);
      res.status(500).json({
        error: 'Failed to fetch permit types',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/municipalities/:municipalityId/permit-types/:permitTypeId
 * Get a single permit type by ID
 */
router.get(
  '/municipalities/:municipalityId/permit-types/:permitTypeId',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitTypePermission('read'),
  async (req, res) => {
    try {
      const { permitTypeId, municipalityId } = req.params;

      const permitType = await PermitType.findOne({
        _id: permitTypeId,
        municipalityId,
      })
        .populate('createdBy', 'first_name last_name email')
        .populate('updatedBy', 'first_name last_name email')
        .populate('templateFiles.uploadedBy', 'first_name last_name');

      if (!permitType) {
        return res.status(404).json({ error: 'Permit type not found' });
      }

      res.json(permitType);
    } catch (error) {
      console.error('Error fetching permit type:', error);
      res.status(500).json({
        error: 'Failed to fetch permit type',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/permit-types
 * Create a new permit type
 */
router.post(
  '/municipalities/:municipalityId/permit-types',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitTypePermission('create'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const permitTypeData = req.body;

      // Create permit type
      const permitType = new PermitType({
        ...permitTypeData,
        municipalityId,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });

      await permitType.save();

      // Populate before returning
      await permitType.populate([
        { path: 'createdBy', select: 'first_name last_name' },
        { path: 'updatedBy', select: 'first_name last_name' },
      ]);

      res.status(201).json(permitType);
    } catch (error) {
      console.error('Error creating permit type:', error);

      // Handle duplicate name error
      if (error.code === 11000) {
        return res.status(409).json({
          error: 'Duplicate permit type',
          message: 'A permit type with this name already exists',
        });
      }

      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          message: error.message,
          details: error.errors,
        });
      }

      res.status(500).json({
        error: 'Failed to create permit type',
        message: error.message,
      });
    }
  },
);

/**
 * PUT /api/municipalities/:municipalityId/permit-types/:permitTypeId
 * Update a permit type
 */
router.put(
  '/municipalities/:municipalityId/permit-types/:permitTypeId',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitTypePermission('update'),
  async (req, res) => {
    try {
      const { permitTypeId, municipalityId } = req.params;
      const updates = req.body;

      // Debug: log what we received
      console.log('Updating permit type:', permitTypeId);
      console.log('Custom form fields received:', updates.customFormFields);

      const permitType = await PermitType.findOne({
        _id: permitTypeId,
        municipalityId,
      });

      if (!permitType) {
        return res.status(404).json({ error: 'Permit type not found' });
      }

      // Apply updates (excluding protected fields)
      Object.keys(updates).forEach((key) => {
        if (
          key !== '_id' &&
          key !== 'municipalityId' &&
          key !== 'createdBy' &&
          key !== 'createdAt'
        ) {
          permitType[key] = updates[key];
        }
      });

      permitType.updatedBy = req.user._id;
      await permitType.save();

      await permitType.populate([
        { path: 'createdBy', select: 'first_name last_name' },
        { path: 'updatedBy', select: 'first_name last_name' },
      ]);

      res.json(permitType);
    } catch (error) {
      console.error('Error updating permit type:', error);

      // Handle duplicate name error
      if (error.code === 11000) {
        return res.status(409).json({
          error: 'Duplicate permit type',
          message: 'A permit type with this name already exists',
        });
      }

      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          message: error.message,
          details: error.errors,
        });
      }

      res.status(500).json({
        error: 'Failed to update permit type',
        message: error.message,
      });
    }
  },
);

/**
 * DELETE /api/municipalities/:municipalityId/permit-types/:permitTypeId
 * Soft delete a permit type (set isActive to false)
 */
router.delete(
  '/municipalities/:municipalityId/permit-types/:permitTypeId',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitTypePermission('delete'),
  async (req, res) => {
    try {
      const { permitTypeId, municipalityId } = req.params;

      const permitType = await PermitType.findOne({
        _id: permitTypeId,
        municipalityId,
      });

      if (!permitType) {
        return res.status(404).json({ error: 'Permit type not found' });
      }

      // Soft delete
      permitType.isActive = false;
      permitType.updatedBy = req.user._id;
      await permitType.save();

      res.json({
        message: 'Permit type deactivated successfully',
        permitType,
      });
    } catch (error) {
      console.error('Error deleting permit type:', error);
      res.status(500).json({
        error: 'Failed to delete permit type',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/permit-types/:permitTypeId/templates
 * Upload a template file for a permit type
 */
router.post(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/templates',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitTypePermission('update'),
  async (req, res) => {
    try {
      const { permitTypeId, municipalityId } = req.params;
      const { fileName, displayName, description, fileUrl, fileSize, isPublic } =
        req.body;

      if (!fileName || !fileUrl) {
        return res
          .status(400)
          .json({ error: 'fileName and fileUrl are required' });
      }

      const permitType = await PermitType.findOne({
        _id: permitTypeId,
        municipalityId,
      });

      if (!permitType) {
        return res.status(404).json({ error: 'Permit type not found' });
      }

      // Add template file
      permitType.templateFiles.push({
        fileName,
        displayName: displayName || fileName,
        description,
        fileUrl,
        fileSize,
        isPublic: isPublic !== undefined ? isPublic : true,
        uploadedBy: req.user._id,
        uploadedAt: new Date(),
      });

      permitType.updatedBy = req.user._id;
      await permitType.save();

      res.json({
        message: 'Template file added successfully',
        templateFile: permitType.templateFiles[permitType.templateFiles.length - 1],
      });
    } catch (error) {
      console.error('Error uploading template file:', error);
      res.status(500).json({
        error: 'Failed to upload template file',
        message: error.message,
      });
    }
  },
);

/**
 * DELETE /api/municipalities/:municipalityId/permit-types/:permitTypeId/templates/:templateId
 * Delete a template file
 */
router.delete(
  '/municipalities/:municipalityId/permit-types/:permitTypeId/templates/:templateId',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitTypePermission('update'),
  async (req, res) => {
    try {
      const { permitTypeId, municipalityId, templateId } = req.params;

      const permitType = await PermitType.findOne({
        _id: permitTypeId,
        municipalityId,
      });

      if (!permitType) {
        return res.status(404).json({ error: 'Permit type not found' });
      }

      // Remove template file
      permitType.templateFiles = permitType.templateFiles.filter(
        (file) => file._id.toString() !== templateId,
      );

      permitType.updatedBy = req.user._id;
      await permitType.save();

      res.json({ message: 'Template file deleted successfully' });
    } catch (error) {
      console.error('Error deleting template file:', error);
      res.status(500).json({
        error: 'Failed to delete template file',
        message: error.message,
      });
    }
  },
);

module.exports = router;
