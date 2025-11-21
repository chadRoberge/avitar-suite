const express = require('express');
const router = express.Router();
const Contractor = require('../models/Contractor');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

/**
 * Middleware to check if user is contractor owner or has manage_team permission
 */
const checkContractorManagePermission = async (req, res, next) => {
  const { contractorId } = req.params;

  try {
    const contractor = await Contractor.findById(contractorId);
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    // Avitar staff can manage any contractor
    if (
      req.user.global_role === 'avitar_staff' ||
      req.user.global_role === 'avitar_admin'
    ) {
      req.contractor = contractor;
      return next();
    }

    // Check if user is owner or has manage_team permission
    if (
      contractor.isOwner(req.user._id) ||
      contractor.userHasPermission(req.user._id, 'manage_team')
    ) {
      req.contractor = contractor;
      return next();
    }

    return res
      .status(403)
      .json({ error: 'You do not have permission to manage this contractor' });
  } catch (error) {
    console.error('Error checking contractor permissions:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Middleware to check if user has access to view contractor
 */
const checkContractorViewPermission = async (req, res, next) => {
  const { contractorId } = req.params;

  try {
    const contractor = await Contractor.findById(contractorId);
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    // Avitar staff can view any contractor
    if (
      req.user.global_role === 'avitar_staff' ||
      req.user.global_role === 'avitar_admin'
    ) {
      req.contractor = contractor;
      return next();
    }

    // Check if user is a member of this contractor
    if (contractor.isMember(req.user._id) || contractor.isOwner(req.user._id)) {
      req.contractor = contractor;
      return next();
    }

    return res
      .status(403)
      .json({ error: 'You do not have access to this contractor' });
  } catch (error) {
    console.error('Error checking contractor permissions:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// =====================================================
// PUBLIC ROUTES (for municipalities to search contractors)
// =====================================================

/**
 * GET /contractors/search
 * Search contractors by municipality (for permit application)
 */
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { municipalityId, search, verified_only } = req.query;

    if (!municipalityId) {
      return res.status(400).json({ error: 'Municipality ID is required' });
    }

    const query = {
      is_active: true,
      'municipality_approvals.municipality_id': municipalityId,
    };

    if (verified_only === 'true') {
      query.is_verified = true;
      query['municipality_approvals.status'] = 'approved';
    }

    let contractors = await Contractor.find(query)
      .populate('owner_user_id', 'first_name last_name email phone')
      .select(
        'company_name license_number license_state license_expiration specialties business_info is_verified municipality_approvals'
      )
      .sort({ company_name: 1 })
      .limit(100);

    // Filter to only show the specific municipality approval
    contractors = contractors.map((contractor) => {
      const contractorObj = contractor.toObject();
      contractorObj.municipality_approval = contractorObj.municipality_approvals.find(
        (a) => a.municipality_id.toString() === municipalityId
      );
      delete contractorObj.municipality_approvals;
      return contractorObj;
    });

    // If search term provided, filter results
    if (search) {
      const searchLower = search.toLowerCase();
      contractors = contractors.filter(
        (c) =>
          c.company_name?.toLowerCase().includes(searchLower) ||
          c.license_number?.toLowerCase().includes(searchLower)
      );
    }

    res.json({ contractors });
  } catch (error) {
    console.error('Error searching contractors:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================================================
// CONTRACTOR CRUD ROUTES
// =====================================================

/**
 * POST /contractors
 * Create a new contractor (for new contractor registration)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      company_name,
      license_number,
      license_state,
      license_expiration,
      license_type,
      business_info,
      specialties,
      insurance_info,
    } = req.body;

    // Validation
    if (!company_name || !license_number || !license_state || !license_expiration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if license already exists
    const existing = await Contractor.findOne({ license_number, license_state });
    if (existing) {
      return res
        .status(400)
        .json({ error: 'A contractor with this license number already exists' });
    }

    // Create contractor
    const contractor = new Contractor({
      company_name,
      license_number,
      license_state,
      license_expiration,
      license_type: license_type || 'general_contractor',
      business_info: business_info || {},
      specialties: specialties || [],
      insurance_info: insurance_info || {},
      owner_user_id: req.user._id,
      members: [
        {
          user_id: req.user._id,
          role: 'owner',
          permissions: [
            'manage_team',
            'submit_permits',
            'edit_permits',
            'view_all_permits',
            'manage_company_info',
          ],
          title: 'Owner',
          added_by: req.user._id,
        },
      ],
      created_by: req.user._id,
      is_active: true,
      is_verified: false,
    });

    await contractor.save();

    // Update user to link to contractor
    await User.findByIdAndUpdate(req.user._id, {
      global_role: 'contractor',
      contractor_id: contractor._id,
    });

    res.status(201).json({ contractor });
  } catch (error) {
    console.error('Error creating contractor:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * GET /contractors/:contractorId
 * Get contractor details
 */
router.get(
  '/:contractorId',
  authenticateToken,
  checkContractorViewPermission,
  async (req, res) => {
    try {
      const contractor = await Contractor.findById(req.params.contractorId)
        .populate('owner_user_id', 'first_name last_name email phone')
        .populate('members.user_id', 'first_name last_name email')
        .populate('members.added_by', 'first_name last_name')
        .populate('created_by', 'first_name last_name')
        .populate('updated_by', 'first_name last_name');

      res.json({ contractor });
    } catch (error) {
      console.error('Error fetching contractor:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * PUT /contractors/:contractorId
 * Update contractor information
 */
router.put(
  '/:contractorId',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      const {
        company_name,
        license_number,
        license_state,
        license_expiration,
        license_type,
        business_info,
        specialties,
        insurance_info,
        years_in_business,
        employee_count,
        bonded,
      } = req.body;

      const updates = {};

      if (company_name) updates.company_name = company_name;
      if (license_number) updates.license_number = license_number;
      if (license_state) updates.license_state = license_state;
      if (license_expiration) updates.license_expiration = license_expiration;
      if (license_type) updates.license_type = license_type;
      if (business_info) updates.business_info = business_info;
      if (specialties) updates.specialties = specialties;
      if (insurance_info) updates.insurance_info = insurance_info;
      if (years_in_business !== undefined) updates.years_in_business = years_in_business;
      if (employee_count !== undefined) updates.employee_count = employee_count;
      if (bonded !== undefined) updates.bonded = bonded;

      updates.updated_by = req.user._id;

      const contractor = await Contractor.findByIdAndUpdate(
        req.params.contractorId,
        updates,
        { new: true, runValidators: true }
      )
        .populate('owner_user_id', 'first_name last_name email phone')
        .populate('members.user_id', 'first_name last_name email');

      res.json({ contractor });
    } catch (error) {
      console.error('Error updating contractor:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  }
);

/**
 * DELETE /contractors/:contractorId
 * Deactivate contractor
 */
router.delete(
  '/:contractorId',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      // Only owner or Avitar staff can delete
      if (
        !req.contractor.isOwner(req.user._id) &&
        req.user.global_role !== 'avitar_staff' &&
        req.user.global_role !== 'avitar_admin'
      ) {
        return res
          .status(403)
          .json({ error: 'Only the contractor owner can deactivate the company' });
      }

      await Contractor.findByIdAndUpdate(req.params.contractorId, {
        is_active: false,
        updated_by: req.user._id,
      });

      res.json({ message: 'Contractor deactivated successfully' });
    } catch (error) {
      console.error('Error deactivating contractor:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// =====================================================
// TEAM MEMBER MANAGEMENT
// =====================================================

/**
 * POST /contractors/:contractorId/members
 * Add team member to contractor
 */
router.post(
  '/:contractorId/members',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      const { email, role, permissions, title } = req.body;

      if (!email || !role) {
        return res.status(400).json({ error: 'Email and role are required' });
      }

      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res
          .status(404)
          .json({ error: 'User not found. They must register first.' });
      }

      // Check if already a member
      if (req.contractor.isMember(user._id)) {
        return res.status(400).json({ error: 'User is already a team member' });
      }

      await req.contractor.addMember(
        user._id,
        role,
        permissions || [],
        req.user._id,
        title
      );

      // Update user's contractor_id and global_role if not already set
      if (!user.contractor_id) {
        user.contractor_id = req.contractor._id;
        user.global_role = 'contractor';
        await user.save();
      }

      const updatedContractor = await Contractor.findById(req.params.contractorId)
        .populate('members.user_id', 'first_name last_name email')
        .populate('members.added_by', 'first_name last_name');

      res.json({ contractor: updatedContractor });
    } catch (error) {
      console.error('Error adding team member:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  }
);

/**
 * PUT /contractors/:contractorId/members/:userId
 * Update team member permissions/role
 */
router.put(
  '/:contractorId/members/:userId',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      const { role, permissions, title } = req.body;

      const member = req.contractor.members.find(
        (m) => m.user_id.toString() === req.params.userId
      );

      if (!member) {
        return res.status(404).json({ error: 'Team member not found' });
      }

      // Cannot change owner role
      if (member.role === 'owner') {
        return res.status(400).json({ error: 'Cannot modify owner role' });
      }

      if (role) member.role = role;
      if (permissions) member.permissions = permissions;
      if (title !== undefined) member.title = title;

      await req.contractor.save();

      const updatedContractor = await Contractor.findById(req.params.contractorId)
        .populate('members.user_id', 'first_name last_name email')
        .populate('members.added_by', 'first_name last_name');

      res.json({ contractor: updatedContractor });
    } catch (error) {
      console.error('Error updating team member:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  }
);

/**
 * DELETE /contractors/:contractorId/members/:userId
 * Remove team member from contractor
 */
router.delete(
  '/:contractorId/members/:userId',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      // Cannot remove owner
      if (req.contractor.isOwner(req.params.userId)) {
        return res.status(400).json({ error: 'Cannot remove contractor owner' });
      }

      await req.contractor.removeMember(req.params.userId);

      // Update user to remove contractor_id
      await User.findByIdAndUpdate(req.params.userId, {
        contractor_id: null,
        global_role: 'citizen',
      });

      res.json({ message: 'Team member removed successfully' });
    } catch (error) {
      console.error('Error removing team member:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// =====================================================
// MUNICIPALITY APPROVALS
// =====================================================

/**
 * POST /contractors/:contractorId/municipality-approvals
 * Request approval from municipality (or approve if staff)
 */
router.post(
  '/:contractorId/municipality-approvals',
  authenticateToken,
  checkContractorViewPermission,
  async (req, res) => {
    try {
      const { municipalityId, municipalityName, registrationNumber } = req.body;

      if (!municipalityId || !municipalityName) {
        return res
          .status(400)
          .json({ error: 'Municipality ID and name are required' });
      }

      // Check if user is municipal staff for this municipality (they can approve)
      const isMunicipalStaff =
        req.user.hasAccessToMunicipality(municipalityId) &&
        (req.user.global_role === 'municipal_user' ||
          req.user.global_role === 'avitar_staff' ||
          req.user.global_role === 'avitar_admin');

      const approvedBy = isMunicipalStaff ? req.user._id : null;

      await req.contractor.addMunicipalityApproval(
        municipalityId,
        municipalityName,
        approvedBy,
        registrationNumber
      );

      res.json({
        message: isMunicipalStaff
          ? 'Contractor approved for municipality'
          : 'Approval request submitted',
      });
    } catch (error) {
      console.error('Error managing municipality approval:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  }
);

module.exports = router;
