const express = require('express');
const Municipality = require('../models/Municipality');
const { authenticateToken } = require('../middleware/auth');
const stripeService = require('../services/stripeService');

const router = express.Router();

/**
 * Helper function to check if user has permission for municipality
 */
function checkMunicipalityPermission(req, municipalityId) {
  // Check if user has permission to manage this municipality
  const userPerm = req.user.municipal_permissions?.find(
    (perm) => perm.municipality_id.toString() === municipalityId,
  );

  // Allow if user is Avitar staff/admin OR is a municipal admin
  const isAvitarStaff = ['avitar_admin', 'avitar_staff'].includes(req.user.global_role);
  const isMunicipalAdmin = userPerm && userPerm.role === 'admin';

  return {
    hasPermission: isAvitarStaff || isMunicipalAdmin,
    isAvitarStaff,
    isMunicipalAdmin,
  };
}

/**
 * @route   POST /api/municipalities/:id/stripe-connect/onboarding
 * @desc    Start Stripe Connect onboarding for a municipality
 * @access  Private (municipal admin or Avitar staff)
 */
router.post('/:id/stripe-connect/onboarding', authenticateToken, async (req, res) => {
  try {
    const { id: municipalityId } = req.params;

    // Check permissions
    const { hasPermission } = checkMunicipalityPermission(req, municipalityId);

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage payment setup for this municipality',
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

    // Check if already has a Connected Account
    if (municipality.stripe_account_id) {
      // Account exists - check if onboarding is complete
      if (municipality.stripe_onboarding_completed) {
        return res.status(400).json({
          success: false,
          message: 'Stripe Connect account already set up for this municipality',
          account: {
            stripe_account_id: municipality.stripe_account_id,
            status: municipality.stripe_account_status,
            charges_enabled: municipality.stripe_charges_enabled,
            payouts_enabled: municipality.stripe_payouts_enabled,
          },
        });
      }

      // Account exists but onboarding incomplete - generate new link
      console.log('🔵 Generating new onboarding link for existing account:', municipality.stripe_account_id);
    } else {
      // Create new Connected Account
      console.log('🔵 Creating new Stripe Connected Account for:', municipality.name);

      const account = await stripeService.createStandardConnectedAccount(municipality);

      // Save account ID to municipality
      municipality.stripe_account_id = account.id;
      municipality.stripe_account_type = 'standard';
      municipality.stripe_account_status = 'onboarding';
      municipality.stripe_onboarding_started = new Date();
      await municipality.save();

      console.log('🟢 Saved account ID to municipality:', account.id);
    }

    // Generate Account Link
    const refreshUrl = `${req.protocol}://${req.get('host')}/m/${municipality.slug}/settings/payment-setup?refresh=true`;
    const returnUrl = `${req.protocol}://${req.get('host')}/m/${municipality.slug}/settings/payment-setup?success=true`;

    const accountLink = await stripeService.createAccountLink(
      municipality.stripe_account_id,
      refreshUrl,
      returnUrl,
    );

    // Save link expiration time
    municipality.stripe_account_link_expires = new Date(accountLink.expires_at * 1000);
    await municipality.save();

    res.json({
      success: true,
      message: 'Stripe Connect onboarding link generated',
      onboarding_url: accountLink.url,
      expires_at: accountLink.expires_at,
      account_id: municipality.stripe_account_id,
    });
  } catch (error) {
    console.error('❌ Error starting Stripe Connect onboarding:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start Stripe Connect onboarding',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/municipalities/:id/stripe-connect/status
 * @desc    Get Stripe Connect account status for a municipality
 * @access  Private (municipal admin or Avitar staff)
 */
router.get('/:id/stripe-connect/status', authenticateToken, async (req, res) => {
  try {
    const { id: municipalityId } = req.params;

    // Check permissions
    const { hasPermission } = checkMunicipalityPermission(req, municipalityId);

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view payment setup for this municipality',
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

    // If no Stripe account, return pending status
    if (!municipality.stripe_account_id) {
      return res.json({
        success: true,
        status: 'not_started',
        account: {
          stripe_account_id: null,
          stripe_account_status: 'pending',
          stripe_onboarding_completed: false,
          stripe_charges_enabled: false,
          stripe_payouts_enabled: false,
          is_payment_setup_complete: false,
        },
      });
    }

    // Fetch latest account status from Stripe
    console.log('🔵 Fetching account status from Stripe:', municipality.stripe_account_id);

    const accountStatus = await stripeService.getAccountStatus(municipality.stripe_account_id);

    // Update municipality with latest status
    municipality.stripe_charges_enabled = accountStatus.charges_enabled;
    municipality.stripe_payouts_enabled = accountStatus.payouts_enabled;
    municipality.stripe_onboarding_completed = accountStatus.details_submitted;

    // Determine account status
    if (accountStatus.charges_enabled && accountStatus.payouts_enabled) {
      municipality.stripe_account_status = 'active';
      if (!municipality.stripe_onboarding_completed_date) {
        municipality.stripe_onboarding_completed_date = new Date();
      }
    } else if (accountStatus.details_submitted) {
      municipality.stripe_account_status = 'restricted';
    } else {
      municipality.stripe_account_status = 'onboarding';
    }

    await municipality.save();

    console.log('🟢 Account status updated:', {
      status: municipality.stripe_account_status,
      charges_enabled: municipality.stripe_charges_enabled,
      payouts_enabled: municipality.stripe_payouts_enabled,
    });

    res.json({
      success: true,
      status: municipality.stripe_account_status,
      account: {
        stripe_account_id: municipality.stripe_account_id,
        stripe_account_status: municipality.stripe_account_status,
        stripe_onboarding_completed: municipality.stripe_onboarding_completed,
        stripe_charges_enabled: municipality.stripe_charges_enabled,
        stripe_payouts_enabled: municipality.stripe_payouts_enabled,
        stripe_account_link_expires: municipality.stripe_account_link_expires,
        stripe_onboarding_started: municipality.stripe_onboarding_started,
        stripe_onboarding_completed_date: municipality.stripe_onboarding_completed_date,
        is_payment_setup_complete: municipality.isPaymentSetupComplete,
      },
      requirements: accountStatus.requirements,
    });
  } catch (error) {
    console.error('❌ Error fetching Stripe Connect status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Stripe Connect status',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/municipalities/:id/stripe-connect/refresh-link
 * @desc    Refresh expired Stripe Connect onboarding link
 * @access  Private (municipal admin or Avitar staff)
 */
router.post('/:id/stripe-connect/refresh-link', authenticateToken, async (req, res) => {
  try {
    const { id: municipalityId } = req.params;

    // Check permissions
    const { hasPermission } = checkMunicipalityPermission(req, municipalityId);

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage payment setup for this municipality',
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

    // Check if Stripe account exists
    if (!municipality.stripe_account_id) {
      return res.status(400).json({
        success: false,
        message: 'No Stripe Connect account found for this municipality',
      });
    }

    // Check if onboarding already complete
    if (municipality.stripe_onboarding_completed && municipality.stripe_account_status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Stripe Connect onboarding already completed',
      });
    }

    // Generate new Account Link
    console.log('🔵 Refreshing onboarding link for:', municipality.stripe_account_id);

    const refreshUrl = `${req.protocol}://${req.get('host')}/m/${municipality.slug}/settings/payment-setup?refresh=true`;
    const returnUrl = `${req.protocol}://${req.get('host')}/m/${municipality.slug}/settings/payment-setup?success=true`;

    const accountLink = await stripeService.refreshAccountLink(
      municipality.stripe_account_id,
      refreshUrl,
      returnUrl,
    );

    // Save link expiration time
    municipality.stripe_account_link_expires = new Date(accountLink.expires_at * 1000);
    await municipality.save();

    console.log('🟢 Onboarding link refreshed');

    res.json({
      success: true,
      message: 'Stripe Connect onboarding link refreshed',
      onboarding_url: accountLink.url,
      expires_at: accountLink.expires_at,
      account_id: municipality.stripe_account_id,
    });
  } catch (error) {
    console.error('❌ Error refreshing Stripe Connect link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh Stripe Connect link',
      error: error.message,
    });
  }
});

module.exports = router;
