const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Contractor = require('../models/Contractor');
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
 * Get current contractor's subscription details
 */
router.get('/my-subscription', authenticateToken, async (req, res) => {
  try {
    if (!req.user.contractor_id) {
      return res.status(404).json({
        success: false,
        message: 'No contractor account found',
      });
    }

    const contractor = await Contractor.findById(req.user.contractor_id);

    if (!contractor) {
      return res.status(404).json({
        success: false,
        message: 'Contractor not found',
      });
    }

    // Get Stripe subscription details if exists
    let stripeSubscription = null;
    let stripeCustomer = null;
    let upcomingInvoice = null;

    if (contractor.subscription?.stripe_subscription_id) {
      try {
        stripeSubscription = await stripeService.getSubscription(
          contractor.subscription.stripe_subscription_id
        );

        upcomingInvoice = await stripeService.getUpcomingInvoice(
          contractor.subscription.stripe_customer_id,
          contractor.subscription.stripe_subscription_id
        );
      } catch (error) {
        console.warn('Could not fetch Stripe subscription:', error.message);
      }
    }

    if (contractor.subscription?.stripe_customer_id) {
      try {
        stripeCustomer = await stripeService.getCustomer(
          contractor.subscription.stripe_customer_id
        );
      } catch (error) {
        console.warn('Could not fetch Stripe customer:', error.message);
      }
    }

    // Get current plan details
    const currentPlan = getPlan(contractor.subscription?.plan || 'free');

    res.json({
      success: true,
      subscription: {
        ...contractor.subscription?.toObject(),
        plan_details: currentPlan,
      },
      stripe_subscription: stripeSubscription,
      stripe_customer: stripeCustomer,
      upcoming_invoice: upcomingInvoice,
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
 */
router.post('/create-setup-intent', authenticateToken, async (req, res) => {
  try {
    const contractor = await Contractor.findById(req.user.contractor_id);

    if (!contractor) {
      return res.status(404).json({
        success: false,
        message: 'Contractor not found',
      });
    }

    // Create Stripe customer if doesn't exist
    if (!contractor.subscription?.stripe_customer_id) {
      const customer = await stripeService.createCustomer(contractor, req.user);

      contractor.subscription = contractor.subscription || {};
      contractor.subscription.stripe_customer_id = customer.id;
      await contractor.save();
    }

    // Create setup intent
    const setupIntent = await stripeService.createSetupIntent(
      contractor.subscription.stripe_customer_id
    );

    res.json({
      success: true,
      client_secret: setupIntent.client_secret,
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
 */
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const { plan_id, payment_method_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required',
      });
    }

    const contractor = await Contractor.findById(req.user.contractor_id);

    if (!contractor) {
      return res.status(404).json({
        success: false,
        message: 'Contractor not found',
      });
    }

    // Can't subscribe to free plan via API
    if (plan_id === 'free') {
      return res.status(400).json({
        success: false,
        message: 'Cannot subscribe to free plan',
      });
    }

    // Get plan details
    const plan = getPlan(plan_id);
    if (!plan || !plan.stripe_price_id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan',
      });
    }

    // Create Stripe customer if doesn't exist
    if (!contractor.subscription?.stripe_customer_id) {
      const customer = await stripeService.createCustomer(contractor, req.user);
      contractor.subscription = contractor.subscription || {};
      contractor.subscription.stripe_customer_id = customer.id;
      await contractor.save();
    }

    // Attach payment method if provided
    if (payment_method_id) {
      await stripeService.attachPaymentMethod(
        payment_method_id,
        contractor.subscription.stripe_customer_id
      );

      await stripeService.setDefaultPaymentMethod(
        contractor.subscription.stripe_customer_id,
        payment_method_id
      );
    }

    // Create subscription
    const subscription = await stripeService.createSubscription(
      contractor.subscription.stripe_customer_id,
      plan.stripe_price_id,
      payment_method_id
    );

    // Update contractor subscription
    contractor.subscription.stripe_subscription_id = subscription.id;
    contractor.subscription.plan = plan_id;
    contractor.subscription.status = stripeService.mapSubscriptionStatus(
      subscription.status
    );
    contractor.subscription.current_period_start = new Date(
      subscription.current_period_start * 1000
    );
    contractor.subscription.current_period_end = new Date(
      subscription.current_period_end * 1000
    );
    contractor.subscription.features = plan.features;
    await contractor.save();

    res.json({
      success: true,
      subscription: contractor.subscription,
      stripe_subscription: subscription,
      requires_action: subscription.status === 'incomplete',
      client_secret:
        subscription.latest_invoice?.payment_intent?.client_secret || null,
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
 * Change subscription plan
 */
router.post('/change-plan', authenticateToken, async (req, res) => {
  try {
    const { new_plan_id } = req.body;

    if (!new_plan_id) {
      return res.status(400).json({
        success: false,
        message: 'New plan ID is required',
      });
    }

    const contractor = await Contractor.findById(req.user.contractor_id);

    if (!contractor) {
      return res.status(404).json({
        success: false,
        message: 'Contractor not found',
      });
    }

    if (!contractor.subscription?.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found',
      });
    }

    // Get new plan details
    const newPlan = getPlan(new_plan_id);
    if (!newPlan || !newPlan.stripe_price_id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan',
      });
    }

    // Update Stripe subscription
    const subscription = await stripeService.updateSubscription(
      contractor.subscription.stripe_subscription_id,
      newPlan.stripe_price_id
    );

    // Update contractor subscription
    contractor.subscription.plan = new_plan_id;
    contractor.subscription.status = stripeService.mapSubscriptionStatus(
      subscription.status
    );
    contractor.subscription.current_period_end = new Date(
      subscription.current_period_end * 1000
    );
    contractor.subscription.features = newPlan.features;
    await contractor.save();

    res.json({
      success: true,
      subscription: contractor.subscription,
      stripe_subscription: subscription,
    });
  } catch (error) {
    console.error('Error changing plan:', error);
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
 */
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const { cancel_immediately } = req.body;

    const contractor = await Contractor.findById(req.user.contractor_id);

    if (!contractor) {
      return res.status(404).json({
        success: false,
        message: 'Contractor not found',
      });
    }

    if (!contractor.subscription?.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found',
      });
    }

    // Cancel Stripe subscription
    const subscription = await stripeService.cancelSubscription(
      contractor.subscription.stripe_subscription_id,
      cancel_immediately
    );

    // Update contractor subscription status
    if (cancel_immediately) {
      contractor.subscription.status = 'cancelled';
      contractor.subscription.plan = 'free';
      contractor.subscription.features = getPlan('free').features;
    } else {
      contractor.subscription.status = 'active'; // Still active until period end
    }

    await contractor.save();

    res.json({
      success: true,
      subscription: contractor.subscription,
      stripe_subscription: subscription,
      cancel_at_period_end: subscription.cancel_at_period_end,
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
 */
router.post('/reactivate', authenticateToken, async (req, res) => {
  try {
    const contractor = await Contractor.findById(req.user.contractor_id);

    if (!contractor) {
      return res.status(404).json({
        success: false,
        message: 'Contractor not found',
      });
    }

    if (!contractor.subscription?.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: 'No subscription found',
      });
    }

    // Reactivate Stripe subscription
    const subscription = await stripeService.reactivateSubscription(
      contractor.subscription.stripe_subscription_id
    );

    // Update contractor subscription status
    contractor.subscription.status = stripeService.mapSubscriptionStatus(
      subscription.status
    );

    await contractor.save();

    res.json({
      success: true,
      subscription: contractor.subscription,
      stripe_subscription: subscription,
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
 */
router.get('/upgrade-preview/:new_plan_id', authenticateToken, async (req, res) => {
  try {
    const { new_plan_id } = req.params;

    const contractor = await Contractor.findById(req.user.contractor_id);

    if (!contractor) {
      return res.status(404).json({
        success: false,
        message: 'Contractor not found',
      });
    }

    const currentPlanId = contractor.subscription?.plan || 'free';
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
    if (contractor.subscription?.stripe_customer_id && newPlan.stripe_price_id) {
      try {
        const upcomingInvoice = await stripeService.getUpcomingInvoice(
          contractor.subscription.stripe_customer_id
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
    });
  } catch (error) {
    console.error('Error generating upgrade preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate upgrade preview',
      error: error.message,
    });
  }
});

module.exports = router;
