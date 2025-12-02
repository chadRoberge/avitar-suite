const express = require('express');
const router = express.Router();
const Contractor = require('../models/Contractor');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const stripeService = require('../services/stripeService');

/**
 * Middleware to check if user is contractor owner or has manage_team permission
 */
const checkContractorManagePermission = async (req, res, next) => {
  const { contractorId } = req.params;

  try {
    const contractor = await Contractor.findById(contractorId);
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    // Avitar staff can manage any contractor
    if (
      req.user.global_role === 'avitar_staff' ||
      req.user.global_role === 'avitar_admin'
    ) {
      req.contractor = contractor;
      return next();
    }

    // Check if user is owner or has manage_team permission
    if (
      contractor.isOwner(req.user._id) ||
      contractor.userHasPermission(req.user._id, 'manage_team')
    ) {
      req.contractor = contractor;
      return next();
    }

    return res
      .status(403)
      .json({ error: 'You do not have permission to manage this contractor' });
  } catch (error) {
    console.error('Error checking contractor permissions:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Middleware to check if user has access to view contractor
 */
const checkContractorViewPermission = async (req, res, next) => {
  const { contractorId } = req.params;

  try {
    const contractor = await Contractor.findById(contractorId);
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    // Avitar staff can view any contractor
    if (
      req.user.global_role === 'avitar_staff' ||
      req.user.global_role === 'avitar_admin'
    ) {
      req.contractor = contractor;
      return next();
    }

    // Check if user is a member of this contractor
    if (contractor.isMember(req.user._id) || contractor.isOwner(req.user._id)) {
      req.contractor = contractor;
      return next();
    }

    return res
      .status(403)
      .json({ error: 'You do not have access to this contractor' });
  } catch (error) {
    console.error('Error checking contractor permissions:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

// =====================================================
// PUBLIC ROUTES (for municipalities to search contractors)
// =====================================================

/**
 * GET /contractors/search
 * Search contractors by municipality (for permit application)
 */
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { municipalityId, search, verified_only } = req.query;

    if (!municipalityId) {
      return res.status(400).json({ error: 'Municipality ID is required' });
    }

    const query = {
      is_active: true,
      'municipality_approvals.municipality_id': municipalityId,
    };

    if (verified_only === 'true') {
      query.is_verified = true;
      query['municipality_approvals.status'] = 'approved';
    }

    let contractors = await Contractor.find(query)
      .populate('owner_user_id', 'first_name last_name email phone')
      .select(
        'company_name license_number license_state license_expiration specialties business_info is_verified municipality_approvals',
      )
      .sort({ company_name: 1 })
      .limit(100);

    // Filter to only show the specific municipality approval
    contractors = contractors.map((contractor) => {
      const contractorObj = contractor.toObject();
      contractorObj.municipality_approval =
        contractorObj.municipality_approvals.find(
          (a) => a.municipality_id.toString() === municipalityId,
        );
      delete contractorObj.municipality_approvals;
      return contractorObj;
    });

    // If search term provided, filter results
    if (search) {
      const searchLower = search.toLowerCase();
      contractors = contractors.filter(
        (c) =>
          c.company_name?.toLowerCase().includes(searchLower) ||
          c.license_number?.toLowerCase().includes(searchLower),
      );
    }

    res.json({ contractors });
  } catch (error) {
    console.error('Error searching contractors:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================================================
// CONTRACTOR PLAN ROUTES
// =====================================================

/**
 * GET /contractors/plans
 * Get available commercial subscription plans from Stripe
 */
router.get('/plans', authenticateToken, async (req, res) => {
  try {
    console.log('📦 GET /contractors/plans - Fetching commercial plans from Stripe');

    // Get all active products from Stripe with plan_type = commercial
    const products = await stripeService.stripe.products.list({
      active: true,
      limit: 100,
    });

    console.log(`   - Found ${products.data.length} total active products in Stripe`);

    // Log all product metadata for debugging
    products.data.forEach((product, index) => {
      console.log(`   Product ${index + 1}: ${product.name}`);
      console.log(`      - ID: ${product.id}`);
      console.log(`      - Metadata:`, product.metadata);
    });

    // Filter for commercial plans
    const commercialPlans = products.data.filter(
      (product) =>
        product.metadata &&
        product.metadata.plan_type === 'commercial' &&
        product.metadata.plan_key,
    );

    console.log(`   - Filtered to ${commercialPlans.length} commercial plans`);

    // Get prices for each plan
    const plansWithPricing = await Promise.all(
      commercialPlans.map(async (product) => {
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
          team_management: product.metadata.team_management === 'true',
          stored_payment_methods:
            product.metadata.stored_payment_methods === 'true',
          advanced_reporting: product.metadata.advanced_reporting === 'true',
          priority_support: product.metadata.priority_support === 'true',
          api_access: product.metadata.api_access === 'true',
          custom_branding: product.metadata.custom_branding === 'true',
          max_team_members:
            product.metadata.max_team_members === 'unlimited' ||
            product.metadata.max_team_members === '-1'
              ? -1
              : parseInt(product.metadata.max_team_members) || 1,
        };

        return {
          id: product.id,
          name: product.name,
          description: product.description || '',
          plan_key: product.metadata.plan_key, // free, premium, pro
          plan_type: product.metadata.plan_type, // commercial
          features: displayFeatures, // For display in UI
          feature_flags: structuredFeatures, // Structured feature data
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

    console.log('✅ Returning plans to client:');
    plansWithPricing.forEach((plan, index) => {
      console.log(`   Plan ${index + 1}: ${plan.name} (${plan.plan_key})`);
      console.log(`      - Pricing: ${plan.pricing ? `$${plan.pricing.amount}/${plan.pricing.interval}` : 'Free'}`);
      console.log(`      - Features: ${plan.features.length} items`);
    });

    res.json({ plans: plansWithPricing });
  } catch (error) {
    console.error('Error fetching commercial plans:', error);
    res.status(500).json({
      error: 'Failed to fetch subscription plans',
      message: error.message,
    });
  }
});

// =====================================================
// CONTRACTOR CRUD ROUTES
// =====================================================

/**
 * POST /contractors
 * Create a new contractor (for new contractor registration)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      company_name,
      license_number,
      license_state,
      license_expiration,
      license_type,
      business_info,
      specialties,
      insurance_info,
      selected_plan, // { plan_key: 'free', product_id: 'prod_xxx', price_id: 'price_xxx' }
    } = req.body;

    // Validation
    if (
      !company_name ||
      !license_number ||
      !license_state ||
      !license_expiration
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if license already exists
    const existing = await Contractor.findOne({
      license_number,
      license_state,
    });
    if (existing) {
      return res.status(400).json({
        error: 'A contractor with this license number already exists',
      });
    }

    // Get plan details from Stripe to extract features
    const planKey = selected_plan?.plan_key || 'free';
    const isFree = planKey === 'free';
    let planFeatures = {};
    let ownerPermissions = ['submit_permits', 'view_all_permits', 'view_own_permits'];

    if (selected_plan?.product_id) {
      try {
        // Fetch the full product from Stripe to get features
        const stripeProduct = await stripeService.stripe.products.retrieve(
          selected_plan.product_id,
        );

        console.log('📦 Stripe Product Features:', stripeProduct);

        // Parse features from Stripe product metadata
        if (stripeProduct.metadata) {
          // Extract boolean features
          planFeatures.team_management =
            stripeProduct.metadata.team_management === 'true';
          planFeatures.stored_payment_methods =
            stripeProduct.metadata.stored_payment_methods === 'true';
          planFeatures.advanced_reporting =
            stripeProduct.metadata.advanced_reporting === 'true';
          planFeatures.priority_support =
            stripeProduct.metadata.priority_support === 'true';
          planFeatures.api_access = stripeProduct.metadata.api_access === 'true';
          planFeatures.custom_branding =
            stripeProduct.metadata.custom_branding === 'true';

          // Extract numeric features
          const maxTeamMembers = stripeProduct.metadata.max_team_members;
          planFeatures.max_team_members =
            maxTeamMembers === 'unlimited' || maxTeamMembers === '-1'
              ? -1
              : parseInt(maxTeamMembers) || 1;

          // Add permissions based on features
          if (planFeatures.team_management) {
            ownerPermissions.push('manage_team');
          }
          if (
            planFeatures.team_management ||
            planFeatures.stored_payment_methods
          ) {
            ownerPermissions.push('manage_company_info');
          }
        }

        console.log('✅ Parsed Plan Features:', planFeatures);
      } catch (productError) {
        console.error('⚠️  Error fetching Stripe product:', productError);
        // Fallback to minimal features if Stripe fetch fails
        planFeatures = {
          team_management: false,
          stored_payment_methods: false,
          advanced_reporting: false,
          priority_support: false,
          api_access: false,
          custom_branding: false,
          max_team_members: 1,
        };
      }
    } else {
      // No plan selected or free plan - minimal features
      planFeatures = {
        team_management: false,
        stored_payment_methods: false,
        advanced_reporting: false,
        priority_support: false,
        api_access: false,
        custom_branding: false,
        max_team_members: 1,
      };
    }

    // Create contractor with selected subscription plan
    const contractor = new Contractor({
      company_name,
      license_number,
      license_state,
      license_expiration,
      license_type: license_type || 'general_contractor',
      business_info: business_info || {},
      specialties: specialties || [],
      insurance_info: insurance_info || {},
      owner_user_id: req.user._id,
      members: [
        {
          user_id: req.user._id,
          role: 'owner',
          permissions: ownerPermissions,
          title: 'Owner',
          added_by: req.user._id,
        },
      ],
      created_by: req.user._id,
      is_active: true,
      is_verified: false,
      // Initialize with selected plan features from Stripe
      subscription: {
        plan: planKey,
        status: planKey === 'free' ? 'active' : 'inactive', // Will be updated after Stripe subscription
        current_period_start: new Date(),
        features: planFeatures,
      },
    });

    await contractor.save();

    // Create Stripe customer for the contractor
    let stripeCustomer = null;
    try {
      stripeCustomer = await stripeService.createCustomer(
        contractor,
        req.user,
      );

      // Update contractor with Stripe customer ID
      contractor.subscription.stripe_customer_id = stripeCustomer.id;
      await contractor.save();

      console.log(
        `✅ Stripe customer created for contractor ${contractor._id}: ${stripeCustomer.id}`,
      );
    } catch (stripeError) {
      console.error(
        '⚠️  Failed to create Stripe customer for contractor:',
        stripeError,
      );
      // Don't fail contractor creation if Stripe fails
    }

    // Create Stripe subscription for ALL plans (including Free $0/month)
    let stripeSubscription = null;
    if (stripeCustomer && selected_plan?.price_id) {
      try {
        console.log(`🔵 Creating Stripe subscription for plan: ${planKey} (${isFree ? '$0/month' : 'paid'})`);

        stripeSubscription = await stripeService.createSubscription(
          stripeCustomer.id,
          selected_plan.price_id,
        );

        // Update contractor with subscription details
        contractor.subscription.stripe_subscription_id = stripeSubscription.id;
        contractor.subscription.stripe_product_id = selected_plan.product_id;
        contractor.subscription.status = stripeService.mapSubscriptionStatus(
          stripeSubscription.status,
        );

        if (stripeSubscription.current_period_start) {
          contractor.subscription.current_period_start = new Date(
            stripeSubscription.current_period_start * 1000,
          );
        }
        if (stripeSubscription.current_period_end) {
          contractor.subscription.current_period_end = new Date(
            stripeSubscription.current_period_end * 1000,
          );
        }

        await contractor.save();

        console.log(
          `✅ Stripe subscription created for contractor ${contractor._id}: ${stripeSubscription.id} (${planKey})`,
        );
      } catch (subscriptionError) {
        console.error(
          '⚠️  Failed to create Stripe subscription:',
          subscriptionError,
        );
        // Subscription creation failed - they'll need to set it up manually later
      }
    } else if (stripeCustomer) {
      // No price_id provided - log warning
      console.warn(`⚠️  No price_id provided for contractor ${contractor._id}, subscription not created`);
    }

    // Update user to link to contractor
    await User.findByIdAndUpdate(req.user._id, {
      global_role: 'contractor',
      contractor_id: contractor._id,
    });

    res.status(201).json({
      contractor,
      subscription: stripeSubscription
        ? {
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            client_secret: stripeSubscription.latest_invoice?.payment_intent
              ?.client_secret,
          }
        : null,
    });
  } catch (error) {
    console.error('Error creating contractor:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * GET /contractors/:contractorId
 * Get contractor details
 */
router.get(
  '/:contractorId',
  authenticateToken,
  checkContractorViewPermission,
  async (req, res) => {
    try {
      const contractor = await Contractor.findById(req.params.contractorId)
        .populate('owner_user_id', 'first_name last_name email phone')
        .populate('members.user_id', 'first_name last_name email')
        .populate('members.added_by', 'first_name last_name')
        .populate('created_by', 'first_name last_name')
        .populate('updated_by', 'first_name last_name');

      res.json({ contractor });
    } catch (error) {
      console.error('Error fetching contractor:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

/**
 * PUT /contractors/:contractorId
 * Update contractor information
 */
router.put(
  '/:contractorId',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      const {
        company_name,
        license_number,
        license_state,
        license_expiration,
        license_type,
        business_info,
        specialties,
        insurance_info,
        years_in_business,
        employee_count,
        bonded,
      } = req.body;

      const updates = {};

      if (company_name) updates.company_name = company_name;
      if (license_number) updates.license_number = license_number;
      if (license_state) updates.license_state = license_state;
      if (license_expiration) updates.license_expiration = license_expiration;
      if (license_type) updates.license_type = license_type;
      if (business_info) updates.business_info = business_info;
      if (specialties) updates.specialties = specialties;
      if (insurance_info) updates.insurance_info = insurance_info;
      if (years_in_business !== undefined)
        updates.years_in_business = years_in_business;
      if (employee_count !== undefined) updates.employee_count = employee_count;
      if (bonded !== undefined) updates.bonded = bonded;

      updates.updated_by = req.user._id;

      const contractor = await Contractor.findByIdAndUpdate(
        req.params.contractorId,
        updates,
        { new: true, runValidators: true },
      )
        .populate('owner_user_id', 'first_name last_name email phone')
        .populate('members.user_id', 'first_name last_name email');

      res.json({ contractor });
    } catch (error) {
      console.error('Error updating contractor:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  },
);

/**
 * DELETE /contractors/:contractorId
 * Deactivate contractor
 */
router.delete(
  '/:contractorId',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      // Only owner or Avitar staff can delete
      if (
        !req.contractor.isOwner(req.user._id) &&
        req.user.global_role !== 'avitar_staff' &&
        req.user.global_role !== 'avitar_admin'
      ) {
        return res.status(403).json({
          error: 'Only the contractor owner can deactivate the company',
        });
      }

      await Contractor.findByIdAndUpdate(req.params.contractorId, {
        is_active: false,
        updated_by: req.user._id,
      });

      res.json({ message: 'Contractor deactivated successfully' });
    } catch (error) {
      console.error('Error deactivating contractor:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// =====================================================
// TEAM MEMBER MANAGEMENT
// =====================================================

/**
 * POST /contractors/:contractorId/members
 * Add team member to contractor
 */
router.post(
  '/:contractorId/members',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      const { email, role, permissions, title } = req.body;

      if (!email || !role) {
        return res.status(400).json({ error: 'Email and role are required' });
      }

      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res
          .status(404)
          .json({ error: 'User not found. They must register first.' });
      }

      // Check if already a member
      if (req.contractor.isMember(user._id)) {
        return res.status(400).json({ error: 'User is already a team member' });
      }

      await req.contractor.addMember(
        user._id,
        role,
        permissions || [],
        req.user._id,
        title,
      );

      // Update user's contractor_id and global_role if not already set
      if (!user.contractor_id) {
        user.contractor_id = req.contractor._id;
        user.global_role = 'contractor';
        await user.save();
      }

      const updatedContractor = await Contractor.findById(
        req.params.contractorId,
      )
        .populate('members.user_id', 'first_name last_name email')
        .populate('members.added_by', 'first_name last_name');

      res.json({ contractor: updatedContractor });
    } catch (error) {
      console.error('Error adding team member:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  },
);

/**
 * PUT /contractors/:contractorId/members/:userId
 * Update team member permissions/role
 */
router.put(
  '/:contractorId/members/:userId',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      const { role, permissions, title } = req.body;

      const member = req.contractor.members.find(
        (m) => m.user_id.toString() === req.params.userId,
      );

      if (!member) {
        return res.status(404).json({ error: 'Team member not found' });
      }

      // Cannot change owner role
      if (member.role === 'owner') {
        return res.status(400).json({ error: 'Cannot modify owner role' });
      }

      if (role) member.role = role;
      if (permissions) member.permissions = permissions;
      if (title !== undefined) member.title = title;

      await req.contractor.save();

      const updatedContractor = await Contractor.findById(
        req.params.contractorId,
      )
        .populate('members.user_id', 'first_name last_name email')
        .populate('members.added_by', 'first_name last_name');

      res.json({ contractor: updatedContractor });
    } catch (error) {
      console.error('Error updating team member:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  },
);

/**
 * DELETE /contractors/:contractorId/members/:userId
 * Remove team member from contractor
 */
router.delete(
  '/:contractorId/members/:userId',
  authenticateToken,
  checkContractorManagePermission,
  async (req, res) => {
    try {
      // Cannot remove owner
      if (req.contractor.isOwner(req.params.userId)) {
        return res
          .status(400)
          .json({ error: 'Cannot remove contractor owner' });
      }

      await req.contractor.removeMember(req.params.userId);

      // Update user to remove contractor_id
      await User.findByIdAndUpdate(req.params.userId, {
        contractor_id: null,
        global_role: 'citizen',
      });

      res.json({ message: 'Team member removed successfully' });
    } catch (error) {
      console.error('Error removing team member:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },
);

// =====================================================
// BILLING AND SUBSCRIPTION MANAGEMENT
// =====================================================

/**
 * GET /contractors/:contractorId/billing-history
 * Get billing history (invoices) from Stripe for contractor
 */
router.get(
  '/:contractorId/billing-history',
  authenticateToken,
  checkContractorViewPermission,
  async (req, res) => {
    try {
      const contractor = req.contractor;

      // Check if contractor has a Stripe customer ID
      if (!contractor.subscription?.stripe_customer_id) {
        return res.json({ invoices: [] });
      }

      // Fetch invoices from Stripe
      const invoices = await stripeService.stripe.invoices.list({
        customer: contractor.subscription.stripe_customer_id,
        limit: 100, // Get last 100 invoices
      });

      // Transform invoice data for frontend
      const transformedInvoices = invoices.data.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        amount_paid: (invoice.amount_paid / 100).toFixed(2), // Convert from cents to dollars
        amount_due: (invoice.amount_due / 100).toFixed(2),
        currency: invoice.currency.toUpperCase(),
        status: invoice.status, // paid, open, void, uncollectible
        created: invoice.created, // Unix timestamp
        period_start: invoice.period_start, // Unix timestamp
        period_end: invoice.period_end, // Unix timestamp
        invoice_pdf: invoice.invoice_pdf, // URL to PDF
        hosted_invoice_url: invoice.hosted_invoice_url, // URL to hosted invoice page
        description: invoice.description || '',
      }));

      res.json({ invoices: transformedInvoices });
    } catch (error) {
      console.error('Error fetching billing history:', error);
      res.status(500).json({
        error: 'Failed to fetch billing history',
        message: error.message,
      });
    }
  },
);

// =====================================================
// MUNICIPALITY APPROVALS
// =====================================================

/**
 * POST /contractors/:contractorId/municipality-approvals
 * Request approval from municipality (or approve if staff)
 */
router.post(
  '/:contractorId/municipality-approvals',
  authenticateToken,
  checkContractorViewPermission,
  async (req, res) => {
    try {
      const { municipalityId, municipalityName, registrationNumber } = req.body;

      if (!municipalityId || !municipalityName) {
        return res
          .status(400)
          .json({ error: 'Municipality ID and name are required' });
      }

      // Check if user is municipal staff for this municipality (they can approve)
      const isMunicipalStaff =
        req.user.hasAccessToMunicipality(municipalityId) &&
        (req.user.global_role === 'municipal_user' ||
          req.user.global_role === 'avitar_staff' ||
          req.user.global_role === 'avitar_admin');

      const approvedBy = isMunicipalStaff ? req.user._id : null;

      await req.contractor.addMunicipalityApproval(
        municipalityId,
        municipalityName,
        approvedBy,
        registrationNumber,
      );

      res.json({
        message: isMunicipalStaff
          ? 'Contractor approved for municipality'
          : 'Approval request submitted',
      });
    } catch (error) {
      console.error('Error managing municipality approval:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  },
);

module.exports = router;
