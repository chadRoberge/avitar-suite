const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Contractor = require('../models/Contractor');
const Citizen = require('../models/Citizen');
const {
  getAllPlans,
  getPlan,
  getUpgradeBenefits,
} = require('../config/subscriptionPlans');
const stripeService = require('../services/stripeService');

/**
 * GET /subscriptions/plans
 * Get all available subscription plans
 */
router.get('/plans', authenticateToken, async (req, res) => {
  try {
    const plans = getAllPlans();

    res.json({
      success: true,
      plans,
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans',
      error: error.message,
    });
  }
});

/**
 * GET /subscriptions/my-subscription
 * Get current user's subscription details (contractor or citizen)
 */
router.get('/my-subscription', authenticateToken, async (req, res) => {
  try {
    let subscription = null;
    let entityType = null;

    // Check if user is a contractor
    if (req.user.contractor_id) {
      const contractor = await Contractor.findById(req.user.contractor_id);
      if (contractor) {
        subscription = contractor.subscription;
        entityType = 'contractor';
      }
    }
    // Check if user is a citizen
    else if (req.user.citizen_id) {
      const citizen = await Citizen.findById(req.user.citizen_id);
      if (citizen) {
        subscription = citizen.subscription;
        entityType = 'citizen';
      }
    }

    // If no subscription found, return a default free plan response
    if (!subscription) {
      const freePlan = getPlan('free');
      return res.json({
        success: true,
        subscription: {
          plan: 'free',
          status: 'active',
          plan_details: freePlan,
        },
        stripe_subscription: null,
        stripe_customer: null,
        upcoming_invoice: null,
        entity_type: entityType || 'unknown',
      });
    }

    // Get Stripe subscription details if exists
    let stripeSubscription = null;
    let stripeCustomer = null;
    let upcomingInvoice = null;

    if (subscription?.stripe_subscription_id) {
      try {
        stripeSubscription = await stripeService.getSubscription(
          subscription.stripe_subscription_id,
        );
      } catch (error) {
        console.warn('Could not fetch Stripe subscription:', error.message);
      }
    }

    if (subscription?.stripe_customer_id) {
      try {
        stripeCustomer = await stripeService.getCustomer(
          subscription.stripe_customer_id,
        );
      } catch (error) {
        console.warn('Could not fetch Stripe customer:', error.message);
      }
    }

    // Get current plan details
    const currentPlan = getPlan(subscription?.plan || 'free');

    res.json({
      success: true,
      subscription: {
        ...(subscription?.toObject ? subscription.toObject() : subscription),
        plan_details: currentPlan,
      },
      stripe_subscription: stripeSubscription,
      stripe_customer: stripeCustomer,
      upcoming_invoice: upcomingInvoice,
      entity_type: entityType,
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription',
      error: error.message,
    });
  }
});

/**
 * POST /subscriptions/create-setup-intent
 * Create a Stripe Setup Intent for adding payment methods
 * Supports both contractors and citizens
 */
router.post('/create-setup-intent', authenticateToken, async (req, res) => {
  try {
    // Find entity - contractor or citizen
    let entity = null;
    let entityType = null;

    if (req.user.contractor_id) {
      entity = await Contractor.findById(req.user.contractor_id);
      entityType = 'contractor';
    } else if (req.user.citizen_id) {
      entity = await Citizen.findById(req.user.citizen_id);
      entityType = 'citizen';
    }

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    // Create Stripe customer if doesn't exist
    if (!entity.subscription?.stripe_customer_id) {
      const customer = await stripeService.createCustomer(entity, req.user);

      entity.subscription = entity.subscription || {};
      entity.subscription.stripe_customer_id = customer.id;
      await entity.save();
    }

    // Create setup intent
    const setupIntent = await stripeService.createSetupIntent(
      entity.subscription.stripe_customer_id,
    );

    res.json({
      success: true,
      client_secret: setupIntent.client_secret,
      entity_type: entityType,
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create setup intent',
      error: error.message,
    });
  }
});

/**
 * POST /subscriptions/subscribe
 * Create a new subscription
 * Supports both contractors and citizens
 */
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const {
      plan_id,
      plan_key,
      stripe_price_id,
      stripe_product_id,
      features,
      payment_method_id,
    } = req.body;

    // Accept either plan_id (legacy) or stripe_price_id (new)
    const priceId = stripe_price_id || null;
    const planKey = plan_key || plan_id;
    const productId = stripe_product_id || null;

    if (!priceId) {
      return res.status(400).json({
        success: false,
        message: 'Stripe price ID is required',
      });
    }

    if (!planKey) {
      return res.status(400).json({
        success: false,
        message: 'Plan key is required',
      });
    }

    // Find entity - contractor or citizen
    let entity = null;
    let entityType = null;

    if (req.user.contractor_id) {
      entity = await Contractor.findById(req.user.contractor_id);
      entityType = 'contractor';
    } else if (req.user.citizen_id) {
      entity = await Citizen.findById(req.user.citizen_id);
      entityType = 'citizen';
    }

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    console.log('🔵 [SUBSCRIBE] Creating subscription for:', {
      entityType,
      entityId: entity._id,
      planKey,
      priceId,
    });

    // Can't subscribe to free plan via API
    if (planKey === 'free') {
      return res.status(400).json({
        success: false,
        message: 'Cannot subscribe to free plan',
      });
    }

    // Create Stripe customer if doesn't exist
    if (!entity.subscription?.stripe_customer_id) {
      const customer = await stripeService.createCustomer(entity, req.user);
      entity.subscription = entity.subscription || {};
      entity.subscription.stripe_customer_id = customer.id;
      await entity.save();
    }

    // Attach payment method if provided
    if (payment_method_id) {
      await stripeService.attachPaymentMethod(
        payment_method_id,
        entity.subscription.stripe_customer_id,
      );

      await stripeService.setDefaultPaymentMethod(
        entity.subscription.stripe_customer_id,
        payment_method_id,
      );
    }

    // Create subscription using Stripe price ID
    const subscription = await stripeService.createSubscription(
      entity.subscription.stripe_customer_id,
      priceId,
      payment_method_id,
    );

    console.log('🟢 [SUBSCRIBE] Stripe subscription created:', {
      id: subscription.id,
      status: subscription.status,
      entityType,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      latest_invoice_type: typeof subscription.latest_invoice,
      latest_invoice_id: subscription.latest_invoice?.id,
      payment_intent_id: subscription.latest_invoice?.payment_intent?.id,
      client_secret: subscription.latest_invoice?.payment_intent?.client_secret
        ? '✅ present'
        : '❌ missing',
    });

    // Update entity subscription with data from Stripe
    entity.subscription.stripe_subscription_id = subscription.id;
    entity.subscription.stripe_product_id = productId;
    entity.subscription.plan = planKey;
    entity.subscription.status = stripeService.mapSubscriptionStatus(
      subscription.status,
    );

    // Only set dates if they exist (Stripe returns Unix timestamps in seconds)
    if (subscription.current_period_start) {
      entity.subscription.current_period_start = new Date(
        subscription.current_period_start * 1000,
      );
    }
    if (subscription.current_period_end) {
      entity.subscription.current_period_end = new Date(
        subscription.current_period_end * 1000,
      );
    }

    // Use features from Stripe product metadata (passed from frontend)
    entity.subscription.features = features || {};

    await entity.save();

    res.json({
      success: true,
      subscription: entity.subscription,
      stripe_subscription: subscription,
      requires_action: subscription.status === 'incomplete',
      client_secret:
        subscription.latest_invoice?.payment_intent?.client_secret || null,
      entity_type: entityType,
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subscription',
      error: error.message,
    });
  }
});

/**
 * POST /subscriptions/change-plan
 * Change subscription plan (including Free <-> Paid transitions)
 * Now ALL plans use subscriptions, so we always update the subscription
 * Supports both contractors and citizens
 */
router.post('/change-plan', authenticateToken, async (req, res) => {
  try {
    const {
      new_plan_id,
      plan_key,
      stripe_price_id,
      stripe_product_id,
      features,
      payment_method_id,
    } = req.body;

    const priceId = stripe_price_id || null;
    const planKey = plan_key || new_plan_id;
    const productId = stripe_product_id || null;

    console.log('🔵 [CHANGE_PLAN] Request:', {
      planKey,
      priceId,
      productId,
      hasPaymentMethod: !!payment_method_id,
      userId: req.user._id,
      contractorId: req.user.contractor_id,
      citizenId: req.user.citizen_id,
      timestamp: new Date().toISOString(),
    });

    if (!planKey || !priceId) {
      return res.status(400).json({
        success: false,
        message: 'Plan key and Stripe price ID are required',
      });
    }

    // Find entity - contractor or citizen
    let entity = null;
    let entityType = null;

    if (req.user.contractor_id) {
      entity = await Contractor.findById(req.user.contractor_id);
      entityType = 'contractor';
    } else if (req.user.citizen_id) {
      entity = await Citizen.findById(req.user.citizen_id);
      entityType = 'citizen';
    }

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    console.log('🔵 [CHANGE_PLAN] Found entity:', {
      entityType,
      entityId: entity._id,
      currentPlan: entity.subscription?.plan,
    });

    // Check if entity has an existing subscription
    if (!entity.subscription?.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message:
          'No active subscription found. Please create a subscription first.',
      });
    }

    // If payment method provided, attach it to customer (for Free → Paid upgrades)
    if (payment_method_id && entity.subscription?.stripe_customer_id) {
      console.log(
        '🔵 [CHANGE_PLAN] Attaching payment method:',
        payment_method_id,
      );

      await stripeService.attachPaymentMethod(
        payment_method_id,
        entity.subscription.stripe_customer_id,
      );

      await stripeService.setDefaultPaymentMethod(
        entity.subscription.stripe_customer_id,
        payment_method_id,
      );

      console.log(
        '🟢 [CHANGE_PLAN] Payment method attached and set as default',
      );
    }

    console.log('🔵 [CHANGE_PLAN] Updating subscription:', {
      subscriptionId: entity.subscription.stripe_subscription_id,
      fromPlan: entity.subscription.plan,
      toPlan: planKey,
      newPriceId: priceId,
    });

    // Update Stripe subscription with new price ID (handles proration automatically)
    const subscription = await stripeService.updateSubscription(
      entity.subscription.stripe_subscription_id,
      priceId,
    );

    console.log('🟢 [CHANGE_PLAN] Stripe subscription updated:', {
      id: subscription.id,
      status: subscription.status,
      current_period_end: subscription.current_period_end,
    });

    // Update entity subscription with data from Stripe
    entity.subscription.stripe_product_id = productId;
    entity.subscription.plan = planKey;
    entity.subscription.status = stripeService.mapSubscriptionStatus(
      subscription.status,
    );

    // Only set dates if they exist (Stripe returns Unix timestamps in seconds)
    if (subscription.current_period_start) {
      entity.subscription.current_period_start = new Date(
        subscription.current_period_start * 1000,
      );
    }
    if (subscription.current_period_end) {
      entity.subscription.current_period_end = new Date(
        subscription.current_period_end * 1000,
      );
    }

    // Use features from Stripe product metadata (passed from frontend)
    entity.subscription.features = features || {};

    await entity.save();

    console.log('🟢 [CHANGE_PLAN] Plan changed successfully:', {
      entityType,
      newPlan: planKey,
      status: entity.subscription.status,
    });

    res.json({
      success: true,
      subscription: entity.subscription,
      stripe_subscription: subscription,
      entity_type: entityType,
    });
  } catch (error) {
    console.error('❌ [CHANGE_PLAN] Error changing plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change plan',
      error: error.message,
    });
  }
});

/**
 * POST /subscriptions/cancel
 * Cancel subscription
 * Supports both contractors and citizens
 */
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const { cancel_immediately } = req.body;

    // Find entity - contractor or citizen
    let entity = null;
    let entityType = null;

    if (req.user.contractor_id) {
      entity = await Contractor.findById(req.user.contractor_id);
      entityType = 'contractor';
    } else if (req.user.citizen_id) {
      entity = await Citizen.findById(req.user.citizen_id);
      entityType = 'citizen';
    }

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    if (!entity.subscription?.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found',
      });
    }

    // Cancel Stripe subscription
    const subscription = await stripeService.cancelSubscription(
      entity.subscription.stripe_subscription_id,
      cancel_immediately,
    );

    // Update entity subscription status
    if (cancel_immediately) {
      entity.subscription.status = 'cancelled';
      entity.subscription.plan = 'free';
      entity.subscription.features = getPlan('free').features;
    } else {
      entity.subscription.status = 'active'; // Still active until period end
    }

    await entity.save();

    res.json({
      success: true,
      subscription: entity.subscription,
      stripe_subscription: subscription,
      cancel_at_period_end: subscription.cancel_at_period_end,
      entity_type: entityType,
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: error.message,
    });
  }
});

/**
 * POST /subscriptions/reactivate
 * Reactivate a canceled subscription
 * Supports both contractors and citizens
 */
router.post('/reactivate', authenticateToken, async (req, res) => {
  try {
    // Find entity - contractor or citizen
    let entity = null;
    let entityType = null;

    if (req.user.contractor_id) {
      entity = await Contractor.findById(req.user.contractor_id);
      entityType = 'contractor';
    } else if (req.user.citizen_id) {
      entity = await Citizen.findById(req.user.citizen_id);
      entityType = 'citizen';
    }

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    if (!entity.subscription?.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: 'No subscription found',
      });
    }

    // Reactivate Stripe subscription
    const subscription = await stripeService.reactivateSubscription(
      entity.subscription.stripe_subscription_id,
    );

    // Update entity subscription status
    entity.subscription.status = stripeService.mapSubscriptionStatus(
      subscription.status,
    );

    await entity.save();

    res.json({
      success: true,
      subscription: entity.subscription,
      stripe_subscription: subscription,
      entity_type: entityType,
    });
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reactivate subscription',
      error: error.message,
    });
  }
});

/**
 * GET /subscriptions/upgrade-preview
 * Get preview of upgrading to a new plan
 * Supports both contractors and citizens
 */
router.get(
  '/upgrade-preview/:new_plan_id',
  authenticateToken,
  async (req, res) => {
    try {
      const { new_plan_id } = req.params;

      // Find entity - contractor or citizen
      let entity = null;
      let entityType = null;

      if (req.user.contractor_id) {
        entity = await Contractor.findById(req.user.contractor_id);
        entityType = 'contractor';
      } else if (req.user.citizen_id) {
        entity = await Citizen.findById(req.user.citizen_id);
        entityType = 'citizen';
      }

      if (!entity) {
        return res.status(404).json({
          success: false,
          message: 'User account not found',
        });
      }

      const currentPlanId = entity.subscription?.plan || 'free';
      const currentPlan = getPlan(currentPlanId);
      const newPlan = getPlan(new_plan_id);

      if (!newPlan) {
        return res.status(400).json({
          success: false,
          message: 'Invalid plan',
        });
      }

      // Get upgrade benefits
      const benefits = getUpgradeBenefits(currentPlanId, new_plan_id);

      // Calculate pro-rated amount if applicable
      let proratedAmount = null;
      if (
        entity.subscription?.stripe_customer_id &&
        newPlan.stripe_price_id
      ) {
        try {
          const upcomingInvoice = await stripeService.getUpcomingInvoice(
            entity.subscription.stripe_customer_id,
          );
          proratedAmount = upcomingInvoice.amount_due / 100; // Convert cents to dollars
        } catch (error) {
          console.warn('Could not calculate prorated amount:', error.message);
        }
      }

      res.json({
        success: true,
        current_plan: currentPlan,
        new_plan: newPlan,
        benefits,
        prorated_amount: proratedAmount,
        entity_type: entityType,
      });
    } catch (error) {
      console.error('Error generating upgrade preview:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate upgrade preview',
        error: error.message,
      });
    }
  },
);

module.exports = router;
