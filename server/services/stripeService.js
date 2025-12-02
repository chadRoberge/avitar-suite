const Stripe = require('stripe');
const {
  getPlanByStripePriceId,
  getPlan,
} = require('../config/subscriptionPlans');

// Initialize Stripe with secret key
// Use DEV keys in development, PROD keys in production
const stripeSecretKey =
  process.env.NODE_ENV === 'production'
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
async function createSubscription(
  customerId,
  stripePriceId,
  paymentMethodId = null,
) {
  try {
    console.log('🔵 [CREATE_SUB] Starting subscription creation:', {
      customerId,
      stripePriceId,
      hasPaymentMethod: !!paymentMethodId,
      timestamp: new Date().toISOString(),
    });

    const subscriptionData = {
      customer: customerId,
      items: [{ price: stripePriceId }],
      payment_behavior: 'error_if_incomplete', // Throw error with payment_intent if incomplete
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card']
      },
      expand: ['latest_invoice.payment_intent'], // Expand in creation
    };

    // If payment method provided, set it as default
    if (paymentMethodId) {
      subscriptionData.default_payment_method = paymentMethodId;
    }

    let subscription;
    try {
      subscription = await stripe.subscriptions.create(subscriptionData);
      console.log('🟢 [CREATE_SUB] Subscription created successfully without error');
    } catch (error) {
      // If error_if_incomplete throws, the error contains payment_intent details
      console.log('🟡 [CREATE_SUB] Subscription creation threw error (expected for incomplete):', {
        type: error.type,
        code: error.code,
        message: error.message,
      });

      if (error.type === 'StripeCardError' && error.payment_intent) {
        console.log('🟡 [CREATE_SUB] Error contains payment_intent:', {
          payment_intent_id: error.payment_intent.id,
          client_secret: error.payment_intent.client_secret ? 'present' : 'missing',
        });

        // Get the subscription that was created
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          subscription = subscriptions.data[0];
          // Attach the payment_intent from the error
          subscription.latest_invoice = {
            payment_intent: error.payment_intent,
          };
          console.log('🟢 [CREATE_SUB] Retrieved subscription from error:', subscription.id);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // Check if we got the payment_intent in the response
    console.log('🔵 [CREATE_SUB] Checking subscription response:', {
      id: subscription.id,
      status: subscription.status,
      latest_invoice_type: typeof subscription.latest_invoice,
      has_latest_invoice_object: typeof subscription.latest_invoice === 'object',
      latest_invoice_id: subscription.latest_invoice?.id,
      payment_intent_in_response: !!subscription.latest_invoice?.payment_intent,
    });

    // If payment_intent not in response, retrieve invoice separately
    if (subscription.latest_invoice && !subscription.latest_invoice.payment_intent) {
      const invoiceId = typeof subscription.latest_invoice === 'string'
        ? subscription.latest_invoice
        : subscription.latest_invoice.id;

      console.log('🔵 [CREATE_SUB] Retrieving invoice separately:', invoiceId);

      const invoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ['payment_intent'],
      });

      console.log('🔵 [CREATE_SUB] Invoice retrieved:', {
        id: invoice.id,
        status: invoice.status,
        paid: invoice.paid,
        payment_intent_type: typeof invoice.payment_intent,
        payment_intent_id: invoice.payment_intent?.id || invoice.payment_intent,
        has_payment_intent_object: typeof invoice.payment_intent === 'object',
      });

      // Replace latest_invoice with the fully expanded one
      subscription.latest_invoice = invoice;
    }

    console.log('🔵 [CREATE_SUB] Final subscription state:', {
      id: subscription.id,
      status: subscription.status,
      payment_intent_id: subscription.latest_invoice?.payment_intent?.id,
      payment_intent_status: subscription.latest_invoice?.payment_intent?.status,
      client_secret: subscription.latest_invoice?.payment_intent?.client_secret ? '✅ present' : '❌ missing',
    });

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

    const updatedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newStripePriceId,
          },
        ],
        proration_behavior: 'create_prorations', // Pro-rate the charges
        payment_behavior: 'pending_if_incomplete', // Auto-charge if payment method available
      },
    );

    console.log('Subscription updated:', {
      id: updatedSubscription.id,
      status: updatedSubscription.status,
      latest_invoice: updatedSubscription.latest_invoice,
    });

    // Retrieve with expanded invoice to get payment status
    const expandedSubscription = await stripe.subscriptions.retrieve(
      updatedSubscription.id,
      {
        expand: ['latest_invoice.payment_intent'],
      },
    );

    console.log('Latest invoice status:', {
      invoice_id: expandedSubscription.latest_invoice?.id,
      invoice_status: expandedSubscription.latest_invoice?.status,
      payment_intent: expandedSubscription.latest_invoice?.payment_intent?.id,
      payment_intent_status:
        expandedSubscription.latest_invoice?.payment_intent?.status,
    });

    // If the latest invoice is open/draft and has an amount, pay it
    const latestInvoice = expandedSubscription.latest_invoice;
    if (
      latestInvoice &&
      typeof latestInvoice !== 'string' &&
      (latestInvoice.status === 'open' || latestInvoice.status === 'draft') &&
      latestInvoice.amount_due > 0
    ) {
      console.log(
        'Invoice is open/draft with amount due, attempting to pay...',
      );
      try {
        const paidInvoice = await stripe.invoices.pay(latestInvoice.id, {
          paid_out_of_band: false, // Actually charge the payment method
        });
        console.log('Invoice paid successfully:', {
          invoice_id: paidInvoice.id,
          status: paidInvoice.status,
          amount_paid: paidInvoice.amount_paid,
        });
      } catch (payError) {
        console.error('Failed to pay invoice:', payError.message);
        // Don't throw - subscription change still succeeded
      }
    }

    return expandedSubscription;
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
    // Return null instead of throwing - this is optional preview data
    return null;
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
  const webhookSecret =
    process.env.NODE_ENV === 'production'
      ? process.env.STRIPE_WEBHOOK_SECRET_PROD
      : process.env.STRIPE_WEBHOOK_SECRET_DEV;

  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
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

/**
 * Get all available modules from Stripe products
 * Filters products with metadata.module and includes pricing
 */
async function getAvailableModules() {
  try {
    // Get all active products from Stripe
    const products = await stripe.products.list({
      active: true,
      limit: 100,
      expand: ['data.default_price'],
    });

    console.log('📦 Stripe Products Response:', JSON.stringify(products, null, 2));

    // Filter products that have the 'module' metadata
    const moduleProducts = products.data.filter(
      (product) => product.metadata && product.metadata.module,
    );

    console.log('🔍 Filtered Module Products:', JSON.stringify(moduleProducts, null, 2));

    // For each product, get its prices
    const modulesWithPricing = await Promise.all(
      moduleProducts.map(async (product) => {
        let pricing = null;

        // Get all prices for this product
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
        });

        if (prices.data.length > 0) {
          // Use the first active price (or default_price if available)
          const price =
            product.default_price && typeof product.default_price === 'object'
              ? product.default_price
              : prices.data[0];

          pricing = {
            amount: price.unit_amount / 100, // Convert cents to dollars
            currency: price.currency.toUpperCase(),
            interval: price.recurring?.interval || 'one_time',
            interval_count: price.recurring?.interval_count || 1,
            price_id: price.id,
          };
        }

        return {
          id: product.id,
          name: product.name,
          description: product.description || '',
          module: product.metadata.module,
          tier: product.metadata.tier || 'basic',
          image: product.images?.[0] || null,
          features: [
            // Include marketing features
            ...(product.marketing_features || []).map(f => f.name),
            // Include metadata features if present
            ...(product.metadata.features
              ? product.metadata.features.split(',').map((f) => f.trim())
              : []),
          ],
          pricing: pricing,
        };
      }),
    );

    console.log('✅ Final Modules with Pricing:', JSON.stringify(modulesWithPricing, null, 2));

    return modulesWithPricing;
  } catch (error) {
    console.error('Error fetching available modules from Stripe:', error);
    throw new Error('Failed to fetch available modules');
  }
}

/**
 * Municipality-specific Stripe functions
 */

/**
 * Create or retrieve Stripe customer for municipality
 */
async function getOrCreateMunicipalityCustomer(municipality, billingEmail) {
  try {
    // If already has customer, return it
    if (municipality.stripe_customer_id) {
      return await getCustomer(municipality.stripe_customer_id);
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: billingEmail,
      name: municipality.displayName || municipality.name,
      metadata: {
        municipality_id: municipality._id.toString(),
        type: 'municipality',
      },
    });

    return customer;
  } catch (error) {
    console.error('Error creating municipality Stripe customer:', error);
    throw new Error('Failed to create Stripe customer');
  }
}

/**
 * Start trial subscription for a module
 */
async function createModuleTrialSubscription(
  customerId,
  priceId,
  moduleName,
  trialDays = 30,
) {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      metadata: {
        module: moduleName,
        type: 'municipality_module',
      },
    });

    return subscription;
  } catch (error) {
    console.error('Error creating module trial subscription:', error);
    throw new Error('Failed to create trial subscription');
  }
}

/**
 * Convert trial to paid annual subscription
 */
async function convertTrialToAnnual(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      trial_end: 'now', // End trial immediately and start billing
    });

    return subscription;
  } catch (error) {
    console.error('Error converting trial to annual:', error);
    throw new Error('Failed to convert trial to paid subscription');
  }
}

/**
 * Get appropriate price ID based on parcel count and module
 * Stripe products should have metadata: min_parcels and max_parcels
 */
async function getPriceIdForModule(moduleName, parcelCount) {
  try {
    // Get all products for this module
    const products = await stripe.products.list({
      active: true,
      limit: 100,
    });

    const moduleProducts = products.data.filter(
      (p) => p.metadata && p.metadata.module === moduleName,
    );

    // Find prices for these products and check tiered limits
    for (const product of moduleProducts) {
      const prices = await stripe.prices.list({
        product: product.id,
        active: true,
      });

      // Check metadata for parcel limits
      for (const price of prices.data) {
        const minParcels = parseInt(price.metadata?.min_parcels || 0);
        const maxParcels = parseInt(
          price.metadata?.max_parcels || Number.MAX_SAFE_INTEGER,
        );

        if (parcelCount >= minParcels && parcelCount <= maxParcels) {
          return price.id;
        }
      }
    }

    console.warn(
      `No price found for module ${moduleName} with ${parcelCount} parcels`,
    );
    return null;
  } catch (error) {
    console.error('Error getting price ID for module:', error);
    throw new Error('Failed to get price for module');
  }
}

/**
 * Calculate price for a specific quantity from Stripe price tiers
 * This properly handles both volume and graduated tiered pricing
 */
async function calculatePriceForQuantity(priceId, quantity) {
  try {
    // Retrieve price with expanded tiers data
    const price = await stripe.prices.retrieve(priceId, {
      expand: ['tiers'],
    });

    console.log(`\n[calculatePrice] Retrieved price ${priceId}:`);
    console.log(`  - billing_scheme: ${price.billing_scheme}`);
    console.log(`  - tiers_mode: ${price.tiers_mode}`);
    console.log(`  - unit_amount: ${price.unit_amount}`);
    console.log(`  - has tiers: ${!!price.tiers}`);

    let totalAmount = 0;

    if (price.billing_scheme === 'tiered' && price.tiers) {
      console.log(`  [calculatePrice] Tiers mode: ${price.tiers_mode}, quantity: ${quantity}`);
      console.log(`  [calculatePrice] Tiers:`, JSON.stringify(price.tiers, null, 2));

      if (price.tiers_mode === 'volume') {
        // Volume pricing: entire quantity is charged at one tier's rate
        for (const tier of price.tiers) {
          if (tier.up_to === null || quantity <= tier.up_to) {
            // Found the matching tier - apply BOTH flat and unit amounts
            if (tier.flat_amount) {
              totalAmount += tier.flat_amount / 100;
              console.log(`  [calculatePrice] Adding flat amount: $${tier.flat_amount / 100}`);
            }
            if (tier.unit_amount) {
              const unitCost = (tier.unit_amount * quantity) / 100;
              totalAmount += unitCost;
              console.log(`  [calculatePrice] Adding unit cost: ${quantity} × $${tier.unit_amount / 100} = $${unitCost}`);
            }
            console.log(`  [calculatePrice] Volume tier matched (up_to: ${tier.up_to}), total: $${totalAmount}`);
            break;
          }
        }
      } else if (price.tiers_mode === 'graduated') {
        // Graduated pricing: each tier is charged for its portion
        let remaining = quantity;
        let previousUpTo = 0;

        for (const tier of price.tiers) {
          const tierUpTo = tier.up_to === null ? quantity : tier.up_to;
          const tierQuantity = Math.min(remaining, tierUpTo - previousUpTo);

          if (tierQuantity > 0) {
            // Apply BOTH flat and unit amounts for this tier
            if (tier.flat_amount) {
              totalAmount += tier.flat_amount / 100;
              console.log(`  [calculatePrice] Tier flat: $${tier.flat_amount / 100}`);
            }
            if (tier.unit_amount) {
              const tierCost = (tier.unit_amount * tierQuantity) / 100;
              totalAmount += tierCost;
              console.log(`  [calculatePrice] Tier unit: ${tierQuantity} × $${tier.unit_amount / 100} = $${tierCost}`);
            }
          }

          remaining -= tierQuantity;
          previousUpTo = tierUpTo;

          if (remaining <= 0 || tier.up_to === null) break;
        }
        console.log(`  [calculatePrice] Graduated total: $${totalAmount}`);
      }
    } else if (price.unit_amount) {
      // Simple per-unit pricing
      totalAmount = (price.unit_amount * quantity) / 100;
      console.log(`  [calculatePrice] Simple pricing: ${quantity} × $${price.unit_amount / 100} = $${totalAmount}`);
    } else {
      console.log(`  [calculatePrice] ⚠️  No pricing found! Full price object:`, JSON.stringify(price, null, 2));
    }

    console.log(`  [calculatePrice] Final total: $${totalAmount}\n`);
    return totalAmount;
  } catch (error) {
    console.error('❌ Error calculating price from Stripe tiers:', error);
    return null;
  }
}

/**
 * Get tiered pricing for a module at specific parcel counts
 * Used when municipality doesn't have parcel data yet
 */
async function getTieredPricingForModule(moduleName, parcelCounts = [1000, 2000, 3500]) {
  try {
    const products = await stripe.products.list({
      active: true,
      limit: 100,
    });

    const moduleProducts = products.data.filter(
      (p) => p.metadata && p.metadata.module === moduleName,
    );

    const tiers = [];

    for (const parcelCount of parcelCounts) {
      let priceInfo = null;

      // Find the appropriate price for this parcel count
      for (const product of moduleProducts) {
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
        });

        for (const price of prices.data) {
          const minParcels = parseInt(price.metadata?.min_parcels || 0);
          const maxParcels = parseInt(
            price.metadata?.max_parcels || Number.MAX_SAFE_INTEGER,
          );

          if (parcelCount >= minParcels && parcelCount <= maxParcels) {
            // Use the shared calculation helper
            const calculatedAmount = await calculatePriceForQuantity(
              price.id,
              parcelCount,
            );

            if (calculatedAmount !== null) {
              priceInfo = {
                parcel_count: parcelCount,
                amount: calculatedAmount,
                currency: price.currency.toUpperCase(),
                interval: price.recurring?.interval || 'one_time',
                interval_count: price.recurring?.interval_count || 1,
                price_id: price.id,
                min_parcels: minParcels,
                max_parcels:
                  maxParcels === Number.MAX_SAFE_INTEGER ? null : maxParcels,
              };
            }
            break;
          }
        }

        if (priceInfo) break;
      }

      if (priceInfo) {
        tiers.push(priceInfo);
      }
    }

    return tiers;
  } catch (error) {
    console.error('Error getting tiered pricing for module:', error);
    throw new Error('Failed to get tiered pricing');
  }
}

/**
 * Update subscription metadata with parcel count
 */
async function updateSubscriptionParcelCount(subscriptionId, parcelCount) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      metadata: {
        parcel_count: parcelCount.toString(),
      },
    });

    return subscription;
  } catch (error) {
    console.error('Error updating subscription parcel count:', error);
    throw new Error('Failed to update parcel count');
  }
}

// ============================================================================
// Stripe Connect Functions (for Municipality Connected Accounts)
// ============================================================================

/**
 * Create a Stripe Standard Connected Account for a municipality
 */
async function createStandardConnectedAccount(municipality) {
  try {
    console.log('🔵 Creating Stripe Standard Connected Account for:', municipality.name);

    const account = await stripe.accounts.create({
      type: 'standard',
      country: 'US',
      email: municipality.billing_email || municipality.contact_info?.email,
      business_type: 'government_entity',
      business_profile: {
        name: municipality.name,
        url: municipality.contact_info?.website || undefined,
        mcc: '9399', // Government services MCC code
      },
      metadata: {
        municipality_id: municipality._id.toString(),
        municipality_name: municipality.name,
        municipality_type: municipality.type,
      },
    });

    console.log('🟢 Stripe Connected Account created:', account.id);

    return account;
  } catch (error) {
    console.error('❌ Error creating connected account:', error);
    throw new Error('Failed to create Stripe Connected Account');
  }
}

/**
 * Create an Account Link for onboarding
 */
async function createAccountLink(accountId, refreshUrl, returnUrl) {
  try {
    console.log('🔵 Creating Account Link for:', accountId);

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    console.log('🟢 Account Link created:', {
      url: accountLink.url,
      expires: new Date(accountLink.expires_at * 1000).toISOString(),
    });

    return accountLink;
  } catch (error) {
    console.error('❌ Error creating account link:', error);
    throw new Error('Failed to create account onboarding link');
  }
}

/**
 * Get account status from Stripe
 */
async function getAccountStatus(accountId) {
  try {
    const account = await stripe.accounts.retrieve(accountId);

    return {
      id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      requirements: account.requirements,
      type: account.type,
      country: account.country,
      business_profile: account.business_profile,
    };
  } catch (error) {
    console.error('❌ Error retrieving account status:', error);
    throw new Error('Failed to retrieve account status');
  }
}

/**
 * Refresh an expired Account Link
 */
async function refreshAccountLink(accountId, refreshUrl, returnUrl) {
  try {
    console.log('🔵 Refreshing Account Link for:', accountId);

    // Same as creating a new one
    return await createAccountLink(accountId, refreshUrl, returnUrl);
  } catch (error) {
    console.error('❌ Error refreshing account link:', error);
    throw new Error('Failed to refresh account link');
  }
}

/**
 * Calculate platform fees (Avitar fee + Stripe processing fee)
 * This is for the pass-through pricing model where municipality receives full amount
 */
function calculatePlatformFees(baseAmount, platformFeePercentage = 5) {
  // Base amount is what municipality receives (e.g., $100 permit)
  const baseAmountCents = Math.round(baseAmount * 100);

  // Calculate Avitar platform fee (e.g., 5% of base)
  const avitarFeeCents = Math.round(baseAmountCents * (platformFeePercentage / 100));

  // Stripe fee: 2.9% + $0.30
  // But we need to calculate this on the TOTAL charged (base + avitar fee + stripe fee)
  // Formula: total = (base + avitar_fee + 30) / (1 - 0.029)
  const totalBeforeStripeFee = baseAmountCents + avitarFeeCents;
  const totalWithStripeFee = Math.round(
    (totalBeforeStripeFee + 30) / (1 - 0.029)
  );
  const stripeFeeCents = totalWithStripeFee - totalBeforeStripeFee;

  // Total amount to charge customer
  const totalChargeCents = baseAmountCents + avitarFeeCents + stripeFeeCents;

  return {
    baseAmount: baseAmountCents / 100,           // $100.00
    avitarFee: avitarFeeCents / 100,             // $5.00
    stripeFee: stripeFeeCents / 100,             // ~$3.20
    totalCharge: totalChargeCents / 100,         // $108.20
    baseAmountCents,
    avitarFeeCents,
    stripeFeeCents,
    totalChargeCents,
  };
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
  getAvailableModules,
  // Municipality-specific functions
  getOrCreateMunicipalityCustomer,
  createModuleTrialSubscription,
  convertTrialToAnnual,
  getPriceIdForModule,
  calculatePriceForQuantity,
  getTieredPricingForModule,
  updateSubscriptionParcelCount,
  // Stripe Connect functions
  createStandardConnectedAccount,
  createAccountLink,
  getAccountStatus,
  refreshAccountLink,
  calculatePlatformFees,
};
