const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Owner = require('../models/Owner');
const PropertyOwner = require('../models/PropertyOwner');
const { default: mongoose } = require('mongoose');

const router = express.Router();

// @route   GET /api/municipalities/:municipalityId/owners
// @desc    Get all owners for a municipality
// @access  Private
router.get(
  '/municipalities/:municipalityId/owners',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { search, limit = 50, skip = 0, owner_type } = req.query;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasAccessToMunicipality(municipalityId);

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied to this municipality',
        });
      }

      // Build query
      const query = {
        municipality_id: municipalityId,
        is_active: true,
      };

      // Add owner type filter if specified
      if (owner_type) {
        query.owner_type = owner_type;
      }

      // Add search functionality
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
          { first_name: searchRegex },
          { last_name: searchRegex },
          { business_name: searchRegex },
          { email: searchRegex },
          { 'address.street': searchRegex },
          { 'address.city': searchRegex },
        ];
      }

      const owners = await Owner.find(query)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort({ last_name: 1, first_name: 1, business_name: 1 });

      const total = await Owner.countDocuments(query);

      res.json({
        owners,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          hasMore: parseInt(skip) + parseInt(limit) < total,
        },
      });
    } catch (error) {
      console.error('Error fetching owners:', error);
      res.status(500).json({
        error: 'Failed to fetch owners',
        details: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/owners/:ownerId
// @desc    Get a specific owner
// @access  Private
router.get(
  '/municipalities/:municipalityId/owners/:ownerId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, ownerId } = req.params;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasAccessToMunicipality(municipalityId);

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied to this municipality',
        });
      }

      const owner = await Owner.findOne({
        _id: ownerId,
        municipality_id: municipalityId,
      });

      if (!owner) {
        return res.status(404).json({
          error: 'Owner not found',
        });
      }

      res.json({ owner });
    } catch (error) {
      console.error('Error fetching owner:', error);
      res.status(500).json({
        error: 'Failed to fetch owner',
        details: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/owners
// @desc    Create a new owner
// @access  Private
router.post(
  '/municipalities/:municipalityId/owners',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Check if user has permission to create owners
      const hasPermission =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasModulePermission(municipalityId, 'assessing', 'create');

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions to create owners',
        });
      }

      // Validate required fields based on owner type
      const { owner_type } = req.body;

      if (owner_type === 'individual') {
        if (!req.body.first_name || !req.body.last_name) {
          return res.status(400).json({
            error:
              'First name and last name are required for individual owners',
          });
        }
      } else {
        if (!req.body.business_name) {
          return res.status(400).json({
            error: 'Business name is required for non-individual owners',
          });
        }
      }

      const ownerData = {
        ...req.body,
        municipality_id: municipalityId,
        created_by: req.user._id,
        updated_by: req.user._id,
      };

      const owner = new Owner(ownerData);
      await owner.save();

      res.status(201).json({ owner });
    } catch (error) {
      console.error('Error creating owner:', error);

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          details: Object.values(error.errors).map((err) => err.message),
        });
      }

      res.status(500).json({
        error: 'Failed to create owner',
        details: error.message,
      });
    }
  },
);

// @route   PUT /api/municipalities/:municipalityId/owners/:ownerId
// @desc    Update an existing owner
// @access  Private
router.put(
  '/municipalities/:municipalityId/owners/:ownerId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, ownerId } = req.params;

      // Check if user has permission to update owners
      const hasPermission =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasModulePermission(municipalityId, 'assessing', 'update');

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions to update owners',
        });
      }

      // Find the owner
      const owner = await Owner.findOne({
        _id: ownerId,
        municipality_id: municipalityId,
      });

      if (!owner) {
        return res.status(404).json({
          error: 'Owner not found',
        });
      }

      // Validate required fields based on owner type
      const { owner_type } = req.body;

      if (owner_type === 'individual') {
        if (!req.body.first_name || !req.body.last_name) {
          return res.status(400).json({
            error:
              'First name and last name are required for individual owners',
          });
        }
      } else if (owner_type !== 'individual') {
        if (!req.body.business_name) {
          return res.status(400).json({
            error: 'Business name is required for non-individual owners',
          });
        }
      }

      // Update the owner
      const updateData = {
        ...req.body,
        updated_by: req.user._id,
      };

      // Remove fields that shouldn't be updated
      delete updateData.municipality_id;
      delete updateData.created_by;
      delete updateData.createdAt;

      Object.assign(owner, updateData);
      await owner.save();

      res.json({ owner });
    } catch (error) {
      console.error('Error updating owner:', error);

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          details: Object.values(error.errors).map((err) => err.message),
        });
      }

      res.status(500).json({
        error: 'Failed to update owner',
        details: error.message,
      });
    }
  },
);

// @route   DELETE /api/municipalities/:municipalityId/owners/:ownerId
// @desc    Delete (deactivate) an owner
// @access  Private
router.delete(
  '/municipalities/:municipalityId/owners/:ownerId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, ownerId } = req.params;

      // Check if user has permission to delete owners
      const hasPermission =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasModulePermission(municipalityId, 'assessing', 'delete');

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions to delete owners',
        });
      }

      // Find the owner
      const owner = await Owner.findOne({
        _id: ownerId,
        municipality_id: municipalityId,
      });

      if (!owner) {
        return res.status(404).json({
          error: 'Owner not found',
        });
      }

      // Check if this owner is associated with any properties
      // Note: This would need to be implemented when we create the property-owner relationship
      // For now, we'll just soft delete

      // Soft delete by setting is_active to false
      owner.is_active = false;
      owner.updated_by = req.user._id;
      await owner.save();

      res.json({
        message: 'Owner successfully deactivated',
        owner,
      });
    } catch (error) {
      console.error('Error deleting owner:', error);
      res.status(500).json({
        error: 'Failed to delete owner',
        details: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/owners/:ownerId/restore
// @desc    Restore (reactivate) a deactivated owner
// @access  Private
router.post(
  '/municipalities/:municipalityId/owners/:ownerId/restore',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, ownerId } = req.params;

      // Check if user has permission to restore owners
      const hasPermission =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasModulePermission(municipalityId, 'assessing', 'create');

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions to restore owners',
        });
      }

      // Find the owner (including inactive ones)
      const owner = await Owner.findOne({
        _id: ownerId,
        municipality_id: municipalityId,
      });

      if (!owner) {
        return res.status(404).json({
          error: 'Owner not found',
        });
      }

      // Reactivate the owner
      owner.is_active = true;
      owner.updated_by = req.user._id;
      await owner.save();

      res.json({
        message: 'Owner successfully restored',
        owner,
      });
    } catch (error) {
      console.error('Error restoring owner:', error);
      res.status(500).json({
        error: 'Failed to restore owner',
        details: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/owners/search
// @desc    Search owners with advanced filters
// @access  Private
router.get(
  '/municipalities/:municipalityId/owners/search',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const {
        q,
        owner_type,
        has_exemptions,
        city,
        state,
        zip_code,
        limit = 50,
        skip = 0,
      } = req.query;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasAccessToMunicipality(municipalityId);

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied to this municipality',
        });
      }

      // Build advanced search query
      const query = {
        municipality_id: municipalityId,
        is_active: true,
      };

      // Text search across multiple fields
      if (q) {
        const searchRegex = new RegExp(q, 'i');
        query.$or = [
          { first_name: searchRegex },
          { last_name: searchRegex },
          { business_name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { 'address.street': searchRegex },
          { 'address.city': searchRegex },
        ];
      }

      // Filter by owner type
      if (owner_type) {
        query.owner_type = owner_type;
      }

      // Filter by exemptions
      if (has_exemptions === 'true') {
        query.exemptions = { $exists: true, $not: { $size: 0 } };
      } else if (has_exemptions === 'false') {
        query.$or = [
          { exemptions: { $exists: false } },
          { exemptions: { $size: 0 } },
        ];
      }

      // Location filters
      if (city) {
        query['address.city'] = new RegExp(city, 'i');
      }
      if (state) {
        query['address.state'] = new RegExp(state, 'i');
      }
      if (zip_code) {
        query['address.zip_code'] = zip_code;
      }

      const owners = await Owner.find(query)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort({ last_name: 1, first_name: 1, business_name: 1 });

      const total = await Owner.countDocuments(query);

      res.json({
        owners,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          hasMore: parseInt(skip) + parseInt(limit) < total,
        },
        query: req.query, // Return the search parameters for reference
      });
    } catch (error) {
      console.error('Error searching owners:', error);
      res.status(500).json({
        error: 'Failed to search owners',
        details: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/owners/stats
// @desc    Get owner statistics for a municipality
// @access  Private
router.get(
  '/municipalities/:municipalityId/owners/stats',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasAccessToMunicipality(municipalityId);

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied to this municipality',
        });
      }

      const stats = await Owner.aggregate([
        {
          $match: {
            municipality_id: new mongoose.Types.ObjectId(municipalityId),
            is_active: true,
          },
        },
        {
          $group: {
            _id: null,
            totalOwners: { $sum: 1 },
            individualOwners: {
              $sum: {
                $cond: [{ $eq: ['$owner_type', 'individual'] }, 1, 0],
              },
            },
            businessOwners: {
              $sum: {
                $cond: [{ $ne: ['$owner_type', 'individual'] }, 1, 0],
              },
            },
            ownersWithExemptions: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $isArray: '$exemptions' },
                      { $gt: [{ $size: '$exemptions' }, 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            ownersWithEmail: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $ne: ['$email', null] }, { $ne: ['$email', ''] }],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      // Get owner type breakdown
      const ownerTypeStats = await Owner.aggregate([
        {
          $match: {
            municipality_id: new mongoose.Types.ObjectId(municipalityId),
            is_active: true,
          },
        },
        {
          $group: {
            _id: '$owner_type',
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
      ]);

      res.json({
        summary: stats[0] || {
          totalOwners: 0,
          individualOwners: 0,
          businessOwners: 0,
          ownersWithExemptions: 0,
          ownersWithEmail: 0,
        },
        ownerTypeBreakdown: ownerTypeStats,
      });
    } catch (error) {
      console.error('Error fetching owner stats:', error);
      res.status(500).json({
        error: 'Failed to fetch owner statistics',
        details: error.message,
      });
    }
  },
);

// ===== PROPERTY-OWNER RELATIONSHIP ENDPOINTS =====

// @route   GET /api/municipalities/:municipalityId/properties/:propertyId/owners
// @desc    Get all owners for a specific property
// @access  Private
router.get(
  '/municipalities/:municipalityId/properties/:propertyId/owners',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, propertyId } = req.params;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasAccessToMunicipality(municipalityId);

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied to this municipality',
        });
      }

      const propertyOwners = await PropertyOwner.find({
        municipality_id: municipalityId,
        property_id: propertyId,
        is_active: true,
      })
        .populate('owner_id')
        .sort({ is_primary: -1, ownership_percentage: -1 });

      // Get ownership validation info
      const ownershipValidation =
        await PropertyOwner.validateOwnershipPercentages(propertyId);

      res.json({
        propertyOwners,
        ownershipValidation,
        summary: {
          totalOwners: propertyOwners.length,
          primaryOwner: propertyOwners.find((po) => po.is_primary),
          totalOwnership: ownershipValidation.totalPercentage,
        },
      });
    } catch (error) {
      console.error('Error fetching property owners:', error);
      res.status(500).json({
        error: 'Failed to fetch property owners',
        details: error.message,
      });
    }
  },
);

// @route   POST /api/municipalities/:municipalityId/properties/:propertyId/owners
// @desc    Add an owner to a property
// @access  Private
router.post(
  '/municipalities/:municipalityId/properties/:propertyId/owners',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, propertyId } = req.params;

      // Check if user has permission to modify property owners
      const hasPermission =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasModulePermission(municipalityId, 'assessing', 'update');

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions to modify property owners',
        });
      }

      const {
        owner_id,
        ownership_percentage = 100,
        is_primary = false,
      } = req.body;

      if (!owner_id) {
        return res.status(400).json({
          error: 'Owner ID is required',
        });
      }

      // Check if owner exists
      const owner = await Owner.findOne({
        _id: owner_id,
        municipality_id: municipalityId,
        is_active: true,
      });

      if (!owner) {
        return res.status(404).json({
          error: 'Owner not found',
        });
      }

      // Check if relationship already exists
      const existingRelationship = await PropertyOwner.findOne({
        municipality_id: municipalityId,
        property_id: propertyId,
        owner_id: owner_id,
        is_active: true,
      });

      if (existingRelationship) {
        return res.status(400).json({
          error: 'Owner is already associated with this property',
        });
      }

      const propertyOwnerData = {
        ...req.body,
        municipality_id: municipalityId,
        property_id: propertyId,
        owner_id: owner_id,
        created_by: req.user._id,
        updated_by: req.user._id,
      };

      const propertyOwner = new PropertyOwner(propertyOwnerData);

      // If setting as primary, handle the primary owner logic
      if (is_primary) {
        await propertyOwner.setPrimary();
      } else {
        await propertyOwner.save();
      }

      // Populate the owner data for response
      await propertyOwner.populate('owner_id');

      res.status(201).json({ propertyOwner });
    } catch (error) {
      console.error('Error adding property owner:', error);

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          details: Object.values(error.errors).map((err) => err.message),
        });
      }

      res.status(500).json({
        error: 'Failed to add property owner',
        details: error.message,
      });
    }
  },
);

// @route   PUT /api/municipalities/:municipalityId/properties/:propertyId/owners/:propertyOwnerId
// @desc    Update a property-owner relationship
// @access  Private
router.put(
  '/municipalities/:municipalityId/properties/:propertyId/owners/:propertyOwnerId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, propertyId, propertyOwnerId } = req.params;

      // Check if user has permission to modify property owners
      const hasPermission =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasModulePermission(municipalityId, 'assessing', 'update');

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions to modify property owners',
        });
      }

      const propertyOwner = await PropertyOwner.findOne({
        _id: propertyOwnerId,
        municipality_id: municipalityId,
        property_id: propertyId,
      });

      if (!propertyOwner) {
        return res.status(404).json({
          error: 'Property owner relationship not found',
        });
      }

      const updateData = {
        ...req.body,
        updated_by: req.user._id,
      };

      // Remove fields that shouldn't be updated directly
      delete updateData.municipality_id;
      delete updateData.property_id;
      delete updateData.owner_id;
      delete updateData.created_by;
      delete updateData.createdAt;

      Object.assign(propertyOwner, updateData);

      // Handle primary owner logic if being set as primary
      if (req.body.is_primary) {
        await propertyOwner.setPrimary();
      } else {
        await propertyOwner.save();
      }

      await propertyOwner.populate('owner_id');

      res.json({ propertyOwner });
    } catch (error) {
      console.error('Error updating property owner:', error);

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation failed',
          details: Object.values(error.errors).map((err) => err.message),
        });
      }

      res.status(500).json({
        error: 'Failed to update property owner',
        details: error.message,
      });
    }
  },
);

// @route   DELETE /api/municipalities/:municipalityId/properties/:propertyId/owners/:propertyOwnerId
// @desc    Remove an owner from a property
// @access  Private
router.delete(
  '/municipalities/:municipalityId/properties/:propertyId/owners/:propertyOwnerId',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, propertyId, propertyOwnerId } = req.params;

      // Check if user has permission to modify property owners
      const hasPermission =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasModulePermission(municipalityId, 'assessing', 'delete');

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions to remove property owners',
        });
      }

      const propertyOwner = await PropertyOwner.findOne({
        _id: propertyOwnerId,
        municipality_id: municipalityId,
        property_id: propertyId,
      });

      if (!propertyOwner) {
        return res.status(404).json({
          error: 'Property owner relationship not found',
        });
      }

      // Soft delete by setting is_active to false
      propertyOwner.is_active = false;
      propertyOwner.updated_by = req.user._id;
      await propertyOwner.save();

      res.json({
        message: 'Property owner relationship successfully removed',
        propertyOwner,
      });
    } catch (error) {
      console.error('Error removing property owner:', error);
      res.status(500).json({
        error: 'Failed to remove property owner',
        details: error.message,
      });
    }
  },
);

// @route   GET /api/municipalities/:municipalityId/owners/:ownerId/properties
// @desc    Get all properties for a specific owner
// @access  Private
router.get(
  '/municipalities/:municipalityId/owners/:ownerId/properties',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId, ownerId } = req.params;

      // Check if user has access to this municipality
      const hasAccess =
        ['avitar_staff', 'avitar_admin'].includes(req.user.global_role) ||
        req.user.hasAccessToMunicipality(municipalityId);

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied to this municipality',
        });
      }

      const ownerProperties = await PropertyOwner.find({
        municipality_id: municipalityId,
        owner_id: ownerId,
        is_active: true,
      })
        .populate('property_id')
        .sort({ ownership_start_date: -1 });

      res.json({
        ownerProperties,
        summary: {
          totalProperties: ownerProperties.length,
          primaryProperties: ownerProperties.filter((op) => op.is_primary)
            .length,
          totalOwnership: ownerProperties.reduce(
            (sum, op) => sum + op.ownership_percentage,
            0,
          ),
        },
      });
    } catch (error) {
      console.error('Error fetching owner properties:', error);
      res.status(500).json({
        error: 'Failed to fetch owner properties',
        details: error.message,
      });
    }
  },
);

module.exports = router;
