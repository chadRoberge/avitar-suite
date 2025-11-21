const Stripe = require('stripe');
const { getPlanByStripePriceId, getPlan } = require('../config/subscriptionPlans');

// Initialize Stripe with secret key
// Use DEV keys in development, PROD keys in production
const stripeSecretKey = process.env.NODE_ENV === 'production'
  ? process.env.STRIPE_SECRET_KEY_PROD
  : process.env.STRIPE_SECRET_KEY_DEV;

const stripe = new Stripe(stripeSecretKey);

/**
 * Stripe Service
 *
 * Handles all Stripe-related operations for contractor subscriptions
 */

/**
 * Create a Stripe customer for a contractor
 */
async function createCustomer(contractor, user) {
  try {
    const customer = await stripe.customers.create({
      email: user.email,
      name: contractor.company_name,
      metadata: {
        contractor_id: contractor._id.toString(),
        user_id: user._id.toString(),
      },
    });

    return customer;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    throw new Error('Failed to create Stripe customer');
  }
}

/**
 * Create a Setup Intent for adding payment methods
 */
async function createSetupIntent(customerId) {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

    return setupIntent;
  } catch (error) {
    console.error('Error creating setup intent:', error);
    throw new Error('Failed to create setup intent');
  }
}

/**
 * Attach a payment method to a customer
 */
async function attachPaymentMethod(paymentMethodId, customerId) {
  try {
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    return paymentMethod;
  } catch (error) {
    console.error('Error attaching payment method:', error);
    throw new Error('Failed to attach payment method');
  }
}

/**
 * Get payment method details
 */
async function getPaymentMethod(paymentMethodId) {
  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    return paymentMethod;
  } catch (error) {
    console.error('Error retrieving payment method:', error);
    throw new Error('Failed to retrieve payment method');
  }
}

/**
 * Detach a payment method from a customer
 */
async function detachPaymentMethod(paymentMethodId) {
  try {
    const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);
    return paymentMethod;
  } catch (error) {
    console.error('Error detaching payment method:', error);
    throw new Error('Failed to detach payment method');
  }
}

/**
 * Set default payment method for a customer
 */
async function setDefaultPaymentMethod(customerId, paymentMethodId) {
  try {
    const customer = await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return customer;
  } catch (error) {
    console.error('Error setting default payment method:', error);
    throw new Error('Failed to set default payment method');
  }
}

/**
 * Create a subscription for a customer
 */
async function createSubscription(customerId, stripePriceId, paymentMethodId = null) {
  try {
    const subscriptionData = {
      customer: customerId,
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    };

    // If payment method provided, set it as default
    if (paymentMethodId) {
      subscriptionData.default_payment_method = paymentMethodId;
    }

    const subscription = await stripe.subscriptions.create(subscriptionData);

    return subscription;
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw new Error('Failed to create subscription');
  }
}

/**
 * Update a subscription (change plan)
 */
async function updateSubscription(subscriptionId, newStripePriceId) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newStripePriceId,
        },
      ],
      proration_behavior: 'create_prorations', // Pro-rate the charges
    });

    return updatedSubscription;
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw new Error('Failed to update subscription');
  }
}

/**
 * Cancel a subscription
 */
async function cancelSubscription(subscriptionId, cancelImmediately = false) {
  try {
    if (cancelImmediately) {
      // Cancel immediately
      const subscription = await stripe.subscriptions.cancel(subscriptionId);
      return subscription;
    } else {
      // Cancel at period end
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      return subscription;
    }
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw new Error('Failed to cancel subscription');
  }
}

/**
 * Reactivate a canceled subscription
 */
async function reactivateSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    return subscription;
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    throw new Error('Failed to reactivate subscription');
  }
}

/**
 * Get subscription details
 */
async function getSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice', 'default_payment_method'],
    });

    return subscription;
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    throw new Error('Failed to retrieve subscription');
  }
}

/**
 * Get customer details
 */
async function getCustomer(customerId) {
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });

    return customer;
  } catch (error) {
    console.error('Error retrieving customer:', error);
    throw new Error('Failed to retrieve customer');
  }
}

/**
 * List customer payment methods
 */
async function listPaymentMethods(customerId) {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    return paymentMethods.data;
  } catch (error) {
    console.error('Error listing payment methods:', error);
    throw new Error('Failed to list payment methods');
  }
}

/**
 * Get upcoming invoice (for preview)
 */
async function getUpcomingInvoice(customerId, subscriptionId = null) {
  try {
    const params = { customer: customerId };
    if (subscriptionId) {
      params.subscription = subscriptionId;
    }

    const invoice = await stripe.invoices.retrieveUpcoming(params);
    return invoice;
  } catch (error) {
    console.error('Error retrieving upcoming invoice:', error);
    throw new Error('Failed to retrieve upcoming invoice');
  }
}

/**
 * List invoices for a customer
 */
async function listInvoices(customerId, limit = 10) {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: limit,
    });

    return invoices.data;
  } catch (error) {
    console.error('Error listing invoices:', error);
    throw new Error('Failed to list invoices');
  }
}

/**
 * Handle Stripe webhook events
 */
function constructWebhookEvent(payload, signature) {
  const webhookSecret = process.env.NODE_ENV === 'production'
    ? process.env.STRIPE_WEBHOOK_SECRET_PROD
    : process.env.STRIPE_WEBHOOK_SECRET_DEV;

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    return event;
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    throw new Error('Webhook signature verification failed');
  }
}

/**
 * Map Stripe subscription status to our internal status
 */
function mapSubscriptionStatus(stripeStatus) {
  const statusMap = {
    active: 'active',
    trialing: 'trial',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'inactive',
    incomplete: 'inactive',
    incomplete_expired: 'inactive',
  };

  return statusMap[stripeStatus] || 'inactive';
}

/**
 * Get subscription features from Stripe subscription
 */
function getSubscriptionFeatures(subscription) {
  // Get the price ID from the subscription
  const priceId = subscription.items?.data[0]?.price?.id;

  if (!priceId) {
    return null;
  }

  // Find the plan matching this price ID
  const plan = getPlanByStripePriceId(priceId);

  if (!plan) {
    return null;
  }

  return plan.features;
}

module.exports = {
  stripe,
  createCustomer,
  createSetupIntent,
  attachPaymentMethod,
  getPaymentMethod,
  detachPaymentMethod,
  setDefaultPaymentMethod,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  reactivateSubscription,
  getSubscription,
  getCustomer,
  listPaymentMethods,
  getUpcomingInvoice,
  listInvoices,
  constructWebhookEvent,
  mapSubscriptionStatus,
  getSubscriptionFeatures,
};
