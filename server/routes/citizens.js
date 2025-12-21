const express = require('express');
const router = express.Router();
const Citizen = require('../models/Citizen');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const {
  createCitizenCustomer,
  createSetupIntent,
  listPaymentMethods,
  attachPaymentMethod,
  detachPaymentMethod,
  setDefaultPaymentMethod,
  getPaymentMethod,
} = require('../services/stripeService');
const { SUBSCRIPTION_PLANS } = require('../config/subscriptionPlans');

/**
 * GET /api/citizens/plans
 * Get available subscription plans for citizens (residential users) from Stripe
 */
router.get('/plans', authenticateToken, async (req, res) => {
  try {
    console.log(
      '📦 GET /citizens/plans - Fetching residential plans from Stripe',
    );

    // Import stripe service
    const stripeService = require('../services/stripeService');

    // Get all active products from Stripe with plan_type = residential
    const products = await stripeService.stripe.products.list({
      active: true,
      limit: 100,
    });

    console.log(
      `   - Found ${products.data.length} total active products in Stripe`,
    );

    // Filter for residential plans
    const residentialPlans = products.data.filter(
      (product) =>
        product.metadata &&
        product.metadata.plan_type === 'residential' &&
        product.metadata.plan_key,
    );

    console.log(
      `   - Filtered to ${residentialPlans.length} residential plans`,
    );

    // If no residential plans found in Stripe, return a default free plan
    if (residentialPlans.length === 0) {
      console.log(
        '   - No residential plans in Stripe, returning default free plan',
      );
      return res.json({
        success: true,
        plans: [
          {
            id: 'free',
            plan_key: 'free',
            name: 'Free',
            description: 'Basic access to submit and track building permits',
            plan_type: 'residential',
            pricing: null,
            features: [
              'Submit and track building permits',
              'View permit status and inspection results',
              'Upload supporting documents',
              'Email notifications for permit updates',
            ],
            feature_flags: {
              max_permits_per_month: 5,
              stored_payment_methods: false,
              priority_support: false,
            },
          },
        ],
      });
    }

    // Get prices for each plan
    const plansWithPricing = await Promise.all(
      residentialPlans.map(async (product) => {
        // Get all prices for this product
        const prices = await stripeService.stripe.prices.list({
          product: product.id,
          active: true,
        });

        let pricing = null;
        if (prices.data.length > 0) {
          const price =
            product.default_price && typeof product.default_price === 'object'
              ? product.default_price
              : prices.data[0];

          pricing = {
            amount: price.unit_amount / 100, // Convert cents to dollars
            currency: price.currency.toUpperCase(),
            interval: price.recurring?.interval || 'month',
            interval_count: price.recurring?.interval_count || 1,
            price_id: price.id,
          };
        }

        // Extract feature list for display (marketing features)
        const displayFeatures = [
          ...(product.marketing_features || []).map((f) => f.name),
          ...(product.metadata.features
            ? product.metadata.features.split(',').map((f) => f.trim())
            : []),
        ];

        // Extract structured feature flags from metadata
        const structuredFeatures = {
          stored_payment_methods:
            product.metadata.stored_payment_methods === 'true',
          priority_support: product.metadata.priority_support === 'true',
          sms_notifications: product.metadata.sms_notifications === 'true',
          max_permits_per_month:
            product.metadata.max_permits_per_month === 'unlimited' ||
            product.metadata.max_permits_per_month === '-1'
              ? -1
              : parseInt(product.metadata.max_permits_per_month) || 5,
        };

        return {
          id: product.id,
          name: product.name,
          description: product.description || '',
          plan_key: product.metadata.plan_key,
          plan_type: product.metadata.plan_type,
          features: displayFeatures,
          feature_flags: structuredFeatures,
          pricing: pricing,
        };
      }),
    );

    // Sort by price (free first, then ascending)
    plansWithPricing.sort((a, b) => {
      if (!a.pricing) return -1;
      if (!b.pricing) return 1;
      return a.pricing.amount - b.pricing.amount;
    });

    console.log('✅ Returning residential plans to client:');
    plansWithPricing.forEach((plan, index) => {
      console.log(`   Plan ${index + 1}: ${plan.name} (${plan.plan_key})`);
      console.log(
        `      - Pricing: ${plan.pricing ? `$${plan.pricing.amount}/${plan.pricing.interval}` : 'Free'}`,
      );
      console.log(`      - Features: ${plan.features.length} items`);
    });

    res.json({
      success: true,
      plans: plansWithPricing,
    });
  } catch (error) {
    console.error('Error fetching citizen plans:', error);

    // On error, return a default free plan so the UI doesn't break
    res.json({
      success: true,
      plans: [
        {
          id: 'free',
          plan_key: 'free',
          name: 'Free',
          description: 'Basic access to submit and track building permits',
          plan_type: 'residential',
          pricing: null,
          features: [
            'Submit and track building permits',
            'View permit status and inspection results',
            'Upload supporting documents',
            'Email notifications for permit updates',
          ],
          feature_flags: {
            max_permits_per_month: 5,
            stored_payment_methods: false,
            priority_support: false,
          },
        },
      ],
    });
  }
});

/**
 * GET /api/citizens/:citizenId
 * Get citizen details by ID
 */
router.get('/:citizenId', authenticateToken, async (req, res) => {
  try {
    const { citizenId } = req.params;

    // Find citizen and verify ownership
    const citizen = await Citizen.findById(citizenId).populate(
      'owner_user_id',
      'first_name last_name email phone',
    );

    if (!citizen) {
      return res.status(404).json({
        success: false,
        message: 'Citizen account not found',
      });
    }

    // Verify the requesting user is the owner or an admin
    const isOwner =
      citizen.owner_user_id._id.toString() === req.user._id.toString();
    const isAdmin = ['avitar_staff', 'avitar_admin'].includes(
      req.user.global_role,
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    res.json({
      success: true,
      citizen,
    });
  } catch (error) {
    console.error('Error fetching citizen:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch citizen account',
    });
  }
});

/**
 * PUT /api/citizens/:citizenId
 * Update citizen details
 */
router.put('/:citizenId', authenticateToken, async (req, res) => {
  try {
    const { citizenId } = req.params;
    const { contact_info, primary_address } = req.body;

    const citizen = await Citizen.findById(citizenId);

    if (!citizen) {
      return res.status(404).json({
        success: false,
        message: 'Citizen account not found',
      });
    }

    // Verify ownership
    if (citizen.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Update allowed fields
    if (contact_info) {
      citizen.contact_info = { ...citizen.contact_info, ...contact_info };
    }
    if (primary_address) {
      citizen.primary_address = {
        ...citizen.primary_address,
        ...primary_address,
      };
    }

    await citizen.save();

    res.json({
      success: true,
      message: 'Citizen account updated successfully',
      citizen,
    });
  } catch (error) {
    console.error('Error updating citizen:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update citizen account',
    });
  }
});

/**
 * POST /api/citizens/:citizenId/setup-intent
 * Create a Stripe Setup Intent for adding payment methods
 */
router.post('/:citizenId/setup-intent', authenticateToken, async (req, res) => {
  try {
    const { citizenId } = req.params;

    const citizen = await Citizen.findById(citizenId);

    if (!citizen) {
      return res.status(404).json({
        success: false,
        message: 'Citizen account not found',
      });
    }

    // Verify ownership
    if (citizen.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Create Stripe customer if not exists
    if (!citizen.subscription.stripe_customer_id) {
      const user = await User.findById(req.user._id);
      const stripeCustomer = await createCitizenCustomer(user);
      citizen.subscription.stripe_customer_id = stripeCustomer.id;
      await citizen.save();
    }

    // Create Setup Intent
    const setupIntent = await createSetupIntent(
      citizen.subscription.stripe_customer_id,
    );

    res.json({
      success: true,
      clientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create setup intent',
    });
  }
});

/**
 * GET /api/citizens/:citizenId/payment-methods
 * Get citizen's stored payment methods
 */
router.get(
  '/:citizenId/payment-methods',
  authenticateToken,
  async (req, res) => {
    try {
      const { citizenId } = req.params;

      const citizen = await Citizen.findById(citizenId);

      if (!citizen) {
        return res.status(404).json({
          success: false,
          message: 'Citizen account not found',
        });
      }

      // Verify ownership
      if (citizen.owner_user_id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // If has Stripe customer, fetch fresh data from Stripe
      if (citizen.subscription.stripe_customer_id) {
        try {
          const stripePaymentMethods = await listPaymentMethods(
            citizen.subscription.stripe_customer_id,
          );

          // Transform Stripe payment methods to our format
          const paymentMethods = stripePaymentMethods.map((pm) => ({
            stripe_payment_method_id: pm.id,
            type: pm.type,
            is_default:
              pm.id ===
              citizen.payment_methods.find((p) => p.is_default)
                ?.stripe_payment_method_id,
            card_brand: pm.card?.brand,
            card_last4: pm.card?.last4,
            card_exp_month: pm.card?.exp_month,
            card_exp_year: pm.card?.exp_year,
            billing_name: pm.billing_details?.name,
          }));

          return res.json({
            success: true,
            paymentMethods,
          });
        } catch (stripeError) {
          console.error('Error fetching from Stripe:', stripeError);
          // Fall back to local data
        }
      }

      res.json({
        success: true,
        paymentMethods: citizen.payment_methods || [],
      });
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment methods',
      });
    }
  },
);

/**
 * POST /api/citizens/:citizenId/payment-methods
 * Add a payment method to citizen's account
 */
router.post(
  '/:citizenId/payment-methods',
  authenticateToken,
  async (req, res) => {
    try {
      const { citizenId } = req.params;
      const { paymentMethodId } = req.body;

      const citizen = await Citizen.findById(citizenId);

      if (!citizen) {
        return res.status(404).json({
          success: false,
          message: 'Citizen account not found',
        });
      }

      // Verify ownership
      if (citizen.owner_user_id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      if (!citizen.subscription.stripe_customer_id) {
        return res.status(400).json({
          success: false,
          message: 'No Stripe customer found',
        });
      }

      // Attach payment method to customer in Stripe
      await attachPaymentMethod(
        paymentMethodId,
        citizen.subscription.stripe_customer_id,
      );

      // Get payment method details
      const pm = await getPaymentMethod(paymentMethodId);

      // Add to local storage
      const isFirstCard = citizen.payment_methods.length === 0;
      citizen.payment_methods.push({
        stripe_payment_method_id: pm.id,
        type: pm.type,
        is_default: isFirstCard,
        card_brand: pm.card?.brand,
        card_last4: pm.card?.last4,
        card_exp_month: pm.card?.exp_month,
        card_exp_year: pm.card?.exp_year,
        billing_name: pm.billing_details?.name,
        added_at: new Date(),
      });

      // If first card, set as default in Stripe too
      if (isFirstCard) {
        await setDefaultPaymentMethod(
          citizen.subscription.stripe_customer_id,
          paymentMethodId,
        );
      }

      await citizen.save();

      res.json({
        success: true,
        message: 'Payment method added successfully',
        paymentMethods: citizen.payment_methods,
      });
    } catch (error) {
      console.error('Error adding payment method:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add payment method',
      });
    }
  },
);

/**
 * DELETE /api/citizens/:citizenId/payment-methods/:paymentMethodId
 * Remove a payment method
 */
router.delete(
  '/:citizenId/payment-methods/:paymentMethodId',
  authenticateToken,
  async (req, res) => {
    try {
      const { citizenId, paymentMethodId } = req.params;

      const citizen = await Citizen.findById(citizenId);

      if (!citizen) {
        return res.status(404).json({
          success: false,
          message: 'Citizen account not found',
        });
      }

      // Verify ownership
      if (citizen.owner_user_id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Detach from Stripe
      try {
        await detachPaymentMethod(paymentMethodId);
      } catch (stripeError) {
        console.warn('Could not detach from Stripe:', stripeError);
      }

      // Remove from local storage
      citizen.payment_methods = citizen.payment_methods.filter(
        (pm) => pm.stripe_payment_method_id !== paymentMethodId,
      );

      await citizen.save();

      res.json({
        success: true,
        message: 'Payment method removed successfully',
        paymentMethods: citizen.payment_methods,
      });
    } catch (error) {
      console.error('Error removing payment method:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove payment method',
      });
    }
  },
);

/**
 * PUT /api/citizens/:citizenId/payment-methods/:paymentMethodId/default
 * Set a payment method as default
 */
router.put(
  '/:citizenId/payment-methods/:paymentMethodId/default',
  authenticateToken,
  async (req, res) => {
    try {
      const { citizenId, paymentMethodId } = req.params;

      const citizen = await Citizen.findById(citizenId);

      if (!citizen) {
        return res.status(404).json({
          success: false,
          message: 'Citizen account not found',
        });
      }

      // Verify ownership
      if (citizen.owner_user_id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Update in Stripe
      if (citizen.subscription.stripe_customer_id) {
        await setDefaultPaymentMethod(
          citizen.subscription.stripe_customer_id,
          paymentMethodId,
        );
      }

      // Update local storage
      citizen.payment_methods.forEach((pm) => {
        pm.is_default = pm.stripe_payment_method_id === paymentMethodId;
      });

      await citizen.save();

      res.json({
        success: true,
        message: 'Default payment method updated',
        paymentMethods: citizen.payment_methods,
      });
    } catch (error) {
      console.error('Error setting default payment method:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to set default payment method',
      });
    }
  },
);

/**
 * GET /api/citizens/:citizenId/subscription
 * Get citizen's subscription details
 */
router.get('/:citizenId/subscription', authenticateToken, async (req, res) => {
  try {
    const { citizenId } = req.params;

    const citizen = await Citizen.findById(citizenId);

    if (!citizen) {
      return res.status(404).json({
        success: false,
        message: 'Citizen account not found',
      });
    }

    // Verify ownership
    if (citizen.owner_user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    res.json({
      success: true,
      subscription: citizen.subscription,
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription',
    });
  }
});

module.exports = router;
