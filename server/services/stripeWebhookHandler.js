const { stripe } = require('./stripeService');
const Municipality = require('../models/Municipality');
const Contractor = require('../models/Contractor');

/**
 * Stripe Webhook Handler Service
 *
 * Handles Stripe webhook events and syncs subscription/feature data
 * to local database using Stripe Product Features API
 */

/**
 * Get product with features from Stripe Product Features API
 * @param {Object} subscription - Stripe subscription object
 * @returns {Object} { product_id, tier, features }
 */
async function getProductWithFeatures(subscription) {
  try {
    // Get the price from subscription
    const priceId = subscription.items?.data[0]?.price?.id;
    if (!priceId) {
      throw new Error('No price ID found in subscription');
    }

    // Retrieve price with expanded product
    const price = await stripe.prices.retrieve(priceId, {
      expand: ['product'],
    });

    const product = price.product;

    // Get tier from product metadata
    const tier = product.metadata?.tier || 'basic';

    // Use Stripe Product Features API to get features
    const productFeatures = await stripe.products.listFeatures(product.id);

    // Extract feature names into array
    const features = productFeatures.data.map((feature) => feature.name);

    console.log('✅ Retrieved product with features:', {
      product_id: product.id,
      tier,
      features,
    });

    return {
      product_id: product.id,
      tier,
      features,
    };
  } catch (error) {
    console.error('❌ Error getting product with features:', error);
    throw error;
  }
}

/**
 * Find entity (Municipality or Contractor) by subscription ID
 * @param {String} subscriptionId - Stripe subscription ID
 * @returns {Object} { entity, entityType, moduleName }
 */
async function findEntityBySubscription(subscriptionId) {
  try {
    // Check contractors first
    const contractor = await Contractor.findOne({
      'subscription.stripe_subscription_id': subscriptionId,
    });

    if (contractor) {
      return {
        entity: contractor,
        entityType: 'contractor',
        moduleName: null,
      };
    }

    // Check municipalities (need to search through modules Map)
    const municipalities = await Municipality.find({});

    for (const municipality of municipalities) {
      for (const [moduleName, moduleConfig] of municipality.module_config
        .modules) {
        if (moduleConfig.stripe_subscription_id === subscriptionId) {
          return {
            entity: municipality,
            entityType: 'municipality',
            moduleName,
          };
        }
      }
    }

    console.warn('⚠️  No entity found for subscription:', subscriptionId);
    return null;
  } catch (error) {
    console.error('❌ Error finding entity by subscription:', error);
    throw error;
  }
}

/**
 * Find entities using a specific product
 * @param {String} productId - Stripe product ID
 * @returns {Array} Array of { entity, entityType, moduleName }
 */
async function findEntitiesByProduct(productId) {
  try {
    const entities = [];

    // Check contractors
    const contractors = await Contractor.find({
      'subscription.stripe_product_id': productId,
    });

    contractors.forEach((contractor) => {
      entities.push({
        entity: contractor,
        entityType: 'contractor',
        moduleName: null,
      });
    });

    // Check municipalities
    const municipalities = await Municipality.find({});

    for (const municipality of municipalities) {
      for (const [moduleName, moduleConfig] of municipality.module_config
        .modules) {
        if (moduleConfig.stripe_product_id === productId) {
          entities.push({
            entity: municipality,
            entityType: 'municipality',
            moduleName,
          });
        }
      }
    }

    console.log(
      `✅ Found ${entities.length} entities using product ${productId}`,
    );
    return entities;
  } catch (error) {
    console.error('❌ Error finding entities by product:', error);
    throw error;
  }
}

/**
 * Handle subscription created/updated
 * @param {Object} subscription - Stripe subscription object
 */
async function handleSubscriptionChange(subscription) {
  try {
    console.log('🔵 Handling subscription change:', subscription.id);

    // Find the entity
    const result = await findEntityBySubscription(subscription.id);
    if (!result) {
      console.warn('⚠️  Subscription not linked to any entity');
      return;
    }

    const { entity, entityType, moduleName } = result;

    // Get product with features
    const { product_id, tier, features } =
      await getProductWithFeatures(subscription);

    // Prepare subscription data
    const subscriptionData = {
      stripe_subscription_id: subscription.id,
      stripe_product_id: product_id,
      stripe_price_id: subscription.items.data[0].price.id,
      status: subscription.status,
      features,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      paused_at:
        subscription.pause_collection?.behavior === 'void'
          ? new Date()
          : undefined,
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : undefined,
    };

    // Update entity based on type
    if (entityType === 'contractor') {
      subscriptionData.plan = tier;
      subscriptionData.trial_ends_at = subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : undefined;

      await entity.updateSubscription(subscriptionData);
      console.log('✅ Updated contractor subscription:', entity.company_name);
    } else if (entityType === 'municipality') {
      subscriptionData.tier = tier;

      await entity.updateModuleSubscription(moduleName, subscriptionData);
      console.log(
        `✅ Updated municipality module subscription: ${entity.name} - ${moduleName}`,
      );
    }
  } catch (error) {
    console.error('❌ Error handling subscription change:', error);
    throw error;
  }
}

/**
 * Handle subscription deleted
 * @param {Object} subscription - Stripe subscription object
 */
async function handleSubscriptionDeleted(subscription) {
  try {
    console.log('🔵 Handling subscription deleted:', subscription.id);

    const result = await findEntityBySubscription(subscription.id);
    if (!result) {
      console.warn('⚠️  Subscription not linked to any entity');
      return;
    }

    const { entity, entityType, moduleName } = result;

    const subscriptionData = {
      status: 'canceled',
      canceled_at: new Date(),
    };

    if (entityType === 'contractor') {
      await entity.updateSubscription(subscriptionData);
      console.log('✅ Marked contractor subscription as canceled');
    } else if (entityType === 'municipality') {
      await entity.updateModuleSubscription(moduleName, subscriptionData);
      console.log('✅ Marked municipality module subscription as canceled');
    }
  } catch (error) {
    console.error('❌ Error handling subscription deleted:', error);
    throw error;
  }
}

/**
 * Handle subscription paused
 * @param {Object} subscription - Stripe subscription object
 */
async function handleSubscriptionPaused(subscription) {
  try {
    console.log('🔵 Handling subscription paused:', subscription.id);

    const result = await findEntityBySubscription(subscription.id);
    if (!result) {
      console.warn('⚠️  Subscription not linked to any entity');
      return;
    }

    const { entity, entityType, moduleName } = result;

    const subscriptionData = {
      status: 'paused',
      paused_at: new Date(),
    };

    if (entityType === 'contractor') {
      await entity.updateSubscription(subscriptionData);
      console.log('✅ Marked contractor subscription as paused');
    } else if (entityType === 'municipality') {
      await entity.updateModuleSubscription(moduleName, subscriptionData);
      console.log('✅ Marked municipality module subscription as paused');
    }
  } catch (error) {
    console.error('❌ Error handling subscription paused:', error);
    throw error;
  }
}

/**
 * Handle subscription resumed
 * @param {Object} subscription - Stripe subscription object
 */
async function handleSubscriptionResumed(subscription) {
  try {
    console.log('🔵 Handling subscription resumed:', subscription.id);

    const result = await findEntityBySubscription(subscription.id);
    if (!result) {
      console.warn('⚠️  Subscription not linked to any entity');
      return;
    }

    const { entity, entityType, moduleName } = result;

    const subscriptionData = {
      status: 'active',
      paused_at: null,
    };

    if (entityType === 'contractor') {
      await entity.updateSubscription(subscriptionData);
      console.log('✅ Marked contractor subscription as active');
    } else if (entityType === 'municipality') {
      await entity.updateModuleSubscription(moduleName, subscriptionData);
      console.log('✅ Marked municipality module subscription as active');
    }
  } catch (error) {
    console.error('❌ Error handling subscription resumed:', error);
    throw error;
  }
}

/**
 * Handle product updated (features changed)
 * @param {Object} product - Stripe product object
 */
async function handleProductUpdated(product) {
  try {
    console.log('🔵 Handling product updated:', product.id);

    // Get updated features from Stripe Product Features API
    const productFeatures = await stripe.products.listFeatures(product.id);
    const features = productFeatures.data.map((feature) => feature.name);

    console.log('✅ Retrieved updated features:', features);

    // Find all entities using this product
    const entities = await findEntitiesByProduct(product.id);

    if (entities.length === 0) {
      console.log('⚠️  No entities using this product');
      return;
    }

    // Update features for each entity
    for (const { entity, entityType, moduleName } of entities) {
      if (entityType === 'contractor') {
        await entity.updateFeatures(features);
        console.log('✅ Updated contractor features:', entity.company_name);
      } else if (entityType === 'municipality') {
        await entity.updateModuleFeatures(moduleName, features);
        console.log(
          `✅ Updated municipality features: ${entity.name} - ${moduleName}`,
        );
      }
    }
  } catch (error) {
    console.error('❌ Error handling product updated:', error);
    throw error;
  }
}

/**
 * Handle customer updated
 * @param {Object} customer - Stripe customer object
 */
async function handleCustomerUpdated(customer) {
  try {
    console.log('🔵 Handling customer updated:', customer.id);

    // Check if customer has paused/resumed subscription
    if (customer.subscriptions?.data?.length > 0) {
      for (const subscription of customer.subscriptions.data) {
        // Check if pause status changed
        if (subscription.pause_collection?.behavior === 'void') {
          await handleSubscriptionPaused(subscription);
        } else if (subscription.status === 'active') {
          // Check if it was previously paused
          const result = await findEntityBySubscription(subscription.id);
          if (result) {
            const { entity, entityType, moduleName } = result;
            let wasPaused = false;

            if (entityType === 'contractor') {
              wasPaused = entity.subscription?.status === 'paused';
            } else if (entityType === 'municipality') {
              const module = entity.module_config.modules.get(moduleName);
              wasPaused = module?.subscription_status === 'paused';
            }

            if (wasPaused) {
              await handleSubscriptionResumed(subscription);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error handling customer updated:', error);
    // Don't throw - this is informational
  }
}

/**
 * Main webhook event handler
 * @param {Object} event - Stripe webhook event
 */
async function handleEvent(event) {
  try {
    console.log('🔔 Stripe webhook event received:', event.type);

    switch (event.type) {
      // Subscription lifecycle events
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'customer.subscription.paused':
        await handleSubscriptionPaused(event.data.object);
        break;

      case 'customer.subscription.resumed':
        await handleSubscriptionResumed(event.data.object);
        break;

      // Product feature updates
      case 'product.updated':
        await handleProductUpdated(event.data.object);
        break;

      // Customer updates (may include pause/resume info)
      case 'customer.updated':
        await handleCustomerUpdated(event.data.object);
        break;

      // Payment events (informational logging)
      case 'invoice.paid':
        console.log('✅ Invoice paid:', event.data.object.id);
        break;

      case 'invoice.payment_failed':
        console.log('❌ Invoice payment failed:', event.data.object.id);
        break;

      case 'payment_intent.succeeded':
        console.log('✅ Payment intent succeeded:', event.data.object.id);
        break;

      case 'payment_intent.payment_failed':
        console.log('❌ Payment intent failed:', event.data.object.id);
        break;

      default:
        console.log('ℹ️  Unhandled event type:', event.type);
    }
  } catch (error) {
    console.error('❌ Error handling webhook event:', error);
    throw error;
  }
}

module.exports = {
  handleEvent,
  getProductWithFeatures,
  findEntityBySubscription,
  findEntitiesByProduct,
  handleSubscriptionChange,
  handleSubscriptionDeleted,
  handleSubscriptionPaused,
  handleSubscriptionResumed,
  handleProductUpdated,
  handleCustomerUpdated,
};
