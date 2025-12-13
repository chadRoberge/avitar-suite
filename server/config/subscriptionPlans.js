/**
 * Subscription Plans Configuration
 *
 * NOTE: This configuration is primarily for backward compatibility and reference.
 * The actual source of truth for plans and features is Stripe product metadata.
 * The /contractors/plans endpoint fetches plans directly from Stripe.
 *
 * When updating subscription features, update the Stripe product metadata in Stripe Dashboard:
 * - plan_key: 'free', 'pro', 'professional', 'enterprise'
 * - plan_type: 'commercial'
 * - team_management: 'true' or 'false'
 * - stored_payment_methods: 'true' or 'false'
 * - advanced_reporting: 'true' or 'false'
 * - priority_support: 'true' or 'false'
 * - api_access: 'true' or 'false'
 * - custom_branding: 'true' or 'false'
 * - max_team_members: number or 'unlimited' or '-1'
 */

const SUBSCRIPTION_PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    billing_period: null,
    stripe_price_id: null, // No Stripe ID for free plan
    features: {
      team_management: false,
      stored_payment_methods: false,
      advanced_reporting: false,
      priority_support: false,
      api_access: false,
      custom_branding: false,
      max_team_members: 1, // Owner only
      max_permits_per_month: 5,
      permit_fee_discount: 0, // No discount
    },
    description: 'Perfect for getting started',
    tagline: 'Basic Features',
  },

  basic: {
    id: 'basic',
    name: 'Basic',
    price: 29, // $29/month
    billing_period: 'month',
    stripe_price_id: process.env.STRIPE_PRICE_ID_BASIC_MONTHLY, // Set via environment
    features: {
      team_management: true,
      stored_payment_methods: true,
      advanced_reporting: false,
      priority_support: false,
      api_access: false,
      custom_branding: false,
      max_team_members: 5,
      max_permits_per_month: 25,
      permit_fee_discount: 0, // No discount
    },
    description: 'Great for small teams',
    tagline: 'Team Collaboration',
    popular: false,
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    price: 10, // $10/month
    billing_period: 'month',
    stripe_price_id: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    features: {
      team_management: true,
      stored_payment_methods: true,
      advanced_reporting: false,
      priority_support: false,
      api_access: false,
      custom_branding: false,
      max_team_members: 5,
      max_permits_per_month: 50,
      permit_fee_discount: 0,
    },
    description: 'For small teams',
    tagline: 'Essential Features',
    popular: false,
  },

  professional: {
    id: 'professional',
    name: 'Professional',
    price: 79, // $79/month
    billing_period: 'month',
    stripe_price_id: process.env.STRIPE_PRICE_ID_PROFESSIONAL_MONTHLY,
    features: {
      team_management: true,
      stored_payment_methods: true,
      advanced_reporting: true,
      priority_support: true,
      api_access: false,
      custom_branding: false,
      max_team_members: 20,
      max_permits_per_month: 100,
      permit_fee_discount: 10, // 10% discount on permit fees
    },
    description: 'For growing contractors',
    tagline: 'Advanced Features',
    popular: true, // Mark as most popular
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199, // $199/month
    billing_period: 'month',
    stripe_price_id: process.env.STRIPE_PRICE_ID_ENTERPRISE_MONTHLY,
    features: {
      team_management: true,
      stored_payment_methods: true,
      advanced_reporting: true,
      priority_support: true,
      api_access: true,
      custom_branding: true,
      max_team_members: -1, // Unlimited
      max_permits_per_month: -1, // Unlimited
      permit_fee_discount: 15, // 15% discount on permit fees
    },
    description: 'For large organizations',
    tagline: 'Complete Solution',
    popular: false,
  },
};

/**
 * Feature definitions with user-friendly labels and descriptions
 */
const FEATURE_DEFINITIONS = {
  team_management: {
    name: 'Team Management',
    description: 'Add and manage team members with role-based permissions',
    icon: 'users',
  },
  stored_payment_methods: {
    name: 'Stored Payment Methods',
    description: 'Securely store payment methods for quick permit payments',
    icon: 'credit-card',
  },
  advanced_reporting: {
    name: 'Advanced Reporting',
    description: 'Detailed analytics and custom reports for your permits',
    icon: 'chart-bar',
  },
  priority_support: {
    name: 'Priority Support',
    description: '24/7 priority customer support via phone and email',
    icon: 'headset',
  },
  api_access: {
    name: 'API Access',
    description: 'RESTful API for integrating with your own systems',
    icon: 'code',
  },
  custom_branding: {
    name: 'Custom Branding',
    description: 'White-label solution with your company branding',
    icon: 'palette',
  },
  max_team_members: {
    name: 'Team Members',
    description: 'Number of team members you can add',
    icon: 'user-plus',
  },
  max_permits_per_month: {
    name: 'Monthly Permits',
    description: 'Number of permits you can submit per month',
    icon: 'file-alt',
  },
  permit_fee_discount: {
    name: 'Permit Fee Discount',
    description: 'Discount on municipal permit fees',
    icon: 'percentage',
  },
};

/**
 * Get all subscription plans
 */
function getAllPlans() {
  return Object.values(SUBSCRIPTION_PLANS);
}

/**
 * Get a specific plan by ID
 */
function getPlan(planId) {
  return SUBSCRIPTION_PLANS[planId] || null;
}

/**
 * Get plan by Stripe price ID
 */
function getPlanByStripePriceId(stripePriceId) {
  return Object.values(SUBSCRIPTION_PLANS).find(
    (plan) => plan.stripe_price_id === stripePriceId,
  );
}

/**
 * Check if a feature is available in a plan
 */
function planHasFeature(planId, featureName) {
  const plan = getPlan(planId);
  if (!plan) return false;

  const featureValue = plan.features[featureName];

  // For boolean features
  if (typeof featureValue === 'boolean') {
    return featureValue;
  }

  // For numeric features (like max_team_members)
  // -1 means unlimited
  if (typeof featureValue === 'number') {
    return featureValue > 0 || featureValue === -1;
  }

  return false;
}

/**
 * Get feature value for a plan
 */
function getFeatureValue(planId, featureName) {
  const plan = getPlan(planId);
  if (!plan) return null;

  return plan.features[featureName];
}

/**
 * Compare two plans and return upgrade benefits
 */
function getUpgradeBenefits(fromPlanId, toPlanId) {
  const fromPlan = getPlan(fromPlanId);
  const toPlan = getPlan(toPlanId);

  if (!fromPlan || !toPlan) return [];

  const benefits = [];

  // Compare each feature
  Object.keys(toPlan.features).forEach((featureName) => {
    const fromValue = fromPlan.features[featureName];
    const toValue = toPlan.features[featureName];
    const featureDef = FEATURE_DEFINITIONS[featureName];

    // Boolean features
    if (typeof toValue === 'boolean' && toValue && !fromValue) {
      benefits.push({
        feature: featureName,
        name: featureDef?.name || featureName,
        description: featureDef?.description,
        type: 'new_feature',
      });
    }

    // Numeric features (increased limits)
    if (typeof toValue === 'number' && toValue > fromValue) {
      benefits.push({
        feature: featureName,
        name: featureDef?.name || featureName,
        description: featureDef?.description,
        type: 'increased_limit',
        from: fromValue,
        to: toValue,
      });
    }
  });

  return benefits;
}

module.exports = {
  SUBSCRIPTION_PLANS,
  FEATURE_DEFINITIONS,
  getAllPlans,
  getPlan,
  getPlanByStripePriceId,
  planHasFeature,
  getFeatureValue,
  getUpgradeBenefits,
};
