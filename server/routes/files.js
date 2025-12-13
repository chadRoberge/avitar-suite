const express = require('express');
const router = express.Router();
const multer = require('multer');
const File = require('../models/File');
const Municipality = require('../models/Municipality');
const PermitDocument = require('../models/PermitDocument');
const storageService = require('../services/storageService');
const { authenticateToken } = require('../middleware/auth');

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
 * Middleware to check department permission
 */
const checkDepartmentPermission = (action) => {
  return (req, res, next) => {
    const { municipalityId } = req.params;
    const { department } = req.body || req.query;

    // Avitar staff have all permissions
    if (
      req.user.global_role === 'avitar_staff' ||
      req.user.global_role === 'avitar_admin'
    ) {
      return next();
    }

    // Map department to module name
    const moduleMap = {
      assessing: 'assessing',
      building_permit: 'building_permit',
      code_enforcement: 'codeEnforcement',
      tax_collection: 'taxCollection',
      general: 'general',
    };

    const moduleName = moduleMap[department] || department;

    // Check module permission
    if (!req.user.hasModulePermission(municipalityId, moduleName, action)) {
      return res.status(403).json({
        error: `Insufficient permissions to ${action} files in ${department}`,
      });
    }

    next();
  };
};

/**
 * POST /api/files/upload
 * Upload a file for contractor verification (no municipality required)
 * Storage path: State/Contractors/Contractor_id/licenseDocuments
 */
router.post(
  '/files/upload',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const { type, category } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Only allow contractor verification uploads
      if (type !== 'contractor_verification') {
        return res.status(400).json({ error: 'Invalid upload type' });
      }

      // Only contractors can upload verification files
      if (req.user.global_role !== 'contractor') {
        return res
          .status(403)
          .json({ error: 'Only contractors can upload verification files' });
      }

      if (!req.user.contractor_id) {
        return res.status(400).json({ error: 'Contractor profile required' });
      }

      // Get contractor to determine state (you might need to fetch this from Contractor model)
      // For now, using a default state - you may want to fetch from contractor profile
      const Contractor = require('../models/Contractor');
      const contractor = await Contractor.findById(req.user.contractor_id);
      const state = contractor?.business_info?.address?.state || 'Unknown';

      // Generate unique file name
      const timestamp = Date.now();
      const fileExtension = req.file.originalname.split('.').pop();
      const fileName = `${timestamp}-${req.file.originalname}`;

      // Generate storage path: State/Contractors/Contractor_id/licenseDocuments
      const storagePath = storageService.generateOrganizedPath(fileName, {
        state: state,
        municipality: 'Contractors',
        municipalityId: req.user.contractor_id.toString(),
        department: 'licenseDocuments',
      });

      // Upload to storage
      const uploadResult = await storageService.uploadFile(
        req.file.buffer,
        storagePath,
        {
          contentType: req.file.mimetype,
          visibility: 'private',
          originalName: req.file.originalname,
          state: state,
          municipality: 'Contractors',
          department: 'licenseDocuments',
        },
      );

      // Create file record
      const file = new File({
        state: state,
        municipalityName: 'Contractors',
        department: 'licenseDocuments',
        fileName,
        displayName: req.file.originalname,
        originalName: req.file.originalname,
        fileType: req.file.mimetype,
        fileExtension,
        fileSize: req.file.size,
        storageType: uploadResult.storageType,
        storagePath: uploadResult.storagePath,
        gcsUrl: uploadResult.gcsUrl,
        localPath: uploadResult.localPath,
        folder: '/licenseDocuments',
        tags: ['contractor_verification', category || 'license'].filter(
          Boolean,
        ),
        visibility: 'private',
        category: category || 'license',
        uploadedBy: req.user._id,
        uploadedByName: req.user.fullName,
        md5Hash: uploadResult.md5Hash,
        sha256Hash: uploadResult.sha256Hash,
      });

      await file.save();

      res.status(201).json({ file });
    } catch (error) {
      console.error('Error uploading verification file:', error);
      res.status(500).json({
        error: 'Failed to upload file',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/files/upload
 * Upload a file
 */
router.post(
  '/municipalities/:municipalityId/files/upload',
  authenticateToken,
  checkMunicipalityAccess,
  upload.single('file'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        propertyId,
        department,
        folder = '/',
        displayName,
        description,
        category,
        visibility = 'private',
        tags,
        relatedPermitId,
        relatedInspectionId,
        permitId,
        permitNumber,
        projectId,
        projectName,
        isProjectFile,
      } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!department) {
        return res.status(400).json({ error: 'Department is required' });
      }

      // Check department permission
      const moduleMap = {
        assessing: 'assessing',
        building_permit: 'building_permit',
        code_enforcement: 'codeEnforcement',
        tax_collection: 'taxCollection',
        general: 'general',
      };

      const moduleName = moduleMap[department] || department;

      // Allow contractors to upload files for their own permits
      let hasPermission = false;

      // Avitar staff always have permission
      if (
        req.user.global_role === 'avitar_staff' ||
        req.user.global_role === 'avitar_admin'
      ) {
        hasPermission = true;
      }
      // Contractors can upload to building_permit department
      else if (
        req.user.global_role === 'contractor' &&
        department === 'building_permit'
      ) {
        // If permitId is provided, verify ownership
        if (permitId) {
          const Permit = require('../models/Permit');
          const permit = await Permit.findById(permitId);

          if (
            permit &&
            permit.contractor_id &&
            permit.contractor_id.toString() ===
              req.user.contractor_id?.toString()
          ) {
            hasPermission = true;
          }
        } else {
          // No permitId means they're uploading during permit creation - allow it
          hasPermission = true;
        }
      }
      // Municipal staff need module permissions
      else if (
        req.user.hasModulePermission(municipalityId, moduleName, 'create')
      ) {
        hasPermission = true;
      }

      if (!hasPermission) {
        return res.status(403).json({
          error: `Insufficient permissions to upload files in ${department}`,
        });
      }

      // Fetch municipality data for organized path
      const municipality = await Municipality.findById(municipalityId);
      if (!municipality) {
        return res.status(404).json({ error: 'Municipality not found' });
      }

      // Generate unique file name
      const timestamp = Date.now();
      const fileExtension = req.file.originalname.split('.').pop();
      const fileName = `${timestamp}-${req.file.originalname}`;

      // Generate organized storage path with state and folder
      const storagePath = storageService.generateOrganizedPath(fileName, {
        state: municipality.state,
        municipality: municipality.name,
        municipalityId,
        propertyId,
        department,
        folder,
      });

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
          department,
        },
      );

      // Create file record
      const file = new File({
        municipalityId,
        municipalityName: municipality.name,
        state: municipality.state,
        propertyId,
        department,
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
        folder,
        tags: tags ? (Array.isArray(tags) ? tags : tags.split(',')) : [],
        visibility,
        description,
        category,
        relatedPermitId,
        relatedInspectionId,
        permitId,
        permitNumber,
        projectId,
        projectName,
        isProjectFile: isProjectFile === 'true' || isProjectFile === true,
        uploadedBy: req.user._id,
        uploadedByName: req.user.fullName,
        md5Hash: uploadResult.md5Hash,
        sha256Hash: uploadResult.sha256Hash,
      });

      await file.save();

      // Create PermitDocument record if permitId is provided
      if (permitId && permitId !== 'undefined' && permitId !== 'null') {
        try {
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
            permitId: permitId,
            fileId: file._id,
            municipalityId: municipalityId,
            type: typeMap[category] || 'other',
            filename: file.fileName,
            originalFilename: file.originalName,
            url: file.gcsUrl || file.localPath,
            size: file.fileSize,
            mimeType: file.fileType,
            uploadedBy: req.user._id,
            uploadedByName: req.user.fullName,
            title: displayName || file.displayName,
            description: description,
            isActive: true,
          });
          await permitDocument.save();
          console.log(
            `Created PermitDocument linking permit ${permitId} to file ${file._id}`,
          );
        } catch (pdError) {
          console.error('Failed to create PermitDocument:', pdError);
          // Don't fail the entire upload - file is already saved
          // Just log the error and continue
        }
      }

      // Populate before returning
      await file.populate([
        { path: 'uploadedBy', select: 'first_name last_name email' },
      ]);

      res.status(201).json(file);
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({
        error: 'Failed to upload file',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/municipalities/:municipalityId/files
 * List files with filtering
 */
router.get(
  '/municipalities/:municipalityId/files',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        propertyId,
        department,
        folder,
        category,
        visibility,
        search,
        permitId,
        limit = 100,
        offset = 0,
      } = req.query;

      // Build query
      const query = {
        municipalityId,
        isActive: true,
      };

      if (propertyId && propertyId !== 'undefined' && propertyId !== 'null') {
        query.propertyId = propertyId;
      }

      if (department) {
        query.department = department;
      }

      if (folder) {
        query.folder = folder;
      }

      if (category) {
        query.category = category;
      }

      if (visibility) {
        query.visibility = visibility;
      }

      let files;
      let total;

      // If querying by permitId, use PermitDocument join collection
      if (permitId && permitId !== 'undefined' && permitId !== 'null') {
        // Convert to ObjectId if it's a valid ObjectId string
        const mongoose = require('mongoose');
        const permitObjectId = mongoose.Types.ObjectId.isValid(permitId)
          ? new mongoose.Types.ObjectId(permitId)
          : permitId;

        // Query PermitDocument collection to find file associations
        const permitDocQuery = {
          permitId: permitObjectId,
          isActive: true,
        };

        const permitDocs = await PermitDocument.find(permitDocQuery)
          .populate({
            path: 'fileId',
            populate: [
              { path: 'uploadedBy', select: 'first_name last_name email' },
              { path: 'propertyId', select: 'pid_formatted location.address' },
            ],
          })
          .sort({ createdAt: -1 })
          .lean();

        // Extract files from populated permitDocs and filter by municipality
        files = permitDocs
          .filter(
            (pd) =>
              pd.fileId &&
              pd.fileId.municipalityId?.toString() === query.municipalityId,
          )
          .map((pd) => pd.fileId);

        // Apply additional filters (search, category, etc.)
        if (category) {
          files = files.filter((f) => f.category === category);
        }
        if (visibility) {
          files = files.filter((f) => f.visibility === visibility);
        }
        if (search) {
          const searchLower = search.toLowerCase();
          files = files.filter(
            (f) =>
              f.fileName?.toLowerCase().includes(searchLower) ||
              f.displayName?.toLowerCase().includes(searchLower) ||
              f.description?.toLowerCase().includes(searchLower) ||
              f.tags?.some((tag) => tag.toLowerCase().includes(searchLower)),
          );
        }

        total = files.length;

        // Apply pagination
        files = files.slice(
          parseInt(offset),
          parseInt(offset) + parseInt(limit),
        );
      } else {
        // No permitId - query File collection directly as before
        if (search) {
          query.$or = [
            { fileName: { $regex: search, $options: 'i' } },
            { displayName: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { tags: { $in: [new RegExp(search, 'i')] } },
          ];
        }

        files = await File.find(query)
          .populate('uploadedBy', 'first_name last_name email')
          .populate('propertyId', 'pid_formatted location.address')
          .sort({ uploadedAt: -1 })
          .limit(parseInt(limit))
          .skip(parseInt(offset))
          .lean();

        total = await File.countDocuments(query);
      }

      res.json({
        files,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit),
        },
      });
    } catch (error) {
      console.error('Error fetching files:', error);
      res.status(500).json({
        error: 'Failed to fetch files',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/municipalities/:municipalityId/files/folders
 * Get folder structure
 */
router.get(
  '/municipalities/:municipalityId/files/folders',
  authenticateToken,
  checkMunicipalityAccess,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { propertyId, department } = req.query;

      if (!department) {
        return res.status(400).json({ error: 'Department is required' });
      }

      const folders = await File.getFolderStructure(
        municipalityId,
        propertyId,
        department,
      );

      res.json(folders);
    } catch (error) {
      console.error('Error fetching folder structure:', error);
      res.status(500).json({
        error: 'Failed to fetch folder structure',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/files/:fileId
 * Get a single file by ID
 */
router.get('/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await File.findById(fileId)
      .populate('uploadedBy', 'first_name last_name email')
      .populate('modifiedBy', 'first_name last_name')
      .populate('propertyId', 'pid_formatted location.address');

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check access
    if (
      req.user.global_role !== 'avitar_staff' &&
      req.user.global_role !== 'avitar_admin'
    ) {
      if (!req.user.hasAccessToMunicipality(file.municipalityId.toString())) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(file);
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({
      error: 'Failed to fetch file',
      message: error.message,
    });
  }
});

/**
 * GET /api/files/:fileId/download
 * Download a file
 */
router.get('/files/:fileId/download', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await File.findById(fileId);

    if (!file || !file.isActive) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check access
    if (
      req.user.global_role !== 'avitar_staff' &&
      req.user.global_role !== 'avitar_admin'
    ) {
      if (!req.user.hasAccessToMunicipality(file.municipalityId.toString())) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check visibility
      if (file.visibility === 'private' || file.visibility === 'restricted') {
        // Only allow if user uploaded it or has proper permissions
        if (file.uploadedBy.toString() !== req.user._id.toString()) {
          return res.status(403).json({ error: 'Access denied to this file' });
        }
      }
    }

    // Download file from storage
    const fileBuffer = await storageService.downloadFile(file.storagePath);

    // Set headers
    res.setHeader('Content-Type', file.fileType || 'application/octet-stream');

    // If 'inline' query param is present, display inline (for PDFs/images in viewer)
    // Otherwise, force download
    const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${file.originalName}"`,
    );
    res.setHeader('Content-Length', fileBuffer.length);

    res.send(fileBuffer);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      error: 'Failed to download file',
      message: error.message,
    });
  }
});

/**
 * PUT /api/files/:fileId
 * Update file metadata
 */
router.put('/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const updates = req.body;

    const file = await File.findById(fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check access
    if (
      req.user.global_role !== 'avitar_staff' &&
      req.user.global_role !== 'avitar_admin'
    ) {
      if (!req.user.hasAccessToMunicipality(file.municipalityId.toString())) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Apply updates (excluding protected fields)
    const allowedUpdates = [
      'displayName',
      'description',
      'folder',
      'tags',
      'category',
      'visibility',
    ];

    allowedUpdates.forEach((key) => {
      if (updates[key] !== undefined) {
        file[key] = updates[key];
      }
    });

    file.modifiedBy = req.user._id;
    file.modifiedAt = new Date();

    await file.save();

    await file.populate([
      { path: 'uploadedBy', select: 'first_name last_name' },
      { path: 'modifiedBy', select: 'first_name last_name' },
    ]);

    res.json(file);
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({
      error: 'Failed to update file',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/files/:fileId
 * Soft delete a file
 */
router.delete('/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { hardDelete = false } = req.query;

    const file = await File.findById(fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check access
    if (
      req.user.global_role !== 'avitar_staff' &&
      req.user.global_role !== 'avitar_admin'
    ) {
      if (!req.user.hasAccessToMunicipality(file.municipalityId.toString())) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (hardDelete === 'true') {
      // Delete from storage based on file's storageType
      try {
        if (file.storageType === 'gcs') {
          await storageService.deleteFromGCS(file.storagePath);
        } else {
          await storageService.deleteFromLocal(file.storagePath);
        }
      } catch (storageError) {
        console.warn('Error deleting file from storage:', storageError.message);
        // Continue with database deletion even if storage deletion fails
      }
      // Delete from database
      await file.deleteOne();
      res.json({ message: 'File permanently deleted' });
    } else {
      // Soft delete
      await file.softDelete(req.user._id);
      res.json({ message: 'File deleted successfully', file });
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      message: error.message,
    });
  }
});

/**
 * ==========================================
 * CONTRACTOR DOCUMENT LIBRARY ROUTES
 * ==========================================
 */

/**
 * POST /api/contractors/:contractorId/files/upload
 * Upload files to contractor's document library
 */
router.post(
  '/contractors/:contractorId/files/upload',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const { contractorId } = req.params;
      const {
        folder = '/',
        description,
        tags,
        visibility = 'private',
      } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Verify user has access to this contractor
      if (
        req.user.global_role !== 'avitar_staff' &&
        req.user.global_role !== 'avitar_admin' &&
        req.user.contractor_id?.toString() !== contractorId
      ) {
        return res
          .status(403)
          .json({ error: 'Access denied to this contractor' });
      }

      // Get contractor info
      const Contractor = require('../models/Contractor');
      const contractor = await Contractor.findById(contractorId);
      if (!contractor) {
        return res.status(404).json({ error: 'Contractor not found' });
      }

      const state = contractor.business_info?.address?.state || 'Unknown';

      // Generate unique file name
      const timestamp = Date.now();
      const fileExtension = req.file.originalname.split('.').pop();
      const fileName = `${timestamp}-${req.file.originalname}`;

      // Generate storage path for contractor files with folder support
      const storagePath = storageService.generateOrganizedPath(fileName, {
        state: state,
        municipality: 'Contractors',
        municipalityId: contractorId.toString(),
        department: 'documents',
        folder: folder,
      });

      // Upload to storage
      const uploadResult = await storageService.uploadFile(
        req.file.buffer,
        storagePath,
        req.file.mimetype,
      );

      // Parse tags
      let parsedTags = [];
      if (tags) {
        if (typeof tags === 'string') {
          try {
            parsedTags = JSON.parse(tags);
          } catch {
            parsedTags = tags
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t);
          }
        } else if (Array.isArray(tags)) {
          parsedTags = tags;
        }
      }

      // Create file record
      const file = new File({
        contractorId: contractor._id,
        contractorName: contractor.company_name,
        department: 'contractor',
        fileName: fileName,
        displayName: req.file.originalname,
        originalName: req.file.originalname,
        fileType: req.file.mimetype,
        fileExtension: fileExtension,
        fileSize: req.file.size,
        storageType: uploadResult.storageType,
        storagePath: uploadResult.storagePath,
        gcsUrl: uploadResult.gcsUrl,
        localPath: uploadResult.localPath,
        folder: folder,
        tags: parsedTags,
        visibility: visibility,
        description: description,
        uploadedBy: req.user._id,
        uploadedByName:
          req.user.fullName || `${req.user.first_name} ${req.user.last_name}`,
      });

      await file.save();

      res.status(201).json({ file });
    } catch (error) {
      console.error('Error uploading contractor file:', error);
      res.status(500).json({
        error: 'Failed to upload file',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/contractors/:contractorId/files
 * Get files for a contractor
 */
router.get(
  '/contractors/:contractorId/files',
  authenticateToken,
  async (req, res) => {
    try {
      const { contractorId } = req.params;
      const { folder, category, visibility, search } = req.query;

      // Verify user has access to this contractor
      if (
        req.user.global_role !== 'avitar_staff' &&
        req.user.global_role !== 'avitar_admin' &&
        req.user.contractor_id?.toString() !== contractorId
      ) {
        return res
          .status(403)
          .json({ error: 'Access denied to this contractor' });
      }

      const query = {
        contractorId: contractorId,
        department: 'contractor',
        isActive: true,
      };

      // Apply filters
      if (folder) query.folder = folder;
      if (category) query.category = category;
      if (visibility) query.visibility = visibility;

      // Apply search
      if (search) {
        query.$or = [
          { fileName: { $regex: search, $options: 'i' } },
          { displayName: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } },
        ];
      }

      const files = await File.find(query).sort({ uploadedAt: -1 });

      res.json({ files });
    } catch (error) {
      console.error('Error fetching contractor files:', error);
      res.status(500).json({
        error: 'Failed to fetch files',
        message: error.message,
      });
    }
  },
);

/**
 * GET /api/contractors/:contractorId/files/folders
 * Get folder structure for contractor files
 */
router.get(
  '/contractors/:contractorId/files/folders',
  authenticateToken,
  async (req, res) => {
    try {
      const { contractorId } = req.params;

      // Verify user has access to this contractor
      if (
        req.user.global_role !== 'avitar_staff' &&
        req.user.global_role !== 'avitar_admin' &&
        req.user.contractor_id?.toString() !== contractorId
      ) {
        return res
          .status(403)
          .json({ error: 'Access denied to this contractor' });
      }

      // Get all unique folders for this contractor
      const folders = await File.distinct('folder', {
        contractorId: contractorId,
        department: 'contractor',
        isActive: true,
      });

      // Build folder structure with file counts
      const folderStructure = {};
      for (const folder of folders) {
        const fileCount = await File.countDocuments({
          contractorId: contractorId,
          department: 'contractor',
          folder: folder,
          isActive: true,
        });
        folderStructure[folder] = { fileCount };
      }

      res.json({ folders: folderStructure });
    } catch (error) {
      console.error('Error fetching contractor folders:', error);
      res.status(500).json({
        error: 'Failed to fetch folders',
        message: error.message,
      });
    }
  },
);

module.exports = router;
