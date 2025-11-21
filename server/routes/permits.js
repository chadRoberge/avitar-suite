const express = require('express');
const router = express.Router();
const Permit = require('../models/Permit');
const PermitInspection = require('../models/PermitInspection');
const PermitDocument = require('../models/PermitDocument');
const PropertyTreeNode = require('../models/PropertyTreeNode');
const BuildingAssessment = require('../models/BuildingAssessment');
const Contractor = require('../models/Contractor');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');

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
    if (req.user.global_role === 'contractor' || req.user.global_role === 'citizen') {
      // Check if contractor is blacklisted
      if (req.user.contractor_id) {
        const contractor = await Contractor.findById(req.user.contractor_id);
        if (contractor?.is_blacklisted) {
          return res.status(403).json({
            error: 'Your account has been suspended. Please contact support for more information.',
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
    if (!req.user.hasModulePermission(municipalityId, 'buildingPermits', action)) {
      return res
        .status(403)
        .json({ error: `Insufficient permissions to ${action} permits` });
    }

    next();
  };
};

/**
 * GET /api/permits/my-permits
 * Get all permits accessible by the current user (contractor or citizen)
 * This endpoint is NOT municipality-scoped - shows permits across all municipalities
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
      const needingAttention = await Permit.findNeedingAttention(municipalityId);
      const expiringSoon = await Permit.findExpiringSoon(municipalityId);

      res.json({
        queue: permits,
        needingAttention,
        expiringSoon,
        stats: {
          submitted: permits.filter((p) => p.status === 'submitted').length,
          underReview: permits.filter((p) => p.status === 'under_review').length,
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
 * List all permits for a municipality with filtering
 */
router.get(
  '/municipalities/:municipalityId/permits',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('read'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
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

      // Build query
      const query = {
        municipalityId,
        isActive: true,
      };

      // Apply filters
      if (status) {
        query.status = status;
      }

      if (type) {
        query.type = type;
      }

      if (propertyId) {
        query.propertyId = propertyId;
      }

      if (assignedInspector) {
        query.assignedInspector = assignedInspector;
      }

      // Text search
      if (search) {
        query.$text = { $search: search };
      }

      // Execute query
      const permits = await Permit.find(query)
        .populate('propertyId', 'pid_formatted location.address')
        .populate('assignedInspector', 'first_name last_name email')
        .populate('createdBy', 'first_name last_name')
        .sort(sort)
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .lean();

      // Get total count for pagination
      const total = await Permit.countDocuments(query);

      res.json({
        permits,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > parseInt(offset) + parseInt(limit),
        },
      });
    } catch (error) {
      console.error('Error fetching permits:', error);
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

      // Populate before returning
      await permit.populate([
        { path: 'propertyId', select: 'pid_formatted location.address' },
        { path: 'createdBy', select: 'first_name last_name' },
      ]);

      res.status(201).json(permit);
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
        if (key !== '_id' && key !== 'municipalityId' && key !== 'permitNumber') {
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

      const comments = await PermitComment.find({
        municipalityId,
        permitId,
      })
        .sort({ createdAt: 1 }) // Oldest first for chat display
        .lean();

      res.json({ comments });
    } catch (error) {
      console.error('Error fetching permit comments:', error);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  }
);

// POST /api/municipalities/:municipalityId/permits/:permitId/comments
router.post(
  '/municipalities/:municipalityId/permits/:permitId/comments',
  authenticateToken,
  checkMunicipalityAccess,
  checkPermitPermission('update'),
  async (req, res) => {
    try {
      const { municipalityId, permitId } = req.params;
      const { content, visibility, authorId, authorName, attachments } = req.body;
      const PermitComment = require('../models/PermitComment');

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Comment content is required' });
      }

      // Use authenticated user's ID if authorId not provided
      const finalAuthorId = authorId || req.user._id;
      const finalAuthorName = authorName || req.user.fullName || req.user.email;

      const comment = new PermitComment({
        municipalityId,
        permitId,
        content: content.trim(),
        visibility: visibility || 'internal',
        authorId: finalAuthorId,
        authorName: finalAuthorName,
        attachments: attachments || [],
      });

      await comment.save();

      res.status(201).json(comment);
    } catch (error) {
      console.error('Error creating permit comment:', error);
      res.status(500).json({ error: 'Failed to create comment', message: error.message });
    }
  }
);

module.exports = router;
