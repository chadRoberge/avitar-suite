const express = require('express');
const Municipality = require('../models/Municipality');
const { authenticateToken } = require('../middleware/auth');
const stripeService = require('../services/stripeService');
const emailService = require('../services/emailService');

const router = express.Router();

/**
 * @route   POST /api/municipalities/:id/modules/:module/trial
 * @desc    Start a trial subscription for a specific module
 * @access  Private (requires municipality admin)
 */
router.post(
  '/:id/modules/:module/trial',
  authenticateToken,
  async (req, res) => {
    try {
      const { id: municipalityId, module: moduleName } = req.params;
      const { billingEmail } = req.body;

      // Check if user has permission to manage this municipality
      const userPerm = req.user.municipal_permissions?.find(
        (perm) => perm.municipality_id.toString() === municipalityId,
      );

      if (
        !userPerm &&
        !['avitar_admin', 'avitar_staff'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to manage this municipality',
        });
      }

      // Admin check - only admins can start trials
      if (
        userPerm &&
        userPerm.role !== 'admin' &&
        !['avitar_admin', 'avitar_staff'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can start module trials',
        });
      }

      const municipality = await Municipality.findById(municipalityId);

      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      // Check if module already has a subscription
      const existingModule = municipality.module_config.modules.get(moduleName);
      if (existingModule?.stripe_subscription_id) {
        return res.status(400).json({
          success: false,
          message: 'Module already has an active subscription',
        });
      }

      // Get parcel count for pricing
      const parcelCount = await municipality.getParcelCount();

      console.log(
        `Starting trial for ${moduleName} in ${municipality.name} with ${parcelCount} parcels`,
      );

      // Get appropriate Stripe price based on parcel count
      const priceData = await stripeService.getPriceDataForModule(
        moduleName,
        parcelCount,
      );

      if (!priceData) {
        return res.status(400).json({
          success: false,
          message: `No pricing tier found for ${parcelCount} parcels`,
        });
      }

      const { priceId, productId, tier } = priceData;

      console.log(`📦 Selected Stripe product for trial:`, {
        priceId,
        productId,
        tier,
        moduleName,
        parcelCount,
      });

      // Create or get Stripe customer
      const customer = await stripeService.getOrCreateMunicipalityCustomer(
        municipality,
        billingEmail || municipality.billing_email,
      );

      // Save customer ID if new
      if (!municipality.stripe_customer_id) {
        municipality.stripe_customer_id = customer.id;
      }
      if (billingEmail) {
        municipality.billing_email = billingEmail;
      }

      // Create trial subscription (30 days)
      const subscription = await stripeService.createModuleTrialSubscription(
        customer.id,
        priceId,
        moduleName,
        30,
      );

      // Update module configuration
      const moduleConfig = existingModule || {};
      moduleConfig.enabled = true;
      moduleConfig.stripe_subscription_id = subscription.id;
      moduleConfig.stripe_product_id = productId; // Store product ID
      moduleConfig.tier = tier; // Store tier
      moduleConfig.subscription_status = 'trialing';
      moduleConfig.trial_start = new Date();
      moduleConfig.trial_end = new Date(subscription.trial_end * 1000);
      moduleConfig.stripe_price_id = priceId;
      moduleConfig.parcel_count_at_purchase = parcelCount;
      moduleConfig.activated_date = new Date();

      municipality.module_config.modules.set(moduleName, moduleConfig);
      await municipality.save();

      console.log(
        `Trial started for ${moduleName}: ${subscription.id}, ends ${moduleConfig.trial_end}`,
      );

      // TODO: Send trial started email

      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          trial_end: moduleConfig.trial_end,
        },
        module: moduleName,
        parcel_count: parcelCount,
        access_level: 'trial',
      });
    } catch (error) {
      console.error('Start trial error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to start trial',
      });
    }
  },
);

/**
 * @route   POST /api/municipalities/:id/modules/:module/subscribe
 * @desc    Convert trial to paid or create new paid subscription
 * @access  Private (requires municipality admin)
 */
router.post(
  '/:id/modules/:module/subscribe',
  authenticateToken,
  async (req, res) => {
    try {
      const { id: municipalityId, module: moduleName } = req.params;
      const { paymentMethodId, billingEmail } = req.body;

      // Permission checks
      const userPerm = req.user.municipal_permissions?.find(
        (perm) => perm.municipality_id.toString() === municipalityId,
      );

      if (
        !userPerm &&
        !['avitar_admin', 'avitar_staff'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to manage this municipality',
        });
      }

      if (
        userPerm &&
        userPerm.role !== 'admin' &&
        !['avitar_admin', 'avitar_staff'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can manage subscriptions',
        });
      }

      const municipality = await Municipality.findById(municipalityId);
      const moduleConfig = municipality.module_config.modules.get(moduleName);

      if (!moduleConfig) {
        return res.status(400).json({
          success: false,
          message: 'Module not found',
        });
      }

      // Get current parcel count
      const parcelCount = await municipality.getParcelCount();

      if (moduleConfig.stripe_subscription_id) {
        // Convert existing trial to paid
        console.log(
          `Converting trial to paid for ${moduleName}: ${moduleConfig.stripe_subscription_id}`,
        );

        const subscription = await stripeService.convertTrialToAnnual(
          moduleConfig.stripe_subscription_id,
        );

        // Add payment method if provided
        if (paymentMethodId) {
          await stripeService.attachPaymentMethod(
            paymentMethodId,
            municipality.stripe_customer_id,
          );
          await stripeService.setDefaultPaymentMethod(
            municipality.stripe_customer_id,
            paymentMethodId,
          );
        }

        moduleConfig.subscription_status = 'active';
        moduleConfig.current_period_start = new Date(
          subscription.current_period_start * 1000,
        );
        moduleConfig.current_period_end = new Date(
          subscription.current_period_end * 1000,
        );
      } else {
        // Create new subscription (no trial)
        console.log(`Creating new paid subscription for ${moduleName}`);

        const customer = await stripeService.getOrCreateMunicipalityCustomer(
          municipality,
          billingEmail || municipality.billing_email,
        );

        const priceId = await stripeService.getPriceIdForModule(
          moduleName,
          parcelCount,
        );

        if (!priceId) {
          return res.status(400).json({
            success: false,
            message: `No pricing tier found for ${parcelCount} parcels`,
          });
        }

        const subscription = await stripeService.createSubscription(
          customer.id,
          priceId,
          paymentMethodId,
        );

        moduleConfig.enabled = true;
        moduleConfig.stripe_subscription_id = subscription.id;
        moduleConfig.subscription_status = 'active';
        moduleConfig.stripe_price_id = priceId;
        moduleConfig.parcel_count_at_purchase = parcelCount;
        moduleConfig.current_period_start = new Date(
          subscription.current_period_start * 1000,
        );
        moduleConfig.current_period_end = new Date(
          subscription.current_period_end * 1000,
        );
        moduleConfig.activated_date = new Date();
      }

      municipality.module_config.modules.set(moduleName, moduleConfig);
      await municipality.save();

      console.log(`Subscription activated for ${moduleName}`);

      // TODO: Send subscription activated email

      res.json({
        success: true,
        module: moduleName,
        subscription_status: moduleConfig.subscription_status,
        current_period_end: moduleConfig.current_period_end,
        access_level: 'full',
      });
    } catch (error) {
      console.error('Subscribe error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create subscription',
      });
    }
  },
);

/**
 * @route   GET /api/municipalities/:id/modules/:module/subscription
 * @desc    Get subscription status for a module
 * @access  Private
 */
router.get(
  '/:id/modules/:module/subscription',
  authenticateToken,
  async (req, res) => {
    try {
      const { id: municipalityId, module: moduleName } = req.params;

      const municipality = await Municipality.findById(municipalityId);

      if (!municipality) {
        return res.status(404).json({
          success: false,
          message: 'Municipality not found',
        });
      }

      const moduleConfig = municipality.module_config.modules.get(moduleName);

      if (!moduleConfig) {
        return res.json({
          success: true,
          access_level: 'none',
          subscription: null,
        });
      }

      const accessLevel = municipality.getModuleAccessLevel(moduleName);
      const parcelCount = await municipality.getParcelCount();
      const daysRemaining = municipality.getTrialDaysRemaining(moduleName);

      res.json({
        success: true,
        access_level: accessLevel,
        subscription: {
          status: moduleConfig.subscription_status,
          trial_start: moduleConfig.trial_start,
          trial_end: moduleConfig.trial_end,
          trial_days_remaining: daysRemaining,
          current_period_start: moduleConfig.current_period_start,
          current_period_end: moduleConfig.current_period_end,
          parcel_count: parcelCount,
          parcel_count_at_purchase: moduleConfig.parcel_count_at_purchase,
          stripe_subscription_id: moduleConfig.stripe_subscription_id,
        },
      });
    } catch (error) {
      console.error('Get subscription error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get subscription status',
      });
    }
  },
);

/**
 * @route   DELETE /api/municipalities/:id/modules/:module/subscription
 * @desc    Cancel a module subscription
 * @access  Private (requires municipality admin)
 */
router.delete(
  '/:id/modules/:module/subscription',
  authenticateToken,
  async (req, res) => {
    try {
      const { id: municipalityId, module: moduleName } = req.params;
      const { immediately = false } = req.body;

      // Permission checks
      const userPerm = req.user.municipal_permissions?.find(
        (perm) => perm.municipality_id.toString() === municipalityId,
      );

      if (
        !userPerm &&
        !['avitar_admin', 'avitar_staff'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to manage this municipality',
        });
      }

      if (
        userPerm &&
        userPerm.role !== 'admin' &&
        !['avitar_admin', 'avitar_staff'].includes(req.user.global_role)
      ) {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can cancel subscriptions',
        });
      }

      const municipality = await Municipality.findById(municipalityId);
      const moduleConfig = municipality.module_config.modules.get(moduleName);

      if (!moduleConfig || !moduleConfig.stripe_subscription_id) {
        return res.status(400).json({
          success: false,
          message: 'No active subscription found for this module',
        });
      }

      // Cancel in Stripe
      await stripeService.cancelSubscription(
        moduleConfig.stripe_subscription_id,
        immediately,
      );

      if (immediately) {
        moduleConfig.subscription_status = 'cancelled';
        moduleConfig.enabled = false;
      } else {
        moduleConfig.subscription_status = 'cancelled';
        // Module stays enabled until period end
      }

      municipality.module_config.modules.set(moduleName, moduleConfig);
      await municipality.save();

      console.log(
        `Subscription cancelled for ${moduleName} (immediate: ${immediately})`,
      );

      res.json({
        success: true,
        message: immediately
          ? 'Subscription cancelled immediately'
          : 'Subscription will cancel at period end',
      });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to cancel subscription',
      });
    }
  },
);

module.exports = router;
