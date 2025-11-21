const express = require('express');
const router = express.Router();
const ContractorVerification = require('../models/ContractorVerification');
const Contractor = require('../models/Contractor');
const File = require('../models/File');
const { authenticateToken } = require('../middleware/auth');

// Get contractor's verification status
router.get('/my-verification', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Only contractors can access this
    if (user.global_role !== 'contractor') {
      return res.status(403).json({ error: 'Only contractors can access verification status' });
    }

    if (!user.contractor_id) {
      return res.status(404).json({ error: 'No contractor profile found for this user' });
    }

    const verification = await ContractorVerification.findOne({
      contractor_id: user.contractor_id,
    })
      .populate('licenses.file_id', 'displayName originalName mimeType uploadedAt')
      .populate('drivers_license.file_id', 'displayName originalName mimeType uploadedAt')
      .populate('insurance.file_id', 'displayName originalName mimeType uploadedAt')
      .populate('reviewed_by', 'first_name last_name email');

    if (!verification) {
      // No verification exists yet - return null to indicate they should create one
      return res.json({ verification: null });
    }

    res.json({ verification });
  } catch (error) {
    console.error('Error fetching verification:', error);
    res.status(500).json({ error: 'Failed to fetch verification status' });
  }
});

// Create or update verification application (draft)
router.post('/my-verification', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.global_role !== 'contractor') {
      return res.status(403).json({ error: 'Only contractors can create verification applications' });
    }

    if (!user.contractor_id) {
      return res.status(404).json({ error: 'No contractor profile found' });
    }

    const { licenses, drivers_license, insurance } = req.body;

    // Find existing verification or create new one
    let verification = await ContractorVerification.findOne({
      contractor_id: user.contractor_id,
    });

    if (verification) {
      // Can only update if in draft or rejected status
      if (!['draft', 'rejected'].includes(verification.status)) {
        return res.status(400).json({
          error: `Cannot update verification in ${verification.status} status`,
        });
      }

      // Update fields
      if (licenses) verification.licenses = licenses;
      if (drivers_license) verification.drivers_license = drivers_license;
      if (insurance) verification.insurance = insurance;
    } else {
      // Create new verification
      verification = new ContractorVerification({
        contractor_id: user.contractor_id,
        user_id: user._id,
        licenses: licenses || [],
        drivers_license: drivers_license || {},
        insurance: insurance || {},
        status: 'draft',
      });
    }

    await verification.save();

    // Populate file references
    await verification.populate([
      { path: 'licenses.file_id', select: 'displayName originalName mimeType uploadedAt' },
      { path: 'drivers_license.file_id', select: 'displayName originalName mimeType uploadedAt' },
      { path: 'insurance.file_id', select: 'displayName originalName mimeType uploadedAt' },
    ]);

    res.json({ verification });
  } catch (error) {
    console.error('Error saving verification:', error);
    res.status(500).json({ error: 'Failed to save verification', details: error.message });
  }
});

// Submit verification for review
router.post('/my-verification/submit', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.global_role !== 'contractor') {
      return res.status(403).json({ error: 'Only contractors can submit verification' });
    }

    const verification = await ContractorVerification.findOne({
      contractor_id: user.contractor_id,
    });

    if (!verification) {
      return res.status(404).json({ error: 'No verification application found' });
    }

    if (!['draft', 'rejected'].includes(verification.status)) {
      return res.status(400).json({
        error: `Cannot submit verification in ${verification.status} status`,
      });
    }

    // Submit the verification (will validate required fields)
    await verification.submit();

    // Populate file references
    await verification.populate([
      { path: 'licenses.file_id', select: 'displayName originalName mimeType uploadedAt' },
      { path: 'drivers_license.file_id', select: 'displayName originalName mimeType uploadedAt' },
      { path: 'insurance.file_id', select: 'displayName originalName mimeType uploadedAt' },
    ]);

    res.json({ verification, message: 'Verification submitted successfully' });
  } catch (error) {
    console.error('Error submitting verification:', error);
    res.status(400).json({ error: error.message });
  }
});

// Admin: Get all verification applications
router.get('/admin/verifications', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Only Avitar admins can review verifications
    if (user.global_role !== 'avitar_admin') {
      return res.status(403).json({ error: 'Only Avitar administrators can review verifications' });
    }

    const { status, limit = 50, offset = 0 } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const verifications = await ContractorVerification.find(query)
      .populate('contractor_id', 'company_name business_type')
      .populate('user_id', 'first_name last_name email')
      .populate('reviewed_by', 'first_name last_name')
      .sort({ submitted_at: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await ContractorVerification.countDocuments(query);

    res.json({
      verifications,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + verifications.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching verifications:', error);
    res.status(500).json({ error: 'Failed to fetch verifications' });
  }
});

// Admin: Get single verification for review
router.get('/admin/verifications/:id', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.global_role !== 'avitar_admin') {
      return res.status(403).json({ error: 'Only Avitar administrators can review verifications' });
    }

    const verification = await ContractorVerification.findById(req.params.id)
      .populate('contractor_id')
      .populate('user_id', 'first_name last_name email phone')
      .populate('licenses.file_id')
      .populate('drivers_license.file_id')
      .populate('insurance.file_id')
      .populate('reviewed_by', 'first_name last_name email');

    if (!verification) {
      return res.status(404).json({ error: 'Verification not found' });
    }

    res.json({ verification });
  } catch (error) {
    console.error('Error fetching verification:', error);
    res.status(500).json({ error: 'Failed to fetch verification' });
  }
});

// Admin: Approve verification
router.post('/admin/verifications/:id/approve', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.global_role !== 'avitar_admin') {
      return res.status(403).json({ error: 'Only Avitar administrators can approve verifications' });
    }

    const { notes } = req.body;

    const verification = await ContractorVerification.findById(req.params.id);

    if (!verification) {
      return res.status(404).json({ error: 'Verification not found' });
    }

    if (verification.status !== 'submitted' && verification.status !== 'under_review') {
      return res.status(400).json({
        error: `Cannot approve verification in ${verification.status} status`,
      });
    }

    await verification.approve(user._id, notes);

    await verification.populate([
      { path: 'contractor_id', select: 'company_name business_type' },
      { path: 'user_id', select: 'first_name last_name email' },
      { path: 'reviewed_by', select: 'first_name last_name' },
    ]);

    res.json({ verification, message: 'Verification approved successfully' });
  } catch (error) {
    console.error('Error approving verification:', error);
    res.status(500).json({ error: 'Failed to approve verification' });
  }
});

// Admin: Reject verification
router.post('/admin/verifications/:id/reject', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.global_role !== 'avitar_admin') {
      return res.status(403).json({ error: 'Only Avitar administrators can reject verifications' });
    }

    const { reason, details } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const verification = await ContractorVerification.findById(req.params.id);

    if (!verification) {
      return res.status(404).json({ error: 'Verification not found' });
    }

    if (verification.status !== 'submitted' && verification.status !== 'under_review') {
      return res.status(400).json({
        error: `Cannot reject verification in ${verification.status} status`,
      });
    }

    await verification.reject(user._id, reason, details);

    await verification.populate([
      { path: 'contractor_id', select: 'company_name business_type' },
      { path: 'user_id', select: 'first_name last_name email' },
      { path: 'reviewed_by', select: 'first_name last_name' },
    ]);

    res.json({ verification, message: 'Verification rejected' });
  } catch (error) {
    console.error('Error rejecting verification:', error);
    res.status(500).json({ error: 'Failed to reject verification' });
  }
});

// Check if contractor is verified (public endpoint for municipalities)
router.get('/check/:contractorId', authenticateToken, async (req, res) => {
  try {
    const isVerified = await ContractorVerification.isContractorVerified(
      req.params.contractorId
    );

    res.json({ isVerified });
  } catch (error) {
    console.error('Error checking verification:', error);
    res.status(500).json({ error: 'Failed to check verification status' });
  }
});

module.exports = router;
