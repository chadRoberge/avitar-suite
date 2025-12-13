const express = require('express');
const router = express.Router();
const multer = require('multer');
const Permit = require('../models/Permit');
const PermitInspection = require('../models/PermitInspection');
const PermitDocument = require('../models/PermitDocument');
const File = require('../models/File');
const PropertyTreeNode = require('../models/PropertyTreeNode');
const BuildingAssessment = require('../models/BuildingAssessment');
const Contractor = require('../models/Contractor');
const Municipality = require('../models/Municipality');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const stripeService = require('../services/stripeService');
const storageService = require('../services/storageService');
const notificationService = require('../services/notificationService');

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
});

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
 * Middleware to check module permission for permits
 * Allows contractors and citizens to create/read their own permits unless blacklisted
 */
const checkPermitPermission = (action) => {
  return async (req, res, next) => {
    const { municipalityId } = req.params;

    // Avitar staff have all permissions
    if (
      req.user.global_role === 'avitar_staff' ||
      req.user.global_role === 'avitar_admin'
    ) {
      return next();
    }

    // Contractors and citizens can create and read permits (unless blacklisted)
    if (
      req.user.global_role === 'contractor' ||
      req.user.global_role === 'citizen'
    ) {
      // Check if contractor is blacklisted
      if (req.user.contractor_id) {
        const contractor = await Contractor.findById(req.user.contractor_id);
        if (contractor?.is_blacklisted) {
          return res.status(403).json({
            error:
              'Your account has been suspended. Please contact support for more information.',
          });
        }
      }

      // Allow create and read actions for their own permits
      if (action === 'create' || action === 'read') {
        return next();
      }

      // Other actions (update, delete) require ownership check or staff permission
      return res.status(403).json({
        error: `Insufficient permissions to ${action} permits`,
      });
    }

    // For municipal staff, check permits module permission
    if (
      !req.user.hasModulePermission(municipalityId, 'building_permit', action)
    ) {
      return res
        .status(403)
        .json({ error: `Insufficient permissions to ${action} permits` });
    }

    next();
  };
};

/**
 * Middleware to check if user can comment on a permit
 * Allows:
 * - Municipal staff with update permission
 * - Contractors/citizens who own the permit (via contractor_id or submitted_by)
 * - Restricts contractors based on comment visibility (only public comments for contractors)
 */
const checkCommentPermission = async (req, res, next) => {
  const { municipalityId, permitId } = req.params;
  const { visibility } = req.body;

  console.log('🔍 Comment Permission Check:', {
    user_role: req.user.global_role,
    user_id: req.user._id,
    contractor_id: req.user.contractor_id,
    municipalityId,
    permitId,
    visibility,
  });

  // Avitar staff can always comment
  if (
    req.user.global_role === 'avitar_staff' ||
    req.user.global_role === 'avitar_admin'
  ) {
    console.log('✅ Comment allowed: Avitar staff');
    return next();
  }

  // For municipal staff, check permits module permission
  if (req.user.global_role === 'municipal_user') {
    if (
      req.user.hasModulePermission(municipalityId, 'building_permit', 'update')
    ) {
      console.log('✅ Comment allowed: Municipal staff with permission');
      return next();
    }
    console.log('❌ Comment denied: Municipal staff without permission');
    return res.status(403).json({
      error: 'Insufficient permissions to comment on permits',
    });
  }

  // For contractors and citizens, check if they own the permit
  if (
    req.user.global_role === 'contractor' ||
    req.user.global_role === 'citizen'
  ) {
    // Check if contractor is blacklisted
    if (req.user.contractor_id) {
      const contractor = await Contractor.findById(req.user.contractor_id);
      if (contractor?.is_blacklisted) {
        console.log('❌ Comment denied: Contractor is blacklisted');
        return res.status(403).json({
          error:
            'Your account has been suspended. Please contact support for more information.',
        });
      }
    }

    // Fetch the permit to check ownership
    const permit = await Permit.findById(permitId);
    if (!permit) {
      console.log('❌ Comment denied: Permit not found');
      return res.status(404).json({ error: 'Permit not found' });
    }

    console.log('🔍 Permit ownership check:', {
      permit_submitted_by: permit.submitted_by?.toString(),
      permit_contractor_id: permit.contractor_id?.toString(),
      user_id: req.user._id.toString(),
      user_contractor_id: req.user.contractor_id?.toString(),
    });

    // Check if user owns this permit
    const isOwner =
      permit.submitted_by?.toString() === req.user._id.toString() ||
      (req.user.contractor_id &&
        permit.contractor_id?.toString() === req.user.contractor_id.toString());

    if (!isOwner) {
      console.log('❌ Comment denied: User does not own permit');
      return res.status(403).json({
        error: 'You can only comment on your own permits',
      });
    }

    // Contractors can only create public comments
    if (visibility === 'internal' || visibility === 'private') {
      console.log(
        '❌ Comment denied: Contractor trying to create internal/private comment',
      );
      return res.status(403).json({
        error: 'Contractors can only create public comments',
      });
    }

    console.log('✅ Comment allowed: Contractor/citizen owns permit');
    return next();
  }

  // Default deny
  console.log('❌ Comment denied: No matching role');
  return res.status(403).json({
    error: 'Insufficient permissions to comment on permits',
  });
};

/**
 * GET /api/permits/my-permits
 * Get all permits accessible by the current user (contractor or citizen)
 * This endpoint is NOT municipality-scoped - shows permits across all municipalities
 * NOTE: Must come BEFORE /api/permits/:permitId to avoid route collision
 */
router.get('/permits/my-permits', authenticateToken, async (req, res) => {
  try {
    const { status, municipalityId } = req.query;

    // Only contractors and citizens can use this endpoint
    // Municipal staff should use the municipality-scoped queue endpoint
    if (
      req.user.global_role !== 'contractor' &&
      req.user.global_role !== 'citizen'
    ) {
      return res.status(403).json({
        error:
          'This endpoint is for contractors and citizens only. Municipal staff should use the queue endpoint.',
      });
    }

    const options = {};
    if (status) options.status = status;
    if (municipalityId) options.municipalityId = municipalityId;

    // Use the findAccessibleByUser method which handles both contractors and citizens
    const permits = await Permit.findAccessibleByUser(req.user, options);

    // Calculate stats
    const stats = {
      total: permits.length,
      draft: permits.filter((p) => p.status === 'draft').length,
      submitted: permits.filter((p) => p.status === 'submitted').length,
      under_review: permits.filter((p) => p.status === 'under_review').length,
      approved: permits.filter((p) => p.status === 'approved').length,
      denied: permits.filter((p) => p.status === 'denied').length,
      on_hold: permits.filter((p) => p.status === 'on_hold').length,
      closed: permits.filter((p) => p.status === 'closed').length,
    };

    // Group by municipality for easy display
    const byMunicipality = permits.reduce((acc, permit) => {
      const munId = permit.municipalityId?._id?.toString() || 'unknown';
      if (!acc[munId]) {
        acc[munId] = {
          municipality: {
            id: permit.municipalityId?._id,
            name: permit.municipalityId?.name,
            slug: permit.municipalityId?.slug,
          },
          permits: [],
        };
      }
      acc[munId].permits.push(permit);
      return acc;
    }, {});

    res.json({
      permits,
      stats,
      byMunicipality: Object.values(byMunicipality),
      userInfo: {
        isContractor: req.user.global_role === 'contractor',
        contractor_id: req.user.contractor_id,
      },
    });
  } catch (error) {
    console.error('Error fetching user permits:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * PUT /api/permits/:permitId
 * Update a permit (for contractors/citizens to update their own draft permits)
 * This endpoint is NOT municipality-scoped - works across all municipalities
 */
router.put('/permits/:permitId', authenticateToken, async (req, res) => {
  try {
    const { permitId } = req.params;
    const updates = req.body;

    const permit = await Permit.findById(permitId);

    if (!permit) {
      return res.status(404).json({ error: 'Permit not found' });
    }

    // Check if user owns this permit
    const isOwner =
      permit.submitted_by?.toString() === req.user._id.toString() ||
      permit.createdBy?.toString() === req.user._id.toString() ||
      (req.user.contractor_id &&
        permit.contractor_id?.toString() === req.user.contractor_id.toString());

    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow updating draft permits (contractors can't update submitted permits)
    if (permit.status !== 'draft' && updates.status !== 'submitted') {
      return res.status(400).json({
        error: 'Only draft permits can be updated',
        message:
          'Once submitted, permits can only be updated by municipal staff.',
      });
    }

    // Track if status is changing from draft to submitted
    const statusChanged = updates.status && updates.status !== permit.status;

    // Apply updates
    Object.keys(updates).forEach((key) => {
      if (key !== '_id' && key !== 'municipalityId' && key !== 'permitNumber') {
        permit[key] = updates[key];
      }
    });

    permit.updatedBy = req.user._id;

    // If status changed to submitted, use the updateStatus method
    if (statusChanged && updates.status === 'submitted') {
      permit.updateStatus(
        'submitted',
        req.user._id,
        req.user.fullName || req.user.email,
        'Permit submitted by applicant',
      );
    }

    await permit.save();

    // Handle documentFileIds updates (for managing file attachments)
    if (updates.documentFileIds !== undefined) {
      try {
        const newFileIds = Array.isArray(updates.documentFileIds)
          ? updates.documentFileIds
          : [];

        // Get existing PermitDocument records
        const existingDocs = await PermitDocument.find({
          permitId: permitId,
          isActive: true,
        }).lean();

        const existingFileIds = existingDocs.map((doc) =>
          doc.fileId.toString(),
        );

        // Determine files to add (in new list but not in existing)
        const filesToAdd = newFileIds.filter(
          (fileId) => !existingFileIds.includes(fileId.toString()),
        );

        // Determine files to remove (in existing but not in new list)
        const filesToRemove = existingFileIds.filter(
          (fileId) => !newFileIds.includes(fileId),
        );

        // Create PermitDocument records for new files
        for (const fileId of filesToAdd) {
          // Fetch the file to get its metadata
          const file = await File.findById(fileId);
          if (!file) {
            console.warn(`File ${fileId} not found, skipping`);
            continue;
          }

          const permitDocument = new PermitDocument({
            permitId: permitId,
            fileId: fileId,
            municipalityId: permit.municipalityId,
            type: 'other', // Default type for manually added files
            filename: file.fileName,
            originalFilename: file.originalName,
            url: file.gcsUrl || file.localPath,
            size: file.fileSize,
            mimeType: file.fileType,
            uploadedBy: req.user._id,
            uploadedByName: req.user.fullName || req.user.email,
            title: file.displayName || file.fileName,
            description: file.description,
            isActive: true,
          });
          await permitDocument.save();
          console.log(
            `Created PermitDocument linking permit ${permitId} to file ${fileId}`,
          );
        }

        // Mark removed files as inactive
        for (const fileId of filesToRemove) {
          await PermitDocument.updateMany(
            { permitId: permitId, fileId: fileId, isActive: true },
            { isActive: false, updatedAt: new Date() },
          );
          console.log(
            `Marked PermitDocument as inactive for permit ${permitId} file ${fileId}`,
          );
        }

        console.log(
          `Updated permit ${permitId} documents: ${filesToAdd.length} added, ${filesToRemove.length} removed`,
        );
      } catch (docError) {
        console.error('Failed to update PermitDocument records:', docError);
        // Don't fail the entire update - permit is already saved
        // Just log the error and continue
      }
    }

    // If status just changed to submitted, notify all department reviewers
    if (statusChanged && updates.status === 'submitted') {
      try {
        const notificationService = require('../services/notificationService');

        // Populate permit type to get details
        await permit.populate('permitTypeId');
        await permit.populate('propertyId');

        const permitType = permit.permitTypeId?.name || permit.type;
        const propertyAddress = permit.propertyId?.location?.address || 'N/A';
        const applicantName =
          permit.applicant?.name || req.user.fullName || req.user.email;

        // Notify each department assigned to review this permit
        for (const review of permit.departmentReviews) {
          await notificationService.notifyDepartmentReviewers({
            municipalityId: permit.municipalityId,
            department: review.department,
            notificationType: 'assignment',
            notificationData: {
              permitNumber: permit.permitNumber,
              permitType: permitType,
              department: review.department,
              propertyAddress: propertyAddress,
              applicantName: applicantName,
              permitId: permit._id.toString(),
            },
          });

          console.log(
            `📧 Department assignment notifications sent for ${review.department} on permit ${permit.permitNumber}`,
          );
        }
      } catch (notificationError) {
        console.error(
          'Failed to send department assignment notifications:',
          notificationError,
        );
        // Don't fail the request if notification fails
      }
    }

    // Populate for return
    await permit.populate([
      { path: 'propertyId', select: 'pid_formatted location.address' },
      { path: 'permitTypeId' },
      { path: 'municipalityId', select: 'name slug' },
    ]);

    res.json({ permit });
  } catch (error) {
    console.error('Error updating permit:', error);
    res.status(500).json({
      error: 'Failed to update permit',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/permits/:permitId
 * Delete a permit (for contractors/citizens to delete their own draft permits)
 * This endpoint is NOT municipality-scoped - works across all municipalities
 */
router.delete('/permits/:permitId', authenticateToken, async (req, res) => {
  try {
    const { permitId } = req.params;

    const permit = await Permit.findById(permitId);

    if (!permit) {
      return res.status(404).json({ error: 'Permit not found' });
    }

    // Check if user owns this permit
    const isOwner =
      permit.submitted_by?.toString() === req.user._id.toString() ||
      permit.createdBy?.toString() === req.user._id.toString() ||
      (req.user.contractor_id &&
        permit.contractor_id?.toString() === req.user.contractor_id.toString());

    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow deleting draft permits
    if (permit.status !== 'draft') {
      return res.status(400).json({
        error: 'Only draft permits can be deleted',
        message:
          'Submitted permits cannot be deleted. Please contact the municipality to cancel this permit.',
      });
    }

    // Soft delete
    permit.isActive = false;
    permit.deletedAt = new Date();
    permit.deletedBy = req.user._id;

    await permit.save();

    res.json({ message: 'Draft permit deleted successfully', permit });
  } catch (error) {
    console.error('Error deleting permit:', error);
    res.status(500).json({
      error: 'Failed to delete permit',
      message: error.message,
    });
  }
});

/**
 * GET /api/permits/:permitId
 * Get a single permit by ID (for contractors/citizens to load their own draft permits)
 * This endpoint is NOT municipality-scoped - works across all municipalities
 */
router.get('/permits/:permitId', authenticateToken, async (req, res) => {
  try {
    const { permitId } = req.params;

    const permit = await Permit.findById(permitId)
      .populate('propertyId')
      .populate('permitTypeId')
      .populate('municipalityId', 'name slug')
      .populate('departmentReviews.reviewedBy', 'first_name last_name email')
      .lean();

    if (!permit) {
      return res.status(404).json({ error: 'Permit not found' });
    }

    // Check if user owns this permit
    const isOwner =
      permit.submitted_by?.toString() === req.user._id.toString() ||
      permit.createdBy?.toString() === req.user._id.toString() ||
      (req.user.contractor_id &&
        permit.contractor_id?.toString() === req.user.contractor_id.toString());

    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(permit);
  } catch (error) {
    console.error('Error fetching permit:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * POST /api/permits/:permitId/view
 * Track when a user views a permit (for unread comment tracking)
 */
router.post('/permits/:permitId/view', authenticateToken, async (req, res) => {
  try {
    const { permitId } = req.params;
    const userId = req.user._id;

    const permit = await Permit.findById(permitId);

    if (!permit) {
      return res.status(404).json({ error: 'Permit not found' });
    }

    // Find existing view record for this user
    const existingView = permit.viewedBy.find(
      (view) => view.userId.toString() === userId.toString(),
    );

    if (existingView) {
      // Update existing view timestamp
      existingView.lastViewedAt = new Date();
    } else {
      // Add new view record
      permit.viewedBy.push({
        userId: userId,
        lastViewedAt: new Date(),
      });
    }

    await permit.save();

    res.json({
      success: true,
      lastViewedAt: existingView
        ? existingView.lastViewedAt
        : permit.viewedBy[permit.viewedBy.length - 1].lastViewedAt,
    });
  } catch (error) {
    console.error('Error tracking permit view:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * GET /api/permits/:permitId/files
 * Get files for a permit (via PermitDocument collection)
 * For contractors/citizens viewing their own permits
 */
router.get('/permits/:permitId/files', authenticateToken, async (req, res) => {
  try {
    const { permitId } = req.params;

    // Verify permit exists and check ownership
    const permit = await Permit.findById(permitId);
    if (!permit) {
      return res.status(404).json({ error: 'Permit not found' });
    }

    const isOwner =
      permit.submitted_by?.toString() === req.user._id.toString() ||
      permit.createdBy?.toString() === req.user._id.toString() ||
      (req.user.contractor_id &&
        permit.contractor_id?.toString() === req.user.contractor_id.toString());

    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Query PermitDocument collection
    const permitDocs = await PermitDocument.find({
      permitId: permitId,
      isActive: true,
    })
      .populate({
        path: 'fileId',
        populate: [
          { path: 'uploadedBy', select: 'first_name last_name email' },
          { path: 'propertyId', select: 'pid_formatted location.address' },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    // Extract files from populated permitDocs
    const files = permitDocs.filter((pd) => pd.fileId).map((pd) => pd.fileId);

    res.json({ files, total: files.length });
  } catch (error) {
    console.error('Error fetching permit files:', error);
    res.status(500).json({
      error: 'Failed to fetch files',
      message: error.message,
    });
  }
});

/**
 * POST /api/permits/:permitId/files
 * Upload a file to an existing permit
 * For contractors/citizens adding documents to their permits
 */
router.post(
  '/permits/:permitId/files',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const { permitId } = req.params;

      // Verify permit exists and check ownership
      const permit = await Permit.findById(permitId).populate('municipalityId');
      if (!permit) {
        return res.status(404).json({ error: 'Permit not found' });
      }

      const isOwner =
        permit.submitted_by?.toString() === req.user._id.toString() ||
        permit.createdBy?.toString() === req.user._id.toString() ||
        (req.user.contractor_id &&
          permit.contractor_id?.toString() ===
            req.user.contractor_id.toString());

      if (!isOwner) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const municipality = permit.municipalityId;
      const {
        displayName,
        description,
        category = 'supporting_document',
        visibility = 'public',
      } = req.body;

      // Generate storage path
      const fileExtension = req.file.originalname.split('.').pop();
      const timestamp = Date.now();
      const fileName = `${timestamp}-${req.file.originalname}`;
      const storagePath = `${municipality.state}/${municipality.name}/building_permits/${fileName}`;

      // Upload to storage
      const uploadResult = await storageService.uploadFile(
        req.file.buffer,
        storagePath,
        {
          contentType: req.file.mimetype,
          visibility,
          originalName: req.file.originalname,
          state: municipality.state,
          municipality: municipality.name,
          department: 'building_permit',
        },
      );

      // Create file record
      const file = new File({
        municipalityId: municipality._id,
        municipalityName: municipality.name,
        state: municipality.state,
        propertyId: permit.propertyId,
        department: 'building_permit',
        fileName,
        displayName: displayName || req.file.originalname,
        originalName: req.file.originalname,
        fileType: req.file.mimetype,
        fileExtension,
        fileSize: req.file.size,
        storageType: uploadResult.storageType,
        storagePath: uploadResult.storagePath,
        gcsUrl: uploadResult.gcsUrl,
        localPath: uploadResult.localPath,
        folder: 'permits',
        tags: ['permit', permit.permitNumber],
        visibility,
        description,
        category,
        permitId: permit._id,
        permitNumber: permit.permitNumber,
        uploadedBy: req.user._id,
        uploadedByName: req.user.fullName || req.user.email,
        md5Hash: uploadResult.md5Hash,
        sha256Hash: uploadResult.sha256Hash,
      });

      await file.save();

      // Create PermitDocument record
      // Map category to valid PermitDocument type enum
      const typeMap = {
        application: 'application',
        site_plan: 'site_plan',
        floor_plan: 'floor_plan',
        elevation: 'elevation',
        survey: 'survey',
        structural_calc: 'structural_calc',
        approval_letter: 'approval_letter',
        inspection_report: 'inspection_report',
        certificate_of_occupancy: 'certificate_of_occupancy',
        photo: 'photo',
        correspondence: 'correspondence',
        invoice: 'invoice',
        receipt: 'receipt',
      };

      const permitDocument = new PermitDocument({
        permitId: permit._id,
        fileId: file._id,
        municipalityId: municipality._id,
        type: typeMap[category] || 'other',
        filename: file.fileName,
        originalFilename: file.originalName,
        url: file.gcsUrl || file.localPath,
        size: file.fileSize,
        mimeType: file.fileType,
        uploadedBy: req.user._id,
        uploadedByName: req.user.fullName || req.user.email,
        title: displayName || file.displayName,
        description: description,
        isActive: true,
      });
      await permitDocument.save();

      console.log(
        `📄 File uploaded to permit ${permit.permitNumber}: ${file.fileName}`,
      );

      // Populate before returning
      await file.populate([
        { path: 'uploadedBy', select: 'first_name last_name email' },
      ]);

      res.status(201).json(file);
    } catch (error) {
      console.error('Error uploading file to permit:', error);
      res.status(500).json({
        error: 'Failed to upload file',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/municipalities/:municipalityId/projects
 * Get all projects for a municipality (municipal staff only)
 * NOTE: Must come before general GET /permits route
 */
router.get(
  '/municipalities/:municipalityId/projects',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('read'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { status = 'all', search = '' } = req.query;

      // Build query for projects (permits where isProject = true)
      const query = {
        municipalityId,
        isProject: true,
        isActive: true,
      };

      // Filter by status if not 'all'
      if (status !== 'all') {
        query.status = status;
      }

      // Add search filter if provided
      if (search) {
        query.$or = [
          { permitNumber: { $regex: search, $options: 'i' } },
          { projectName: { $regex: search, $options: 'i' } },
        ];
      }

      // Fetch projects with populated data
      const projects = await Permit.find(query)
        .populate('propertyId', 'pid_formatted location.address')
        .populate('projectTypeId', 'name category icon')
        .populate('assignedInspector', 'first_name last_name')
        .populate('createdBy', 'first_name last_name email')
        .sort({ createdAt: -1 })
        .lean();

      // For each project, get the count of associated permits
      for (const project of projects) {
        const permitCount = await Permit.countDocuments({
          projectId: project._id,
          isProject: false,
          isActive: true,
        });
        project.permitCount = permitCount;
      }

      // Calculate stats
      const stats = {
        total: projects.length,
        active: projects.filter((p) =>
          ['submitted', 'under_review', 'approved', 'in_progress'].includes(
            p.status,
          ),
        ).length,
        completed: projects.filter((p) => p.status === 'completed').length,
        onHold: projects.filter((p) => p.status === 'on_hold').length,
        totalValue: projects.reduce(
          (sum, p) => sum + (p.estimatedValue || 0),
          0,
        ),
      };

      res.json({
        projects,
        stats,
      });
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({
        error: 'Failed to fetch projects',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/municipalities/:municipalityId/permits/queue
 * Get permits queue for municipal staff (permits needing attention)
 * NOTE: Must come before general GET /permits route
 */
router.get(
  '/municipalities/:municipalityId/permits/queue',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('read'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { assignedToMe = 'false' } = req.query;

      const query = {
        municipalityId,
        status: { $in: ['submitted', 'under_review', 'on_hold'] },
        isActive: true,
      };

      // Filter by assigned inspector if requested
      if (assignedToMe === 'true') {
        query.$or = [
          { assignedInspector: req.user._id },
          { assignedReviewer: req.user._id },
        ];
      }

      const permits = await Permit.find(query)
        .populate('propertyId', 'pid_formatted location.address')
        .populate('assignedInspector', 'first_name last_name')
        .populate('assignedReviewer', 'first_name last_name')
        .sort({ priorityLevel: -1, applicationDate: 1 })
        .lean();

      // Get additional queues
      const needingAttention =
        await Permit.findNeedingAttention(municipalityId);
      const expiringSoon = await Permit.findExpiringSoon(municipalityId);

      res.json({
        queue: permits,
        needingAttention,
        expiringSoon,
        stats: {
          submitted: permits.filter((p) => p.status === 'submitted').length,
          underReview: permits.filter((p) => p.status === 'under_review')
            .length,
          onHold: permits.filter((p) => p.status === 'on_hold').length,
          total: permits.length,
        },
      });
    } catch (error) {
      console.error('Error fetching permits queue:', error);
      res.status(500).json({
        error: 'Failed to fetch permits queue',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/municipalities/:municipalityId/permits/stats
 * Get permit statistics for dashboard
 * NOTE: Must come before general GET /permits route
 */
router.get(
  '/municipalities/:municipalityId/permits/stats',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('read'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        startDate = new Date(
          new Date().setFullYear(new Date().getFullYear() - 1),
        ),
        endDate = new Date(),
      } = req.query;

      const stats = await Permit.aggregate([
        {
          $match: {
            municipalityId: new mongoose.Types.ObjectId(municipalityId),
            applicationDate: {
              $gte: new Date(startDate),
              $lte: new Date(endDate),
            },
            isActive: true,
          },
        },
        {
          $facet: {
            byType: [
              {
                $group: {
                  _id: '$type',
                  count: { $sum: 1 },
                  totalValue: { $sum: '$estimatedValue' },
                },
              },
              { $sort: { count: -1 } },
            ],
            byStatus: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                },
              },
            ],
            byMonth: [
              {
                $group: {
                  _id: {
                    year: { $year: '$applicationDate' },
                    month: { $month: '$applicationDate' },
                  },
                  count: { $sum: 1 },
                  totalValue: { $sum: '$estimatedValue' },
                },
              },
              { $sort: { '_id.year': 1, '_id.month': 1 } },
            ],
            avgProcessingTime: [
              {
                $match: {
                  approvalDate: { $exists: true },
                  applicationDate: { $exists: true },
                },
              },
              {
                $project: {
                  processingDays: {
                    $divide: [
                      { $subtract: ['$approvalDate', '$applicationDate'] },
                      1000 * 60 * 60 * 24,
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  avgDays: { $avg: '$processingDays' },
                  minDays: { $min: '$processingDays' },
                  maxDays: { $max: '$processingDays' },
                },
              },
            ],
            totalValue: [
              {
                $group: {
                  _id: null,
                  total: { $sum: '$estimatedValue' },
                  avg: { $avg: '$estimatedValue' },
                },
              },
            ],
          },
        },
      ]);

      res.json(stats[0]);
    } catch (error) {
      console.error('Error fetching permit stats:', error);
      res.status(500).json({
        error: 'Failed to fetch permit statistics',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/municipalities/:municipalityId/permits
 * Get all permits for a municipality with optional filters
 *
 * Two modes:
 * 1. Page-based (for "All Permits" view): uses page, year, permitTypeId params
 * 2. Offset-based (for Queue/Dashboard): uses offset, assignedInspector, type, propertyId params
 *
 * NOTE: Must come before GET /permits/:permitId route
 */
router.get(
  '/municipalities/:municipalityId/permits',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('read'),
  async (req, res) => {
    try {
      // Prevent caching to ensure debug logs show
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      const { municipalityId } = req.params;

      // Check if this is the old-style queue request (has assignedInspector or offset params)
      if (
        req.query.assignedInspector ||
        req.query.offset !== undefined ||
        req.query.type ||
        req.query.propertyId
      ) {
        // OLD STYLE - Queue/Dashboard view with offset pagination
        const {
          status,
          type,
          propertyId,
          assignedInspector,
          search,
          sort = '-applicationDate',
          limit = 100,
          offset = 0,
        } = req.query;

        const query = {
          municipalityId,
          isActive: true,
        };

        if (status) query.status = status;
        if (type) query.type = type;
        if (propertyId) query.propertyId = propertyId;
        if (assignedInspector) query.assignedInspector = assignedInspector;
        if (search) query.$text = { $search: search };

        const permits = await Permit.find(query)
          .populate('propertyId', 'pid_formatted location.address')
          .populate('assignedInspector', 'first_name last_name email')
          .populate('createdBy', 'first_name last_name')
          .sort(sort)
          .limit(parseInt(limit))
          .skip(parseInt(offset))
          .lean();

        const total = await Permit.countDocuments(query);

        return res.json({
          permits,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: total > parseInt(offset) + parseInt(limit),
          },
        });
      }

      // NEW STYLE - All Permits view with page-based pagination and filters
      const {
        year,
        permitTypeId,
        status,
        search,
        page = 1,
        limit = 50,
      } = req.query;

      // Build query
      const query = {
        municipalityId,
        isActive: true,
      };

      // Filter by year (default to active permits if no year specified)
      if (year && year !== 'null' && year !== '') {
        const startDate = new Date(`${year}-01-01`);
        const endDate = new Date(`${year}-12-31T23:59:59`);
        query.applicationDate = {
          $gte: startDate,
          $lte: endDate,
        };
      } else {
        // Default: only show non-completed permits
        query.status = { $nin: ['completed', 'closed', 'cancelled'] };
      }

      // Filter by permit type
      if (permitTypeId && permitTypeId !== 'null' && permitTypeId !== '') {
        query.permitTypeId = permitTypeId;
      }

      // Filter by status (override default if specified)
      if (status && status !== 'null' && status !== '') {
        if (status === 'all') {
          delete query.status;
        } else {
          query.status = status;
        }
      }

      // Search by permit number or address
      if (search && search.trim()) {
        query.$or = [
          { permitNumber: { $regex: search.trim(), $options: 'i' } },
          { propertyAddress: { $regex: search.trim(), $options: 'i' } },
          { applicantName: { $regex: search.trim(), $options: 'i' } },
        ];
      }

      console.log('🔍 All Permits Query:', JSON.stringify(query, null, 2));
      console.log('📍 municipalityId:', municipalityId);
      console.log('📝 Query params received:', {
        year,
        permitTypeId,
        status,
        search,
        page,
        limit,
      });

      // Count total for pagination
      const total = await Permit.countDocuments(query);
      console.log('📊 Total permits found:', total);

      // Get permits with pagination
      const permits = await Permit.find(query)
        .populate('propertyId', 'pid_formatted location.address')
        .populate('permitTypeId', 'name category')
        .populate('assignedInspector', 'first_name last_name')
        .populate('assignedReviewer', 'first_name last_name')
        .populate('submitted_by', 'first_name last_name email')
        .sort({ applicationDate: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      console.log(
        '📋 Permits returned:',
        permits.length,
        'permits',
        permits.map((p) => ({
          id: p._id,
          number: p.permitNumber,
          status: p.status,
        })),
      );

      // Get available years for filter
      console.log('🔍 Fetching available years aggregation...');
      const years = await Permit.aggregate([
        {
          $match: {
            municipalityId: new mongoose.Types.ObjectId(municipalityId),
            isActive: true,
          },
        },
        {
          $group: {
            _id: { $year: '$applicationDate' },
          },
        },
        { $sort: { _id: -1 } },
      ]);
      console.log('📅 Years aggregation result:', years);
      console.log(
        '📅 Years mapped:',
        years.map((y) => y._id),
      );

      // Get permit types for filter
      console.log('🔍 Fetching permit types aggregation...');
      const permitTypes = await Permit.aggregate([
        {
          $match: {
            municipalityId: new mongoose.Types.ObjectId(municipalityId),
            isActive: true,
          },
        },
        {
          $group: {
            _id: '$permitTypeId',
          },
        },
      ]);
      console.log('📝 Permit types aggregation result:', permitTypes);

      // Populate permit type details
      const PermitType = require('../models/PermitType');
      const populatedTypes = await PermitType.find({
        _id: { $in: permitTypes.map((pt) => pt._id) },
      })
        .select('name category')
        .lean();
      console.log('📝 Populated permit types:', populatedTypes);

      res.json({
        permits,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
        filters: {
          availableYears: years.map((y) => y._id),
          permitTypes: populatedTypes,
        },
      });
    } catch (error) {
      console.error('❌ Error fetching all permits:', error);
      res.status(500).json({
        error: 'Failed to fetch permits',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/municipalities/:municipalityId/permits/:permitId
 * Get a single permit by ID
 */
router.get(
  '/municipalities/:municipalityId/permits/:permitId',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('read'),
  async (req, res) => {
    try {
      const { permitId } = req.params;

      const permit = await Permit.findById(permitId)
        .populate('propertyId')
        .populate('buildingAssessmentId')
        .populate('permitTypeId')
        .populate('assignedInspector', 'first_name last_name email phone')
        .populate('assignedReviewer', 'first_name last_name email')
        .populate('approvedBy', 'first_name last_name')
        .populate('deniedBy', 'first_name last_name')
        .populate('createdBy', 'first_name last_name email')
        .populate('updatedBy', 'first_name last_name')
        .populate('internalNotes.author', 'first_name last_name')
        .populate('statusHistory.changedBy', 'first_name last_name');

      if (!permit) {
        return res.status(404).json({ error: 'Permit not found' });
      }

      res.json(permit);
    } catch (error) {
      console.error('Error fetching permit:', error);
      res.status(500).json({
        error: 'Failed to fetch permit',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/projects
 * Create a new project (permit container with child permits)
 */
router.post(
  '/municipalities/:municipalityId/projects',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('create'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        projectTypeId,
        projectName,
        projectDescription,
        propertyId,
        childPermitTypes, // Array of permit type IDs to create as child permits
        ...projectData
      } = req.body;

      // Validate property exists
      const property = await PropertyTreeNode.findOne({
        _id: propertyId,
        municipality_id: municipalityId,
      });

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Fetch project type if provided
      const ProjectType = require('../models/ProjectType');
      let projectType = null;
      if (projectTypeId) {
        projectType = await ProjectType.findById(projectTypeId);
      }

      // Generate project permit number
      const projectPermitNumber = await Permit.generatePermitNumber(
        municipalityId,
        'PROJECT',
      );

      // Create the project permit (container)
      const project = new Permit({
        ...projectData,
        municipalityId,
        propertyId,
        permitNumber: projectPermitNumber,
        isProject: true,
        projectTypeId,
        projectName:
          projectName || `Project - ${property.location?.address || ''}`,
        projectOwnerId: req.user._id,
        status: 'draft',
        createdBy: req.user._id,
        updatedBy: req.user._id,
        // Denormalize property data
        pidRaw: property.pid_raw,
        pidFormatted: property.pid_formatted,
        propertyAddress: property.location?.address || '',
        description: projectDescription || '',
        // Set location from property
        location: property.location?.coordinates
          ? {
              type: 'Point',
              coordinates: property.location.coordinates,
            }
          : undefined,
        // Initialize project stats
        projectStats: {
          totalChildren: 0,
          childrenByStatus: {
            draft: 0,
            submitted: 0,
            under_review: 0,
            approved: 0,
            conditionally_approved: 0,
            denied: 0,
            closed: 0,
          },
          totalProjectValue: 0,
          completedChildren: 0,
          overallProgress: 0,
        },
        childPermits: [],
        fees: [],
      });

      await project.save();

      // Create child permits if permit types are provided
      const createdChildPermits = [];
      let totalProjectFee = 0;

      if (childPermitTypes && Array.isArray(childPermitTypes)) {
        const PermitType = require('../models/PermitType');

        for (const permitTypeId of childPermitTypes) {
          const permitType = await PermitType.findById(permitTypeId);
          if (!permitType) continue;

          // Generate child permit number
          const childPermitNumber = await Permit.generatePermitNumber(
            municipalityId,
            permitType.name,
          );

          // Calculate fees for this child permit
          const fees = [];
          if (permitType.feeSchedule) {
            const baseFeeAmount = permitType.feeSchedule.baseAmount || 0;
            if (baseFeeAmount > 0) {
              fees.push({
                name: `${permitType.name} Fee`,
                amount: baseFeeAmount,
                type: 'base',
                status: 'pending',
              });
              totalProjectFee += baseFeeAmount;
            }
          }

          // Create child permit
          const childPermit = new Permit({
            municipalityId,
            propertyId,
            permitNumber: childPermitNumber,
            projectId: project._id,
            permitTypeId,
            type: permitType.name,
            status: 'draft',
            createdBy: req.user._id,
            updatedBy: req.user._id,
            pidRaw: property.pid_raw,
            pidFormatted: property.pid_formatted,
            propertyAddress: property.location?.address || '',
            description: `${permitType.name} - Part of ${projectName}`,
            fees,
            location: property.location?.coordinates
              ? {
                  type: 'Point',
                  coordinates: property.location.coordinates,
                }
              : undefined,
          });

          await childPermit.save();
          createdChildPermits.push(childPermit);

          // Add to project's childPermits array
          project.childPermits.push(childPermit._id);
        }

        // Update project stats and total fee
        project.projectStats.totalChildren = createdChildPermits.length;
        project.projectStats.childrenByStatus.draft =
          createdChildPermits.length;
        project.projectTotalFee = totalProjectFee;
        await project.save();
      }

      // Populate and return
      await project.populate([
        { path: 'propertyId', select: 'pid_formatted location owner' },
        { path: 'projectTypeId' },
        { path: 'childPermits' },
        { path: 'createdBy', select: 'first_name last_name email' },
      ]);

      res.status(201).json({
        project,
        childPermits: createdChildPermits,
        totalProjectFee,
        message: 'Project created successfully',
      });
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({
        error: 'Failed to create project',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/permits
 * Create a new permit
 */
router.post(
  '/municipalities/:municipalityId/permits',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('create'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const permitData = req.body;

      // Validate property exists
      const property = await PropertyTreeNode.findOne({
        _id: permitData.propertyId,
        municipality_id: municipalityId,
      });

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // If projectId is provided, validate project exists and link permit to it
      if (permitData.projectId) {
        const project = await Permit.findOne({
          _id: permitData.projectId,
          municipalityId,
          isProject: true,
        });

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        // Ensure project is on the same property
        if (
          project.propertyId.toString() !== permitData.propertyId.toString()
        ) {
          return res.status(400).json({
            error: 'Permit must be on the same property as the project',
          });
        }
      }

      // If cardNumber is provided, validate building exists
      if (permitData.cardNumber) {
        const building = await BuildingAssessment.findOne({
          property_id: permitData.propertyId,
          card_number: permitData.cardNumber,
        });

        if (!building) {
          return res.status(404).json({ error: 'Building card not found' });
        }

        permitData.buildingAssessmentId = building._id;
      }

      // Fetch permit type for fee calculation
      const PermitType = require('../models/PermitType');
      let permitType = null;
      if (permitData.permitTypeId) {
        permitType = await PermitType.findById(permitData.permitTypeId);
      }

      // Generate permit number
      const permitNumber = await Permit.generatePermitNumber(
        municipalityId,
        permitData.type,
      );

      // Denormalize property data for performance
      permitData.pidRaw = property.pid_raw;
      permitData.pidFormatted = property.pid_formatted;
      permitData.propertyAddress = property.location?.address || '';

      // Set location from property
      if (property.location?.coordinates) {
        permitData.location = {
          type: 'Point',
          coordinates: property.location.coordinates,
        };
      }

      // Calculate fees from permit type
      const fees = [];
      if (permitType && permitType.feeSchedule) {
        const feeSchedule = permitType.feeSchedule;
        let baseFeeAmount = 0;

        switch (feeSchedule.calculationType) {
          case 'flat':
            baseFeeAmount = feeSchedule.baseAmount || 0;
            break;

          case 'per_sqft':
            const sqft = permitData.squareFootage || 0;
            baseFeeAmount =
              (feeSchedule.baseAmount || 0) +
              sqft * (feeSchedule.perSqftRate || 0);
            break;

          case 'percentage':
            const estimatedValue = permitData.estimatedValue || 0;
            const percentageRate = feeSchedule.perSqftRate || 0; // Reusing this field for percentage
            baseFeeAmount =
              (feeSchedule.baseAmount || 0) +
              estimatedValue * (percentageRate / 100);
            break;

          case 'custom':
            // For custom formulas, use base amount as default
            // TODO: Implement custom formula evaluation if needed
            baseFeeAmount = feeSchedule.baseAmount || 0;
            break;

          default:
            baseFeeAmount = feeSchedule.baseAmount || 0;
        }

        // Add base permit fee
        if (baseFeeAmount > 0) {
          fees.push({
            type: 'base',
            description: `${permitType.name} - Base Fee`,
            amount: Math.round(baseFeeAmount * 100) / 100, // Round to 2 decimals
            paid: false,
          });
        }
      }

      permitData.fees = fees;

      // Initialize department reviews from permit type
      const departmentReviews = [];
      if (permitType && permitType.departmentReviews) {
        for (const dept of permitType.departmentReviews) {
          departmentReviews.push({
            department: dept.departmentName,
            required: dept.isRequired,
            approved: false,
            reviewedBy: null,
            reviewedAt: null,
            comments: [], // Array of PermitComment IDs
            conditions: [],
          });
        }
      }

      permitData.departmentReviews = departmentReviews;

      // Create permit
      const permit = new Permit({
        ...permitData,
        municipalityId,
        permitNumber,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        statusHistory: [
          {
            status: permitData.status || 'draft',
            changedBy: req.user._id,
            changedByName: req.user.fullName,
            timestamp: new Date(),
            notes: 'Permit created',
          },
        ],
      });

      await permit.save();

      // If this permit is part of a project, update the project
      if (permitData.projectId) {
        const project = await Permit.findById(permitData.projectId);
        if (project) {
          // Add permit to project's childPermits array
          if (!project.childPermits.includes(permit._id)) {
            project.childPermits.push(permit._id);
          }

          // Update project stats
          project.projectStats.totalChildren = project.childPermits.length;
          project.projectStats.childrenByStatus[permit.status] =
            (project.projectStats.childrenByStatus[permit.status] || 0) + 1;

          // Add permit value to total project value
          if (permit.estimatedValue) {
            project.projectStats.totalProjectValue +=
              permit.estimatedValue || 0;
          }

          // Add permit fees to project total fee
          const permitTotalFee = permit.fees.reduce(
            (sum, fee) => sum + (fee.amount || 0),
            0,
          );
          project.projectTotalFee =
            (project.projectTotalFee || 0) + permitTotalFee;

          project.projectStats.lastChildUpdate = new Date();
          project.updatedBy = req.user._id;

          await project.save();
        }
      }

      // Attach documents if provided
      if (
        permitData.documentFileIds &&
        Array.isArray(permitData.documentFileIds) &&
        permitData.documentFileIds.length > 0
      ) {
        try {
          // Create PermitDocument records for each file
          const permitDocuments = await Promise.all(
            permitData.documentFileIds.map(async (fileId) => {
              // Verify file exists
              const file = await File.findById(fileId);
              if (!file) {
                console.warn(
                  `File ${fileId} not found, skipping attachment to permit ${permit._id}`,
                );
                return null;
              }

              // Create PermitDocument linking permit to existing file
              const permitDoc = new PermitDocument({
                municipalityId: permit.municipalityId,
                permitId: permit._id,
                fileId: file._id,
                type: 'application', // Default type, could be made configurable
                filename: file.fileName,
                originalFilename: file.originalName || file.fileName,
                url: file.gcsUrl || file.localPath,
                size: file.fileSize,
                mimeType: file.fileType,
                title: file.displayName || file.fileName,
                description: file.description,
                visibility: file.visibility || 'public',
                uploadedBy: req.user._id,
                uploadedByName: req.user.fullName,
                uploadSource: 'web_upload',
              });

              await permitDoc.save();
              return permitDoc;
            }),
          );

          // Filter out null values (files that weren't found)
          const successfulAttachments = permitDocuments.filter(
            (doc) => doc !== null,
          );

          console.log(
            `Attached ${successfulAttachments.length} documents to permit ${permit._id}`,
          );
        } catch (docError) {
          console.error('Error attaching documents to permit:', docError);
          // Don't fail permit creation if document attachment fails
          // The permit is already saved, just log the error
        }
      }

      // Populate before returning
      await permit.populate([
        { path: 'propertyId', select: 'pid_formatted location.address' },
        { path: 'createdBy', select: 'first_name last_name' },
      ]);

      res.status(201).json({ permit });
    } catch (error) {
      console.error('Error creating permit:', error);
      res.status(500).json({
        error: 'Failed to create permit',
        message: error.message,
      });
    }
  },
);

/**
 * PUT /api/municipalities/:municipalityId/permits/:permitId
 * Update a permit
 */
router.put(
  '/municipalities/:municipalityId/permits/:permitId',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('update'),
  async (req, res) => {
    try {
      const { permitId } = req.params;
      const updates = req.body;

      const permit = await Permit.findById(permitId);

      if (!permit) {
        return res.status(404).json({ error: 'Permit not found' });
      }

      // Track if status is changing
      const statusChanged = updates.status && updates.status !== permit.status;

      // Apply updates
      Object.keys(updates).forEach((key) => {
        if (
          key !== '_id' &&
          key !== 'municipalityId' &&
          key !== 'permitNumber'
        ) {
          permit[key] = updates[key];
        }
      });

      permit.updatedBy = req.user._id;

      // If status changed, use the updateStatus method
      if (statusChanged) {
        permit.updateStatus(
          updates.status,
          req.user._id,
          req.user.fullName,
          updates.statusNotes,
        );
      }

      await permit.save();

      await permit.populate([
        { path: 'propertyId', select: 'pid_formatted location.address' },
        { path: 'updatedBy', select: 'first_name last_name' },
        { path: 'assignedInspector', select: 'first_name last_name' },
      ]);

      res.json(permit);
    } catch (error) {
      console.error('Error updating permit:', error);
      res.status(500).json({
        error: 'Failed to update permit',
        message: error.message,
      });
    }
  },
);

/**
 * DELETE /api/municipalities/:municipalityId/permits/:permitId
 * Soft delete a permit
 */
router.delete(
  '/municipalities/:municipalityId/permits/:permitId',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('delete'),
  async (req, res) => {
    try {
      const { permitId } = req.params;

      const permit = await Permit.findById(permitId);

      if (!permit) {
        return res.status(404).json({ error: 'Permit not found' });
      }

      // Soft delete
      permit.isActive = false;
      permit.deletedAt = new Date();
      permit.deletedBy = req.user._id;

      await permit.save();

      res.json({ message: 'Permit deleted successfully', permit });
    } catch (error) {
      console.error('Error deleting permit:', error);
      res.status(500).json({
        error: 'Failed to delete permit',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/permits/:permitId/notes
 * Add an internal note to a permit
 */
router.post(
  '/municipalities/:municipalityId/permits/:permitId/notes',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('update'),
  async (req, res) => {
    try {
      const { permitId } = req.params;
      const { note } = req.body;

      if (!note) {
        return res.status(400).json({ error: 'Note text is required' });
      }

      const permit = await Permit.findById(permitId);

      if (!permit) {
        return res.status(404).json({ error: 'Permit not found' });
      }

      permit.addInternalNote(req.user._id, req.user.fullName, note);
      await permit.save();

      res.json({ message: 'Note added successfully', permit });
    } catch (error) {
      console.error('Error adding note:', error);
      res.status(500).json({
        error: 'Failed to add note',
        message: error.message,
      });
    }
  },
);

// GET /api/municipalities/:municipalityId/permits/:permitId/comments
router.get(
  '/municipalities/:municipalityId/permits/:permitId/comments',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('read'),
  async (req, res) => {
    try {
      const { municipalityId, permitId } = req.params;
      const PermitComment = require('../models/PermitComment');

      // Build query filter
      const query = {
        municipalityId,
        permitId,
      };

      // SECURITY: Filter comments based on user type
      // Contractors and citizens should only see public comments
      // Municipal staff can see all comments (public, private, internal)
      const isMunicipalStaff =
        req.user.user_type === 'municipal' || req.user.user_type === 'avitar';

      if (!isMunicipalStaff) {
        // Contractors/citizens only see public comments
        query.visibility = 'public';
      }

      const comments = await PermitComment.find(query)
        .populate('authorId', 'first_name last_name email')
        .sort({ createdAt: 1 }) // Oldest first for chat display
        .lean();

      // Format comments with author object for frontend
      const formattedComments = comments.map((comment) => ({
        ...comment,
        text: comment.content, // Add 'text' alias for frontend
        author: {
          _id: comment.authorId?._id || comment.authorId,
          name: comment.authorName,
          email: comment.authorId?.email,
        },
      }));

      res.json({ comments: formattedComments });
    } catch (error) {
      console.error('Error fetching permit comments:', error);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  },
);

// POST /api/municipalities/:municipalityId/permits/:permitId/comments
router.post(
  '/municipalities/:municipalityId/permits/:permitId/comments',
  authenticateToken,
  checkMunicipalityAccess,
  checkCommentPermission,
  async (req, res) => {
    try {
      const { municipalityId, permitId } = req.params;
      const {
        content,
        text,
        visibility,
        authorId,
        authorName,
        department,
        attachments,
      } = req.body;
      const PermitComment = require('../models/PermitComment');

      // Support both 'content' and 'text' fields for backwards compatibility
      const commentContent = content || text;

      if (!commentContent || !commentContent.trim()) {
        return res.status(400).json({ error: 'Comment content is required' });
      }

      // Use authenticated user's ID and name
      const finalAuthorId = authorId || req.user._id;
      const finalAuthorName =
        authorName ||
        (req.user.first_name && req.user.last_name
          ? `${req.user.first_name} ${req.user.last_name}`
          : req.user.email);

      // Determine visibility: contractors default to 'public', staff defaults to 'internal'
      let finalVisibility = visibility;
      if (!finalVisibility) {
        finalVisibility =
          req.user.global_role === 'contractor' ||
          req.user.global_role === 'citizen'
            ? 'public'
            : 'internal';
      }

      const comment = new PermitComment({
        municipalityId,
        permitId,
        content: commentContent.trim(),
        visibility: finalVisibility,
        authorId: finalAuthorId,
        authorName: finalAuthorName,
        department: department || null,
        attachments: attachments || [],
      });

      await comment.save();

      // Populate author details
      await comment.populate('authorId', 'first_name last_name email');

      // Send notification to department reviewers if comment is on a department review
      if (department) {
        try {
          const notificationService = require('../services/notificationService');
          const Permit = require('../models/Permit');

          // Get permit to retrieve permit number
          const permit = await Permit.findById(permitId);
          if (permit) {
            // Truncate comment for preview (max 100 chars)
            const commentPreview =
              commentContent.length > 100
                ? commentContent.substring(0, 100) + '...'
                : commentContent;

            await notificationService.notifyDepartmentReviewers({
              municipalityId: municipalityId,
              department: department,
              notificationType: 'comment',
              notificationData: {
                permitNumber: permit.permitNumber,
                department: department,
                commentAuthor: finalAuthorName,
                commentPreview: commentPreview,
                permitId: permitId,
              },
            });

            console.log(
              `📧 Comment notification sent to ${department} reviewers on permit ${permit.permitNumber}`,
            );
          }
        } catch (notificationError) {
          console.error(
            'Failed to send comment notification:',
            notificationError,
          );
          // Don't fail the request if notification fails
        }
      }

      // Return comment with author object for frontend
      const commentResponse = comment.toObject();
      commentResponse.author = {
        _id: comment.authorId._id,
        name: finalAuthorName,
        email: comment.authorId.email,
      };
      commentResponse.text = commentResponse.content; // Add 'text' alias for frontend

      res.status(201).json(commentResponse);
    } catch (error) {
      console.error('Error creating permit comment:', error);
      res
        .status(500)
        .json({ error: 'Failed to create comment', message: error.message });
    }
  },
);

// ============================================================================
// Payment Endpoints
// ============================================================================

/**
 * @route   POST /api/municipalities/:municipalityId/permits/:permitId/calculate-payment
 * @desc    Calculate payment breakdown for permit (permit fee + processing fees)
 * @access  Private (applicant or municipal staff)
 */
router.post(
  '/municipalities/:municipalityId/permits/:permitId/calculate-payment',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, permitId } = req.params;

      // Get permit
      const permit = await Permit.findById(permitId);
      if (!permit) {
        return res.status(404).json({
          success: false,
          message: 'Permit not found',
        });
      }

      // Verify permit belongs to this municipality
      if (permit.municipalityId.toString() !== municipalityId) {
        return res.status(400).json({
          success: false,
          message: 'Permit does not belong to this municipality',
        });
      }

      // Check if user owns this permit or is municipal staff
      const isOwner =
        permit.submitted_by?.toString() === req.user._id.toString() ||
        permit.createdBy?.toString() === req.user._id.toString();
      const isStaff = req.user.hasAccessToMunicipality(municipalityId);

      if (!isOwner && !isStaff) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this permit',
        });
      }

      // Get municipality for name
      const municipality = await Municipality.findById(municipalityId);
      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      // Check if municipality has payment setup complete
      if (!municipality.isPaymentSetupComplete) {
        return res.status(400).json({
          success: false,
          message: 'This municipality has not completed payment setup yet',
        });
      }

      // Calculate payment breakdown using totalFees virtual
      const permitFee = permit.totalFees || 0;
      const paymentBreakdown = stripeService.calculatePermitPayment(permitFee);

      console.log('🔵 Calculated payment for permit:', permitId);
      console.log('🔵 Payment breakdown:', paymentBreakdown);

      res.json({
        success: true,
        permitId: permit._id,
        municipalityName: municipality.name,
        permitNumber: permit.permitNumber,
        breakdown: {
          permitFee: paymentBreakdown.permitFee,
          processingFees: paymentBreakdown.processingFees,
          avitarFee: paymentBreakdown.avitarFee,
          stripeFee: paymentBreakdown.stripeFee,
          totalAmount: paymentBreakdown.totalAmount,
        },
      });
    } catch (error) {
      console.error('❌ Error calculating payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate payment',
        error: error.message,
      });
    }
  },
);

/**
 * @route   POST /api/municipalities/:municipalityId/permits/:permitId/create-payment-intent
 * @desc    Create Stripe payment intent for permit payment
 * @access  Private (applicant only)
 */
router.post(
  '/municipalities/:municipalityId/permits/:permitId/create-payment-intent',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, permitId } = req.params;

      // Get permit
      const permit = await Permit.findById(permitId);
      if (!permit) {
        return res.status(404).json({
          success: false,
          message: 'Permit not found',
        });
      }

      // Verify permit belongs to this municipality
      if (permit.municipalityId.toString() !== municipalityId) {
        return res.status(400).json({
          success: false,
          message: 'Permit does not belong to this municipality',
        });
      }

      // Only applicant can create payment intent
      const isOwner =
        permit.submitted_by?.toString() === req.user._id.toString() ||
        permit.createdBy?.toString() === req.user._id.toString();

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Only the permit applicant can initiate payment',
        });
      }

      // Check if permit is already paid (all fees are paid)
      const unpaidFees = permit.fees.filter((fee) => !fee.paid);
      if (unpaidFees.length === 0 && permit.fees.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'This permit has already been paid',
        });
      }

      // Get municipality
      const municipality = await Municipality.findById(municipalityId);
      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      // Check if municipality has payment setup complete
      if (!municipality.isPaymentSetupComplete) {
        return res.status(400).json({
          success: false,
          message: 'This municipality has not completed payment setup yet',
        });
      }

      // Calculate payment breakdown using totalFees virtual
      const permitFee = permit.totalFees || 0;
      const paymentBreakdown = stripeService.calculatePermitPayment(permitFee);

      console.log('🔵 Creating payment intent for permit:', permitId);
      console.log('🔵 Payment breakdown:');
      console.log(
        '  - Permit fee (to municipality):',
        paymentBreakdown.permitFee,
      );
      console.log('  - Avitar fee (platform):', paymentBreakdown.avitarFee);
      console.log(
        '  - Stripe fee (platform pays):',
        paymentBreakdown.stripeFee,
      );
      console.log(
        '  - Total charged to customer:',
        paymentBreakdown.totalAmount,
      );
      console.log(
        '🔵 Transfer to municipality (cents):',
        paymentBreakdown.permitFeeCents,
      );

      // Create payment intent with Stripe Connect (destination charge pattern)
      // This creates the payment intent on the platform account and transfers to connected account
      // Payment flow:
      // 1. Customer is charged: totalAmountCents (permitFee + avitarFee + stripeFee)
      // 2. Municipality receives: permitFeeCents (exact permit cost) via transfer_data[amount]
      // 3. Platform keeps: processingFeesCents (avitarFee + stripeFee) - automatic remainder
      const paymentIntent = await stripeService.stripe.paymentIntents.create({
        amount: paymentBreakdown.totalAmountCents,
        currency: 'usd',
        payment_method_types: ['card'],
        transfer_data: {
          destination: municipality.stripe_account_id, // Destination connected account
          amount: paymentBreakdown.permitFeeCents, // Transfer exactly the permit cost to municipality
        },
        metadata: {
          permitId: permit._id.toString(),
          permitNumber: permit.permitNumber,
          municipalityId: municipality._id.toString(),
          municipalityName: municipality.name,
          applicantId: req.user._id.toString(),
          applicantEmail: req.user.email,
          payment_type: 'building_permit',
          permitFee: paymentBreakdown.permitFeeCents.toString(),
          avitarFee: paymentBreakdown.avitarFeeCents.toString(),
          stripeFee: paymentBreakdown.stripeFeeCents.toString(),
          processingFees: paymentBreakdown.processingFeesCents.toString(),
        },
        description: `Permit ${permit.permitNumber} - ${municipality.name}`,
      });

      // Store payment intent ID in internal notes for tracking
      permit.addInternalNote(
        req.user._id,
        req.user.fullName || req.user.email,
        `Payment intent created: ${paymentIntent.id}`,
      );
      await permit.save();

      console.log('🟢 Payment intent created:', paymentIntent.id);

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        stripeAccountId: municipality.stripe_account_id,
        amount: paymentBreakdown.totalAmount,
      });
    } catch (error) {
      console.error('❌ Error creating payment intent:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create payment intent',
        error: error.message,
      });
    }
  },
);

/**
 * @route   POST /api/municipalities/:municipalityId/permits/:permitId/confirm-payment
 * @desc    Confirm payment and submit permit for approval
 * @access  Private (applicant only)
 */
router.post(
  '/municipalities/:municipalityId/permits/:permitId/confirm-payment',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, permitId } = req.params;
      const { paymentIntentId } = req.body;

      if (!paymentIntentId) {
        return res.status(400).json({
          success: false,
          message: 'Payment intent ID is required',
        });
      }

      // Get permit
      const permit = await Permit.findById(permitId);
      if (!permit) {
        return res.status(404).json({
          success: false,
          message: 'Permit not found',
        });
      }

      // Only applicant can confirm payment
      const isOwner =
        permit.submitted_by?.toString() === req.user._id.toString() ||
        permit.createdBy?.toString() === req.user._id.toString();

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Only the permit applicant can confirm payment',
        });
      }

      // Get municipality
      const municipality = await Municipality.findById(municipalityId);
      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      // Verify payment intent with Stripe (from platform account for destination charges)
      const paymentIntent =
        await stripeService.stripe.paymentIntents.retrieve(paymentIntentId);

      console.log('🔵 Payment intent status:', paymentIntent.status);

      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({
          success: false,
          message: 'Payment has not been completed yet',
          paymentStatus: paymentIntent.status,
        });
      }

      // Mark all fees as paid
      const paymentDate = new Date();
      const totalAmountPaid = paymentIntent.amount / 100; // Convert cents to dollars

      permit.fees.forEach((fee) => {
        fee.paid = true;
        fee.paidDate = paymentDate;
        fee.paidAmount = fee.amount;
        fee.paymentMethod = 'stripe';
        fee.receiptNumber = paymentIntent.id;
      });

      // Add internal note about payment
      permit.addInternalNote(
        req.user._id,
        req.user.fullName || req.user.email,
        `Payment confirmed via Stripe. Payment Intent: ${paymentIntentId}. Total: $${totalAmountPaid}`,
      );

      // Update permit status to submitted if it's currently a draft
      const wasSubmitted = permit.status === 'draft';
      if (wasSubmitted) {
        permit.updateStatus(
          'submitted',
          req.user._id,
          req.user.fullName || req.user.email,
          'Permit submitted with payment',
        );
      }

      await permit.save();

      console.log('🟢 Permit payment confirmed and submitted:', permitId);

      // If permit was just submitted, notify department reviewers
      if (wasSubmitted) {
        try {
          const notificationService = require('../services/notificationService');

          // Populate permit type and property to get details
          await permit.populate('permitTypeId');
          await permit.populate('propertyId');

          const permitType = permit.permitTypeId?.name || permit.type;
          const propertyAddress = permit.propertyId?.location?.address || 'N/A';
          const applicantName =
            permit.applicant?.name || req.user.fullName || req.user.email;

          // Notify each department assigned to review this permit
          for (const review of permit.departmentReviews) {
            await notificationService.notifyDepartmentReviewers({
              municipalityId: permit.municipalityId,
              department: review.department,
              notificationType: 'assignment',
              notificationData: {
                permitNumber: permit.permitNumber,
                permitType: permitType,
                department: review.department,
                propertyAddress: propertyAddress,
                applicantName: applicantName,
                permitId: permit._id.toString(),
              },
            });

            console.log(
              `📧 Department assignment notifications sent for ${review.department} on permit ${permit.permitNumber}`,
            );
          }
        } catch (notificationError) {
          console.error(
            'Failed to send department assignment notifications:',
            notificationError,
          );
          // Don't fail the request if notification fails
        }
      }

      // Calculate payment status from fees
      const allFeesPaid = permit.fees.every((fee) => fee.paid);

      res.json({
        success: true,
        message: 'Payment confirmed and permit submitted for approval',
        permit: {
          id: permit._id,
          permitNumber: permit.permitNumber,
          status: permit.status,
          paymentStatus: allFeesPaid ? 'paid' : 'partial',
          totalFees: permit.totalFees,
          totalPaid: permit.totalPaid,
          paymentDate: paymentDate,
        },
      });
    } catch (error) {
      console.error('❌ Error confirming payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to confirm payment',
        error: error.message,
      });
    }
  },
);

// ===================================================================
// DEPARTMENT REVIEW ENDPOINTS
// ===================================================================

/**
 * PUT /municipalities/:municipalityId/permits/:permitId/reviews/:departmentName
 * Submit or update a department review for a permit
 */
router.put(
  '/municipalities/:municipalityId/permits/:permitId/reviews/:departmentName',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, permitId, departmentName } = req.params;
      const { status, comments, conditions, requestedRevisions } = req.body;

      const permit = await Permit.findOne({
        _id: permitId,
        municipalityId,
      });

      if (!permit) {
        return res.status(404).json({ error: 'Permit not found' });
      }

      // Find the department review
      const reviewIndex = permit.departmentReviews.findIndex(
        (review) => review.department === departmentName,
      );

      if (reviewIndex === -1) {
        return res.status(404).json({
          error: `No review found for department: ${departmentName}`,
        });
      }

      // Update review status
      permit.departmentReviews[reviewIndex].status = status;
      permit.departmentReviews[reviewIndex].reviewedBy = req.user._id;
      permit.departmentReviews[reviewIndex].reviewedAt = new Date();

      // Add conditions if provided
      if (conditions && conditions.length > 0) {
        permit.departmentReviews[reviewIndex].conditions = conditions;
      }

      // Add requested revisions if provided
      if (requestedRevisions && requestedRevisions.length > 0) {
        permit.departmentReviews[reviewIndex].requestedRevisions =
          requestedRevisions;
      }

      // If reviewer provided comments, create a PermitComment
      if (comments && comments.trim()) {
        const PermitComment = require('../models/PermitComment');

        const reviewerName =
          req.user.first_name && req.user.last_name
            ? `${req.user.first_name} ${req.user.last_name}`
            : req.user.email;

        const comment = new PermitComment({
          municipalityId,
          permitId,
          content: comments.trim(),
          visibility: 'internal',
          authorId: req.user._id,
          authorName: reviewerName,
          department: departmentName,
          attachments: [],
        });

        await comment.save();
      }

      // Check if all required reviews are complete and approved
      const allReviewsComplete = permit.departmentReviews
        .filter((r) => r.required)
        .every((r) =>
          ['approved', 'conditionally_approved', 'rejected'].includes(r.status),
        );

      if (allReviewsComplete) {
        const allApproved = permit.departmentReviews
          .filter((r) => r.required)
          .every((r) =>
            ['approved', 'conditionally_approved'].includes(r.status),
          );

        const anyRejected = permit.departmentReviews
          .filter((r) => r.required)
          .some((r) => r.status === 'rejected');

        if (anyRejected) {
          permit.status = 'denied';
        } else if (allApproved) {
          permit.status = 'approved';
        }
      }

      await permit.save();

      // Populate reviewer details
      await permit.populate(
        'departmentReviews.reviewedBy',
        'first_name last_name email',
      );

      // Send notification to permit applicant about review completion
      try {
        const notificationService = require('../services/notificationService');

        const reviewerName =
          req.user.first_name && req.user.last_name
            ? `${req.user.first_name} ${req.user.last_name}`
            : req.user.email;

        // Notify the permit applicant/owner
        if (permit.submitted_by) {
          await notificationService.sendDepartmentReviewCompleted({
            userId: permit.submitted_by.toString(),
            municipalityId: municipalityId,
            permitNumber: permit.permitNumber,
            department: departmentName,
            reviewStatus: status,
            reviewedBy: reviewerName,
            conditions: conditions || [],
          });

          console.log(
            `📧 Review completion notification sent for permit ${permit.permitNumber}, department ${departmentName}`,
          );
        }
      } catch (notificationError) {
        console.error(
          'Failed to send review completion notification:',
          notificationError,
        );
        // Don't fail the request if notification fails
      }

      res.json({
        permit,
        message: 'Review submitted successfully',
      });
    } catch (error) {
      console.error('❌ Error submitting department review:', error);
      res.status(500).json({
        error: 'Failed to submit review',
        message: error.message,
      });
    }
  },
);

// ===================================================================
// INSPECTION ENDPOINTS
// ===================================================================

/**
 * GET /municipalities/:municipalityId/inspections
 * List all inspections for a municipality with filtering and pagination
 * @query tab - 'today', 'all', 'my' (default: 'today')
 * @query dateFrom - Filter start date
 * @query dateTo - Filter end date
 * @query inspector - Filter by inspector ID
 * @query status - Filter by status
 * @query type - Filter by inspection type
 * @query search - Search in property address, permit number
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 50)
 */
router.get(
  '/municipalities/:municipalityId/inspections',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        tab = 'today',
        dateFrom,
        dateTo,
        inspector,
        status,
        type,
        search,
        page = 1,
        limit = 50,
      } = req.query;

      // Build base query
      const query = {
        municipalityId: new mongoose.Types.ObjectId(municipalityId),
        isActive: true,
      };

      // Tab-based filtering
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      if (tab === 'today') {
        query.scheduledDate = {
          $gte: startOfToday,
          $lte: endOfToday,
        };
      } else if (tab === 'my' && req.user._id) {
        query.inspector = req.user._id;
        query.status = { $in: ['scheduled', 'in_progress'] };
      }

      // Date range filter
      if (dateFrom || dateTo) {
        query.scheduledDate = {};
        if (dateFrom) {
          query.scheduledDate.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          query.scheduledDate.$lte = endDate;
        }
      }

      // Additional filters
      if (inspector) {
        query.inspector = new mongoose.Types.ObjectId(inspector);
      }
      if (status) {
        query.status = status;
      }
      if (type) {
        query.type = type;
      }

      // Search
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
          { propertyAddress: searchRegex },
          { 'permitId.permitNumber': searchRegex },
        ];
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const total = await PermitInspection.countDocuments(query);
      const totalPages = Math.ceil(total / parseInt(limit));

      // Fetch inspections
      const inspections = await PermitInspection.find(query)
        .populate('permitId', 'permitNumber type propertyAddress')
        .populate('inspector', 'first_name last_name email')
        .populate('propertyId', 'location pid')
        .sort({ scheduledDate: 1, scheduledTimeSlot: 1 })
        .skip(skip)
        .limit(parseInt(limit));

      // Get filter options
      const inspectors = await mongoose
        .model('User')
        .find({
          municipal_permissions: {
            $elemMatch: {
              municipality_id: new mongoose.Types.ObjectId(municipalityId),
              role: { $in: ['admin', 'department_head', 'staff'] },
            },
          },
        })
        .select('first_name last_name');

      const inspectionTypes = [
        'foundation',
        'framing',
        'rough_electrical',
        'rough_plumbing',
        'rough_mechanical',
        'insulation',
        'drywall',
        'final_electrical',
        'final_plumbing',
        'final_mechanical',
        'final',
        'occupancy',
        'fire',
        'other',
      ];

      const statuses = [
        'scheduled',
        'in_progress',
        'completed',
        'cancelled',
        'no_access',
        'rescheduled',
      ];

      // Calculate stats for tabs
      const todayCount = await PermitInspection.countDocuments({
        municipalityId: new mongoose.Types.ObjectId(municipalityId),
        isActive: true,
        scheduledDate: {
          $gte: startOfToday,
          $lte: endOfToday,
        },
      });

      const allCount = await PermitInspection.countDocuments({
        municipalityId: new mongoose.Types.ObjectId(municipalityId),
        isActive: true,
      });

      const myCount = req.user._id
        ? await PermitInspection.countDocuments({
            municipalityId: new mongoose.Types.ObjectId(municipalityId),
            isActive: true,
            inspector: req.user._id,
            status: { $in: ['scheduled', 'in_progress'] },
          })
        : 0;

      res.json({
        inspections,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
        },
        filters: {
          inspectors,
          types: inspectionTypes,
          statuses,
        },
        stats: {
          today: todayCount,
          all: allCount,
          my: myCount,
        },
      });
    } catch (error) {
      console.error('Error fetching inspections:', error);
      res.status(500).json({
        error: 'Failed to fetch inspections',
        message: error.message,
      });
    }
  },
);

/**
 * GET /municipalities/:municipalityId/permits/:permitId/inspections
 * List all inspections for a permit
 */
router.get(
  '/municipalities/:municipalityId/permits/:permitId/inspections',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, permitId } = req.params;

      // Verify permit exists and user has access
      const permit = await Permit.findOne({
        _id: permitId,
        municipalityId,
      });

      if (!permit) {
        return res.status(404).json({ error: 'Permit not found' });
      }

      // Check if user has access to this permit
      const isContractor =
        req.user.global_role === 'contractor' &&
        permit.contractor_id?.toString() === req.user.contractor_id?.toString();
      const isMunicipalStaff =
        req.user.global_role === 'avitar_staff' ||
        req.user.global_role === 'avitar_admin' ||
        req.user.hasAccessToMunicipality(municipalityId);

      if (!isContractor && !isMunicipalStaff) {
        return res.status(403).json({ error: 'Access denied to this permit' });
      }

      // Get all inspections for this permit
      const inspections = await PermitInspection.find({
        permitId,
        municipalityId,
        isActive: true,
      })
        .populate('inspector', 'first_name last_name email')
        .populate('createdBy', 'first_name last_name')
        .sort({ scheduledDate: 1 });

      res.json({
        inspections,
        count: inspections.length,
      });
    } catch (error) {
      console.error('❌ Error fetching inspections:', error);
      res.status(500).json({
        error: 'Failed to fetch inspections',
        message: error.message,
      });
    }
  },
);

/**
 * GET /municipalities/:municipalityId/permits/:permitId/inspections/available-slots
 * Calculate available time slots based on municipality settings and inspector availability
 */
router.get(
  '/municipalities/:municipalityId/permits/:permitId/inspections/available-slots',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, permitId } = req.params;
      const { inspectionType, startDate, endDate } = req.query;

      if (!inspectionType) {
        return res.status(400).json({ error: 'inspectionType is required' });
      }

      // Verify permit exists
      const permit = await Permit.findOne({
        _id: permitId,
        municipalityId,
      }).populate('permitTypeId');

      if (!permit) {
        return res.status(404).json({ error: 'Permit not found' });
      }

      // Get municipality with inspection settings
      const municipality = await Municipality.findById(municipalityId);

      if (!municipality?.inspectionSettings?.availableTimeSlots?.length) {
        return res.status(400).json({
          error:
            'Municipality has not configured inspection availability settings',
        });
      }

      // Get permit type inspection requirements
      const permitType = permit.permitTypeId;
      const inspectionRequirement =
        permitType?.inspectionSettings?.requiredInspections?.find(
          (req) => req.type === inspectionType,
        );

      const bufferDays = inspectionRequirement?.bufferDays || 1;
      const estimatedMinutes = inspectionRequirement?.estimatedMinutes || 60;

      // Calculate date range for slot search
      const searchStartDate = startDate
        ? new Date(startDate)
        : new Date(Date.now() + bufferDays * 24 * 60 * 60 * 1000);
      const searchEndDate = endDate
        ? new Date(endDate)
        : new Date(searchStartDate.getTime() + 14 * 24 * 60 * 60 * 1000); // Default 2 weeks

      // Get all active inspectors who can perform this type
      const activeInspectors =
        municipality.inspectionSettings.inspectors.filter(
          (insp) =>
            insp.isActive &&
            (insp.inspectionTypes.includes(inspectionType) ||
              insp.inspectionTypes.length === 0), // Empty array means all types
        );

      if (activeInspectors.length === 0) {
        return res.status(400).json({
          error: 'No inspectors available for this inspection type',
        });
      }

      // Calculate available slots
      const availableSlots = [];
      const currentDate = new Date(searchStartDate);
      currentDate.setHours(0, 0, 0, 0);

      while (currentDate <= searchEndDate) {
        const dayOfWeek = currentDate.getDay();

        // Get time slots configured for this day of week
        const dayTimeSlots =
          municipality.inspectionSettings.availableTimeSlots.filter(
            (slot) => slot.dayOfWeek === dayOfWeek,
          );

        for (const timeSlot of dayTimeSlots) {
          // Parse start and end times
          const [startHour, startMinute] = timeSlot.startTime
            .split(':')
            .map(Number);
          const [endHour, endMinute] = timeSlot.endTime.split(':').map(Number);

          const slotStartTime = new Date(currentDate);
          slotStartTime.setHours(startHour, startMinute, 0, 0);

          const slotEndTime = new Date(currentDate);
          slotEndTime.setHours(endHour, endMinute, 0, 0);

          // Generate individual time slots based on slot duration
          let currentSlotStart = new Date(slotStartTime);

          while (currentSlotStart < slotEndTime) {
            const currentSlotEnd = new Date(
              currentSlotStart.getTime() + estimatedMinutes * 60 * 1000,
            );

            // Skip if this slot would extend beyond the day's end time
            if (currentSlotEnd > slotEndTime) {
              break;
            }

            // Check inspector availability for this slot
            const availableInspector = await findAvailableInspector(
              activeInspectors,
              municipalityId,
              currentSlotStart,
              currentSlotEnd,
              estimatedMinutes,
            );

            if (availableInspector) {
              availableSlots.push({
                startTime: new Date(currentSlotStart),
                endTime: new Date(currentSlotEnd),
                date: new Date(currentDate),
                dayOfWeek,
                inspectorId: availableInspector.userId,
                estimatedMinutes,
              });
            }

            // Move to next slot
            currentSlotStart = new Date(
              currentSlotStart.getTime() +
                (timeSlot.slotDuration || 60) * 60 * 1000,
            );
          }
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      res.json({
        availableSlots,
        bufferDays,
        estimatedMinutes,
        inspectionType,
        searchStartDate,
        searchEndDate,
      });
    } catch (error) {
      console.error('Error calculating available slots:', error);
      res.status(500).json({
        error: 'Failed to calculate available slots',
        message: error.message,
      });
    }
  },
);

/**
 * GET /municipalities/:municipalityId/inspections/:inspectionId
 * Get a single inspection with all details
 */
router.get(
  '/municipalities/:municipalityId/inspections/:inspectionId',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, inspectionId } = req.params;

      const inspection = await PermitInspection.findOne({
        _id: inspectionId,
        municipalityId,
      })
        .populate('permitId', 'permitNumber type propertyAddress')
        .populate('inspector', 'first_name last_name email phone')
        .populate('propertyId', 'location pid pid_formatted')
        .populate('permitId.permitTypeId', 'name category')
        .populate('history.performedBy', 'first_name last_name');

      if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' });
      }

      res.json({ inspection });
    } catch (error) {
      console.error('Error fetching inspection:', error);
      res.status(500).json({
        error: 'Failed to fetch inspection',
        message: error.message,
      });
    }
  },
);

/**
 * PATCH /municipalities/:municipalityId/inspections/:inspectionId/reschedule
 * Reschedule an existing inspection
 */
router.patch(
  '/municipalities/:municipalityId/inspections/:inspectionId/reschedule',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, inspectionId } = req.params;
      const { scheduledDate, scheduledTimeSlot, reason } = req.body;

      if (!scheduledDate || !reason) {
        return res.status(400).json({
          error: 'scheduledDate and reason are required',
        });
      }

      // Find the inspection
      const inspection = await PermitInspection.findOne({
        _id: inspectionId,
        municipalityId,
      });

      if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' });
      }

      // Check if inspection can be rescheduled
      if (!['scheduled', 'in_progress'].includes(inspection.status)) {
        return res.status(400).json({
          error: 'Only scheduled or in-progress inspections can be rescheduled',
        });
      }

      // Store old date for history
      const oldScheduledDate = inspection.scheduledDate;
      const oldScheduledTimeSlot = inspection.scheduledTimeSlot;

      // Update inspection
      inspection.scheduledDate = new Date(scheduledDate);
      inspection.scheduledTimeSlot = scheduledTimeSlot;
      inspection.status = 'rescheduled';
      inspection.rescheduledAt = new Date();
      inspection.rescheduledBy = req.user._id;
      inspection.rescheduleReason = reason;
      inspection.updatedAt = new Date();

      // Add to history
      if (!inspection.history) {
        inspection.history = [];
      }
      inspection.history.push({
        action: 'rescheduled',
        performedBy: req.user._id,
        performedAt: new Date(),
        details: {
          oldDate: oldScheduledDate,
          oldTimeSlot: oldScheduledTimeSlot,
          newDate: scheduledDate,
          newTimeSlot: scheduledTimeSlot,
          reason,
        },
      });

      await inspection.save();

      // TODO: Send notification to contractor about reschedule
      // This would typically use the notification service
      // await notificationService.notifyReschedule(inspection, reason);

      res.json({
        message: 'Inspection rescheduled successfully',
        inspection,
      });
    } catch (error) {
      console.error('Error rescheduling inspection:', error);
      res.status(500).json({
        error: 'Failed to reschedule inspection',
        message: error.message,
      });
    }
  },
);

/**
 * POST /municipalities/:municipalityId/inspections/:inspectionId/photos
 * Upload a photo to an inspection
 */
router.post(
  '/municipalities/:municipalityId/inspections/:inspectionId/photos',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, inspectionId } = req.params;
      const { photoUrl, caption, base64Data } = req.body;

      if (!photoUrl && !base64Data) {
        return res
          .status(400)
          .json({ error: 'photoUrl or base64Data is required' });
      }

      const inspection = await PermitInspection.findOne({
        _id: inspectionId,
        municipalityId,
      });

      if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' });
      }

      // Initialize photos array if it doesn't exist
      if (!inspection.photos) {
        inspection.photos = [];
      }

      // Add photo
      const photo = {
        url: photoUrl || base64Data, // In production, handle file upload properly
        caption: caption || '',
        uploadedBy: req.user._id,
        uploadedAt: new Date(),
      };

      inspection.photos.push(photo);
      inspection.updatedAt = new Date();

      await inspection.save();

      res.json({
        message: 'Photo uploaded successfully',
        photo,
      });
    } catch (error) {
      console.error('Error uploading photo:', error);
      res.status(500).json({
        error: 'Failed to upload photo',
        message: error.message,
      });
    }
  },
);

/**
 * POST /municipalities/:municipalityId/inspections/:inspectionId/notes
 * Add a note to an inspection
 */
router.post(
  '/municipalities/:municipalityId/inspections/:inspectionId/notes',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, inspectionId } = req.params;
      const { content, attachments } = req.body;

      if (!content?.trim()) {
        return res.status(400).json({ error: 'content is required' });
      }

      const inspection = await PermitInspection.findOne({
        _id: inspectionId,
        municipalityId,
      });

      if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' });
      }

      // Initialize notes array if it doesn't exist
      if (!inspection.notes) {
        inspection.notes = [];
      }

      // Add note
      const note = {
        content: content.trim(),
        attachments: attachments || [],
        createdBy: req.user._id,
        createdAt: new Date(),
      };

      inspection.notes.push(note);
      inspection.updatedAt = new Date();

      // Add to history
      if (!inspection.history) {
        inspection.history = [];
      }
      inspection.history.push({
        action: 'note_added',
        performedBy: req.user._id,
        performedAt: new Date(),
        details: {
          notePreview: content.substring(0, 100),
        },
      });

      await inspection.save();

      // Populate the createdBy user data for response
      await inspection.populate('notes.createdBy', 'first_name last_name');

      res.json({
        message: 'Note added successfully',
        note: inspection.notes[inspection.notes.length - 1],
      });
    } catch (error) {
      console.error('Error adding note:', error);
      res.status(500).json({
        error: 'Failed to add note',
        message: error.message,
      });
    }
  },
);

/**
 * PATCH /municipalities/:municipalityId/inspections/:inspectionId/status
 * Update inspection status and result
 */
router.patch(
  '/municipalities/:municipalityId/inspections/:inspectionId/status',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, inspectionId } = req.params;
      const { status, result, comments } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }

      const inspection = await PermitInspection.findOne({
        _id: inspectionId,
        municipalityId,
      });

      if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' });
      }

      const oldStatus = inspection.status;
      const oldResult = inspection.result;

      // Update status and result
      inspection.status = status;
      if (result) inspection.result = result;
      if (comments) inspection.comments = comments;
      inspection.updatedAt = new Date();

      // Set completion date if status is completed
      if (status === 'completed' && !inspection.completedAt) {
        inspection.completedAt = new Date();
      }

      // Add to history
      if (!inspection.history) {
        inspection.history = [];
      }
      inspection.history.push({
        action: 'status_updated',
        performedBy: req.user._id,
        performedAt: new Date(),
        details: {
          oldStatus,
          newStatus: status,
          oldResult,
          newResult: result,
          comments,
        },
      });

      await inspection.save();

      // Send notifications if completed with passed or failed result
      if (
        permit &&
        status === 'completed' &&
        (result === 'passed' || result === 'failed')
      ) {
        // Populate permit with user who submitted it
        await permit.populate('submitted_by');

        // Format inspection type for display
        const inspectionType = inspection.type
          ?.split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        // Prepare inspection data
        const inspectionData = {
          permitNumber: permit.permitNumber,
          applicantName: permit.applicant?.name || 'N/A',
          inspectionType: inspectionType,
          propertyAddress: inspection.propertyAddress || permit.propertyAddress,
          completedDate: new Date(),
          inspectorName: inspection.inspectorName,
          comments: comments,
          municipalityName: 'Building Department',
          moduleName: 'building_permit', // For permission checking
        };

        // Send notification to user who submitted the permit
        if (permit.submitted_by?._id) {
          try {
            await notificationService.sendInspectionNotification({
              userId: permit.submitted_by._id.toString(),
              municipalityId,
              inspectionType: result, // 'passed' or 'failed'
              inspectionData,
            });
            console.log(
              `Inspection ${result} notification sent to user ${permit.submitted_by._id} for permit ${permit.permitNumber}`,
            );
          } catch (notificationError) {
            console.error(
              `Failed to send inspection notification to user ${permit.submitted_by._id}:`,
              notificationError,
            );
          }
        } else {
          console.warn(
            `No submitted_by user found for permit ${permit.permitNumber}, cannot send inspection notification`,
          );
        }
      }

      res.json({
        message: 'Inspection status updated successfully',
        inspection,
      });
    } catch (error) {
      console.error('Error updating inspection status:', error);
      res.status(500).json({
        error: 'Failed to update inspection status',
        message: error.message,
      });
    }
  },
);

/**
 * Helper function to find an available inspector for a time slot
 */
async function findAvailableInspector(
  inspectors,
  municipalityId,
  startTime,
  endTime,
  estimatedMinutes,
) {
  // Check each inspector's availability
  for (const inspector of inspectors) {
    // Get inspector's schedule for this date
    const startOfDay = new Date(startTime);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startTime);
    endOfDay.setHours(23, 59, 59, 999);

    const existingInspections = await PermitInspection.find({
      municipalityId,
      inspector: inspector.userId,
      scheduledDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: { $in: ['scheduled', 'in_progress'] },
      isActive: true,
    });

    // Check if inspector already at daily limit
    if (existingInspections.length >= inspector.maxPerDay) {
      continue;
    }

    // Check for time conflicts
    let hasConflict = false;
    for (const existing of existingInspections) {
      const existingStart = new Date(existing.scheduledDate);
      const existingEnd = new Date(
        existingStart.getTime() + estimatedMinutes * 60 * 1000,
      );

      // Check if times overlap
      if (
        (startTime >= existingStart && startTime < existingEnd) ||
        (endTime > existingStart && endTime <= existingEnd) ||
        (startTime <= existingStart && endTime >= existingEnd)
      ) {
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) {
      return inspector;
    }
  }

  return null;
}

/**
 * POST /municipalities/:municipalityId/permits/:permitId/inspections
 * Create a new inspection with auto-assignment
 */
router.post(
  '/municipalities/:municipalityId/permits/:permitId/inspections',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, permitId } = req.params;
      const {
        type,
        scheduledDate,
        scheduledTimeSlot,
        contactName,
        contactPhone,
        contactEmail,
        accessInstructions,
        description,
      } = req.body;

      if (!type || !scheduledDate) {
        return res
          .status(400)
          .json({ error: 'type and scheduledDate are required' });
      }

      // Verify permit exists and is approved
      const permit = await Permit.findOne({
        _id: permitId,
        municipalityId,
      }).populate('permitTypeId propertyId');

      if (!permit) {
        return res.status(404).json({ error: 'Permit not found' });
      }

      if (permit.status !== 'approved') {
        return res.status(400).json({
          error: 'Inspections can only be scheduled for approved permits',
        });
      }

      // Check buffer days requirement
      const permitType = permit.permitTypeId;
      const inspectionRequirement =
        permitType?.inspectionSettings?.requiredInspections?.find(
          (req) => req.type === type,
        );

      const bufferDays = inspectionRequirement?.bufferDays || 1;
      const estimatedMinutes = inspectionRequirement?.estimatedMinutes || 60;
      const requestedDate = new Date(scheduledDate);
      const minAllowedDate = new Date(
        Date.now() + bufferDays * 24 * 60 * 60 * 1000,
      );

      if (requestedDate < minAllowedDate) {
        return res.status(400).json({
          error: `This inspection type requires at least ${bufferDays} day(s) advance notice`,
          bufferDays,
          minAllowedDate,
        });
      }

      // Get municipality for inspector auto-assignment
      const municipality = await Municipality.findById(municipalityId);
      const activeInspectors =
        municipality.inspectionSettings?.inspectors?.filter(
          (insp) =>
            insp.isActive &&
            (insp.inspectionTypes.includes(type) ||
              insp.inspectionTypes.length === 0),
        ) || [];

      // Auto-assign inspector
      const assignedInspector = await findAvailableInspector(
        activeInspectors,
        municipalityId,
        requestedDate,
        new Date(requestedDate.getTime() + estimatedMinutes * 60 * 1000),
        estimatedMinutes,
      );

      if (!assignedInspector) {
        return res.status(400).json({
          error:
            'No inspectors available for the requested date and time. Please choose a different time slot.',
        });
      }

      // Get inspector details
      const inspectorUser = await mongoose
        .model('User')
        .findById(assignedInspector.userId);

      // Create inspection
      const inspection = new PermitInspection({
        municipalityId,
        permitId,
        propertyId: permit.propertyId?._id,
        propertyAddress:
          permit.propertyAddress || permit.propertyId?.propertyAddress,
        type,
        description,
        scheduledDate: requestedDate,
        scheduledTimeSlot: scheduledTimeSlot || null,
        requestedDate: new Date(),
        requestedBy: req.user.email,
        inspector: assignedInspector.userId,
        inspectorName: `${inspectorUser.first_name} ${inspectorUser.last_name}`,
        status: 'scheduled',
        result: 'pending',
        contactName: contactName || permit.applicant?.name,
        contactPhone: contactPhone || permit.applicant?.phone,
        contactEmail: contactEmail || permit.applicant?.email,
        accessInstructions,
        createdBy: req.user._id,
        isActive: true,
      });

      await inspection.save();

      // TODO: Send email notifications to applicant and inspector
      // This will be implemented in the email notification task

      res.status(201).json({
        inspection: await inspection.populate([
          { path: 'inspector', select: 'first_name last_name email' },
          { path: 'createdBy', select: 'first_name last_name' },
        ]),
        message: 'Inspection scheduled successfully',
      });
    } catch (error) {
      console.error('❌ Error creating inspection:', error);
      res.status(500).json({
        error: 'Failed to create inspection',
        message: error.message,
      });
    }
  },
);

/**
 * PUT /municipalities/:municipalityId/permits/:permitId/inspections/:inspectionId
 * Update/reschedule an inspection
 */
router.put(
  '/municipalities/:municipalityId/permits/:permitId/inspections/:inspectionId',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, permitId, inspectionId } = req.params;
      const {
        scheduledDate,
        contactName,
        contactPhone,
        contactEmail,
        accessInstructions,
        description,
      } = req.body;

      // Find existing inspection
      const inspection = await PermitInspection.findOne({
        _id: inspectionId,
        permitId,
        municipalityId,
        isActive: true,
      });

      if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' });
      }

      // Only allow rescheduling if not completed
      if (inspection.status === 'completed') {
        return res
          .status(400)
          .json({ error: 'Cannot modify completed inspections' });
      }

      // If rescheduling, validate new date
      if (scheduledDate && scheduledDate !== inspection.scheduledDate) {
        const permit = await Permit.findById(permitId).populate('permitTypeId');
        const inspectionRequirement =
          permit.permitTypeId?.inspectionSettings?.requiredInspections?.find(
            (req) => req.type === inspection.type,
          );

        const bufferDays = inspectionRequirement?.bufferDays || 1;
        const requestedDate = new Date(scheduledDate);
        const minAllowedDate = new Date(
          Date.now() + bufferDays * 24 * 60 * 60 * 1000,
        );

        if (requestedDate < minAllowedDate) {
          return res.status(400).json({
            error: `This inspection type requires at least ${bufferDays} day(s) advance notice`,
            bufferDays,
          });
        }

        // Check inspector availability for new date
        const estimatedMinutes = inspectionRequirement?.estimatedMinutes || 60;
        const municipality = await Municipality.findById(municipalityId);
        const activeInspectors =
          municipality.inspectionSettings?.inspectors?.filter(
            (insp) =>
              insp.isActive &&
              (insp.inspectionTypes.includes(inspection.type) ||
                insp.inspectionTypes.length === 0),
          ) || [];

        const availableInspector = await findAvailableInspector(
          activeInspectors,
          municipalityId,
          requestedDate,
          new Date(requestedDate.getTime() + estimatedMinutes * 60 * 1000),
          estimatedMinutes,
        );

        if (!availableInspector) {
          return res.status(400).json({
            error:
              'No inspectors available for the requested date and time. Please choose a different time slot.',
          });
        }

        // Update inspection date and inspector
        inspection.scheduledDate = requestedDate;
        if (
          availableInspector.userId.toString() !==
          inspection.inspector?.toString()
        ) {
          const inspectorUser = await mongoose
            .model('User')
            .findById(availableInspector.userId);
          inspection.inspector = availableInspector.userId;
          inspection.inspectorName = `${inspectorUser.first_name} ${inspectorUser.last_name}`;
        }
        inspection.status = 'rescheduled';
      }

      // Update other fields
      if (contactName !== undefined) inspection.contactName = contactName;
      if (contactPhone !== undefined) inspection.contactPhone = contactPhone;
      if (contactEmail !== undefined) inspection.contactEmail = contactEmail;
      if (accessInstructions !== undefined)
        inspection.accessInstructions = accessInstructions;
      if (description !== undefined) inspection.description = description;

      inspection.updatedBy = req.user._id;
      await inspection.save();

      // TODO: Send email notifications about the update
      // This will be implemented in the email notification task

      res.json({
        inspection: await inspection.populate([
          { path: 'inspector', select: 'first_name last_name email' },
          { path: 'updatedBy', select: 'first_name last_name' },
        ]),
        message: 'Inspection updated successfully',
      });
    } catch (error) {
      console.error('❌ Error updating inspection:', error);
      res.status(500).json({
        error: 'Failed to update inspection',
        message: error.message,
      });
    }
  },
);

/**
 * DELETE /municipalities/:municipalityId/permits/:permitId/inspections/:inspectionId
 * Cancel an inspection
 */
router.delete(
  '/municipalities/:municipalityId/permits/:permitId/inspections/:inspectionId',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId, permitId, inspectionId } = req.params;
      const { cancellationReason } = req.body;

      // Find existing inspection
      const inspection = await PermitInspection.findOne({
        _id: inspectionId,
        permitId,
        municipalityId,
        isActive: true,
      });

      if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' });
      }

      // Only allow cancellation if not completed
      if (inspection.status === 'completed') {
        return res
          .status(400)
          .json({ error: 'Cannot cancel completed inspections' });
      }

      // Update inspection status to cancelled
      inspection.status = 'cancelled';
      inspection.result = 'cancelled';
      inspection.cancelledDate = new Date();
      inspection.cancelledBy = req.user._id;
      inspection.cancellationReason = cancellationReason || 'Cancelled by user';
      inspection.updatedBy = req.user._id;

      await inspection.save();

      // TODO: Send email notifications about cancellation
      // This will be implemented in the email notification task

      res.json({
        inspection: await inspection.populate([
          { path: 'inspector', select: 'first_name last_name email' },
          { path: 'cancelledBy', select: 'first_name last_name' },
        ]),
        message: 'Inspection cancelled successfully',
      });
    } catch (error) {
      console.error('❌ Error cancelling inspection:', error);
      res.status(500).json({
        error: 'Failed to cancel inspection',
        message: error.message,
      });
    }
  },
);

module.exports = router;
