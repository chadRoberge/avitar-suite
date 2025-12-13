const express = require('express');
const router = express.Router();
const ProjectType = require('../models/ProjectType');
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
 * Middleware to check module permission for building permits (project types are part of building permits)
 */
const checkProjectTypePermission = (action) => {
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
    if (
      !req.user.hasModulePermission(municipalityId, 'building_permit', action)
    ) {
      return res
        .status(403)
        .json({ error: `Insufficient permissions to ${action} project types` });
    }

    next();
  };
};

/**
 * GET /api/municipalities/:municipalityId/project-types
 * List all project types for a municipality
 * NOTE: Public endpoint for contractors/citizens to view available project types
 */
router.get(
  '/municipalities/:municipalityId/project-types',
  authenticateToken,
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

      const projectTypes = await ProjectType.find(query)
        .populate('createdBy', 'first_name last_name')
        .populate('updatedBy', 'first_name last_name')
        .populate('defaultPermitTypes.permitTypeId', 'name description icon')
        .sort({ name: 1 })
        .lean();

      res.json({
        projectTypes,
        total: projectTypes.length,
      });
    } catch (error) {
      console.error('Error fetching project types:', error);
      res.status(500).json({
        error: 'Failed to fetch project types',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/municipalities/:municipalityId/project-types/:projectTypeId
 * Get a single project type by ID
 * NOTE: Public endpoint for contractors/citizens to view project type details
 */
router.get(
  '/municipalities/:municipalityId/project-types/:projectTypeId',
  authenticateToken,
  async (req, res) => {
    try {
      const { projectTypeId, municipalityId } = req.params;

      const projectType = await ProjectType.findOne({
        _id: projectTypeId,
        municipalityId,
      })
        .populate('createdBy', 'first_name last_name email')
        .populate('updatedBy', 'first_name last_name email')
        .populate(
          'defaultPermitTypes.permitTypeId',
          'name description icon categories feeSchedule',
        )
        .populate('templateFiles.uploadedBy', 'first_name last_name');

      if (!projectType) {
        return res.status(404).json({ error: 'Project type not found' });
      }

      res.json(projectType);
    } catch (error) {
      console.error('Error fetching project type:', error);
      res.status(500).json({
        error: 'Failed to fetch project type',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/project-types
 * Create a new project type
 */
router.post(
  '/municipalities/:municipalityId/project-types',
  authenticateToken,
  checkMunicipalityAccess,
  checkProjectTypePermission('create'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const projectTypeData = req.body;

      // Create project type
      const projectType = new ProjectType({
        ...projectTypeData,
        municipalityId,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });

      await projectType.save();

      // Populate before returning
      await projectType.populate([
        { path: 'createdBy', select: 'first_name last_name' },
        { path: 'updatedBy', select: 'first_name last_name' },
        {
          path: 'defaultPermitTypes.permitTypeId',
          select: 'name description icon',
        },
      ]);

      res.status(201).json(projectType);
    } catch (error) {
      console.error('Error creating project type:', error);

      // Handle duplicate name error
      if (error.code === 11000) {
        return res.status(409).json({
          error: 'Duplicate project type',
          message: 'A project type with this name already exists',
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
        error: 'Failed to create project type',
        message: error.message,
      });
    }
  },
);

/**
 * PUT /api/municipalities/:municipalityId/project-types/:projectTypeId
 * Update a project type
 */
router.put(
  '/municipalities/:municipalityId/project-types/:projectTypeId',
  authenticateToken,
  checkMunicipalityAccess,
  checkProjectTypePermission('update'),
  async (req, res) => {
    try {
      const { projectTypeId, municipalityId } = req.params;
      const updates = req.body;

      console.log('Updating project type:', projectTypeId);

      const projectType = await ProjectType.findOne({
        _id: projectTypeId,
        municipalityId,
      });

      if (!projectType) {
        return res.status(404).json({ error: 'Project type not found' });
      }

      // Apply updates (excluding protected fields)
      Object.keys(updates).forEach((key) => {
        if (
          key !== '_id' &&
          key !== 'municipalityId' &&
          key !== 'createdBy' &&
          key !== 'createdAt'
        ) {
          projectType[key] = updates[key];
        }
      });

      projectType.updatedBy = req.user._id;
      await projectType.save();

      await projectType.populate([
        { path: 'createdBy', select: 'first_name last_name' },
        { path: 'updatedBy', select: 'first_name last_name' },
        {
          path: 'defaultPermitTypes.permitTypeId',
          select: 'name description icon',
        },
      ]);

      res.json(projectType);
    } catch (error) {
      console.error('Error updating project type:', error);

      // Handle duplicate name error
      if (error.code === 11000) {
        return res.status(409).json({
          error: 'Duplicate project type',
          message: 'A project type with this name already exists',
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
        error: 'Failed to update project type',
        message: error.message,
      });
    }
  },
);

/**
 * DELETE /api/municipalities/:municipalityId/project-types/:projectTypeId
 * Soft delete a project type (set isActive to false)
 */
router.delete(
  '/municipalities/:municipalityId/project-types/:projectTypeId',
  authenticateToken,
  checkMunicipalityAccess,
  checkProjectTypePermission('delete'),
  async (req, res) => {
    try {
      const { projectTypeId, municipalityId } = req.params;

      const projectType = await ProjectType.findOne({
        _id: projectTypeId,
        municipalityId,
      });

      if (!projectType) {
        return res.status(404).json({ error: 'Project type not found' });
      }

      // Soft delete
      projectType.isActive = false;
      projectType.updatedBy = req.user._id;
      await projectType.save();

      res.json({
        message: 'Project type deactivated successfully',
        projectType,
      });
    } catch (error) {
      console.error('Error deleting project type:', error);
      res.status(500).json({
        error: 'Failed to delete project type',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/project-types/:projectTypeId/templates
 * Upload a template file for a project type
 */
router.post(
  '/municipalities/:municipalityId/project-types/:projectTypeId/templates',
  authenticateToken,
  checkMunicipalityAccess,
  checkProjectTypePermission('update'),
  async (req, res) => {
    try {
      const { projectTypeId, municipalityId } = req.params;
      const {
        fileName,
        displayName,
        description,
        fileUrl,
        fileSize,
        isPublic,
      } = req.body;

      if (!fileName || !fileUrl) {
        return res
          .status(400)
          .json({ error: 'fileName and fileUrl are required' });
      }

      const projectType = await ProjectType.findOne({
        _id: projectTypeId,
        municipalityId,
      });

      if (!projectType) {
        return res.status(404).json({ error: 'Project type not found' });
      }

      // Add template file
      projectType.templateFiles.push({
        fileName,
        displayName: displayName || fileName,
        description,
        fileUrl,
        fileSize,
        isPublic: isPublic !== undefined ? isPublic : true,
        uploadedBy: req.user._id,
        uploadedAt: new Date(),
      });

      projectType.updatedBy = req.user._id;
      await projectType.save();

      res.json({
        message: 'Template file added successfully',
        templateFile:
          projectType.templateFiles[projectType.templateFiles.length - 1],
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
 * DELETE /api/municipalities/:municipalityId/project-types/:projectTypeId/templates/:templateId
 * Delete a template file
 */
router.delete(
  '/municipalities/:municipalityId/project-types/:projectTypeId/templates/:templateId',
  authenticateToken,
  checkMunicipalityAccess,
  checkProjectTypePermission('update'),
  async (req, res) => {
    try {
      const { projectTypeId, municipalityId, templateId } = req.params;

      const projectType = await ProjectType.findOne({
        _id: projectTypeId,
        municipalityId,
      });

      if (!projectType) {
        return res.status(404).json({ error: 'Project type not found' });
      }

      // Remove template file
      projectType.templateFiles = projectType.templateFiles.filter(
        (file) => file._id.toString() !== templateId,
      );

      projectType.updatedBy = req.user._id;
      await projectType.save();

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
