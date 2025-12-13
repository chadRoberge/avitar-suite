const express = require('express');
const router = express.Router();
const Municipality = require('../models/Municipality');
const stripeService = require('../services/stripeService');
const stripeWebhookHandler = require('../services/stripeWebhookHandler');

/**
 * Stripe Webhook Handler
 *
 * This endpoint receives webhook events from Stripe.
 * IMPORTANT: This route must use express.raw() middleware (not express.json())
 * for webhook signature verification to work correctly.
 *
 * Events handled:
 * - account.updated: Updates municipality Connected Account status
 * - invoice.payment_succeeded: (future) Log successful payments
 * - invoice.payment_failed: (future) Handle failed payments
 */

/**
 * @route   POST /api/webhooks/stripe
 * @desc    Handle Stripe webhook events
 * @access  Public (but verified with Stripe signature)
 */
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // Verify webhook signature
    // Note: constructWebhookEvent automatically selects the correct webhook secret based on NODE_ENV
    event = stripeService.constructWebhookEvent(req.body, sig);

    console.log('🔵 [WEBHOOK] Received Stripe event:', {
      type: event.type,
      id: event.id,
      created: new Date(event.created * 1000).toISOString(),
    });
  } catch (err) {
    console.error('❌ [WEBHOOK] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      // Connected Account events
      case 'account.updated':
        await handleAccountUpdated(event.data.object);
        break;

      case 'account.application.authorized':
        console.log(
          '🔵 [WEBHOOK] Account application authorized:',
          event.data.object.id,
        );
        // Could log or notify here if needed
        break;

      case 'account.application.deauthorized':
        console.log(
          '🔵 [WEBHOOK] Account application deauthorized:',
          event.data.object.id,
        );
        // Handle account disconnection if needed
        break;

      // Subscription lifecycle events (handled by stripeWebhookHandler)
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
      case 'product.updated':
      case 'customer.updated':
        await stripeWebhookHandler.handleEvent(event);
        break;

      // Payment events (informational logging)
      case 'invoice.payment_succeeded':
        console.log(
          '🔵 [WEBHOOK] Invoice payment succeeded:',
          event.data.object.id,
        );
        // Future: Log successful payments
        break;

      case 'invoice.payment_failed':
        console.log(
          '🔵 [WEBHOOK] Invoice payment failed:',
          event.data.object.id,
        );
        // Future: Handle failed payments
        break;

      case 'payment_intent.succeeded':
        console.log(
          '🔵 [WEBHOOK] Payment intent succeeded:',
          event.data.object.id,
        );
        break;

      case 'payment_intent.payment_failed':
        console.log(
          '🔵 [WEBHOOK] Payment intent failed:',
          event.data.object.id,
        );
        break;

      default:
        console.log(`ℹ️  [WEBHOOK] Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    console.error('❌ [WEBHOOK] Error processing event:', error);
    res.status(500).json({
      error: 'Webhook handler failed',
      message: error.message,
    });
  }
});

/**
 * Handle account.updated event from Stripe
 * This is triggered when a Connected Account's status changes
 */
async function handleAccountUpdated(account) {
  try {
    console.log('🔵 [WEBHOOK] Processing account.updated:', {
      account_id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    });

    // Find municipality with this Stripe account ID
    const municipality = await Municipality.findOne({
      stripe_account_id: account.id,
    });

    if (!municipality) {
      console.warn(
        '⚠️  [WEBHOOK] No municipality found for account:',
        account.id,
      );
      return;
    }

    console.log('🔵 [WEBHOOK] Found municipality:', {
      id: municipality._id,
      name: municipality.name,
      current_status: municipality.stripe_account_status,
    });

    // Update municipality with latest account status
    municipality.stripe_charges_enabled = account.charges_enabled;
    municipality.stripe_payouts_enabled = account.payouts_enabled;
    municipality.stripe_onboarding_completed = account.details_submitted;

    // Determine account status
    if (account.charges_enabled && account.payouts_enabled) {
      municipality.stripe_account_status = 'active';

      // Set onboarding completed date if not already set
      if (!municipality.stripe_onboarding_completed_date) {
        municipality.stripe_onboarding_completed_date = new Date();
        console.log('🎉 [WEBHOOK] Municipality onboarding completed!');
      }
    } else if (account.details_submitted) {
      // Details submitted but not fully active yet
      municipality.stripe_account_status = 'restricted';
    } else {
      // Still in onboarding
      municipality.stripe_account_status = 'onboarding';
    }

    // Check if account is disabled
    if (account.disabled_reason) {
      municipality.stripe_account_status = 'disabled';
      console.warn('⚠️  [WEBHOOK] Account disabled:', account.disabled_reason);
    }

    await municipality.save();

    console.log('🟢 [WEBHOOK] Municipality updated successfully:', {
      id: municipality._id,
      name: municipality.name,
      new_status: municipality.stripe_account_status,
      charges_enabled: municipality.stripe_charges_enabled,
      payouts_enabled: municipality.stripe_payouts_enabled,
    });
  } catch (error) {
    console.error('❌ [WEBHOOK] Error handling account.updated:', error);
    throw error;
  }
}

/**
 * Test endpoint to verify webhook setup (only in development)
 */
if (process.env.NODE_ENV !== 'production') {
  router.get('/test', (req, res) => {
    res.json({
      message: 'Webhook endpoint is active',
      environment: process.env.NODE_ENV,
      webhook_secret_configured: !!process.env.STRIPE_WEBHOOK_SECRET,
    });
  });
}

module.exports = router;
