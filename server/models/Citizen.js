const mongoose = require('mongoose');

/**
 * Citizen Model
 *
 * Represents a residential user's account for building permit submissions.
 * Similar to Contractor model but for individual homeowners/citizens.
 *
 * The User model links to this via citizen_id for users with global_role: 'citizen'
 */
const citizenSchema = new mongoose.Schema(
  {
    // Link to the User account
    owner_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // Contact Information (may differ from User's email/phone)
    contact_info: {
      phone: {
        type: String,
        trim: true,
      },
      alternate_email: {
        type: String,
        lowercase: true,
        trim: true,
      },
    },

    // Primary Address (homeowner's property)
    primary_address: {
      street: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
        uppercase: true,
        maxlength: 2,
      },
      zip: {
        type: String,
        trim: true,
      },
    },

    // Properties owned (for future use - linking to Property model)
    properties: [
      {
        property_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Property',
        },
        municipality_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Municipality',
        },
        municipality_name: String,
        address: String,
        is_primary: {
          type: Boolean,
          default: false,
        },
        added_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Subscription and Features
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'basic', 'pro', 'professional'],
        default: 'free',
      },
      status: {
        type: String,
        enum: [
          'active',
          'trialing',
          'past_due',
          'canceled',
          'paused',
          'incomplete',
          'incomplete_expired',
          'inactive',
        ],
        default: 'active', // Citizens start active on free plan
      },
      trial_ends_at: Date,
      current_period_start: Date,
      current_period_end: Date,
      canceled_at: Date,
      stripe_customer_id: String,
      stripe_subscription_id: String,
      stripe_product_id: String,
      stripe_price_id: String,
      // Features from Stripe Product Features API
      features: {
        type: [String],
        default: [],
      },
      features_last_synced: Date,
    },

    // Payment Methods (for permit payments)
    payment_methods: [
      {
        stripe_payment_method_id: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ['card', 'bank_account'],
          default: 'card',
        },
        is_default: {
          type: Boolean,
          default: false,
        },
        card_brand: String, // visa, mastercard, amex, etc.
        card_last4: String,
        card_exp_month: Number,
        card_exp_year: Number,
        billing_name: String,
        billing_address: {
          street: String,
          city: String,
          state: String,
          zip: String,
          country: String,
        },
        added_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Preferred Contractors (future feature)
    preferred_contractors: [
      {
        contractor_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Contractor',
        },
        contractor_name: String,
        added_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Status
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Notes and History
    internal_notes: [
      {
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        author_name: String,
        note: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'citizens',
  },
);

// Indexes
citizenSchema.index({ 'subscription.stripe_customer_id': 1 }, { sparse: true });
citizenSchema.index({ 'subscription.status': 1 });

// Virtual for getting owner user
citizenSchema.virtual('owner', {
  ref: 'User',
  localField: 'owner_user_id',
  foreignField: '_id',
  justOne: true,
});

// Method to check subscription feature
citizenSchema.methods.hasFeature = function (featureName) {
  return this.subscription.features?.includes(featureName) || false;
};

// Method to check if subscription is active
citizenSchema.methods.isSubscriptionActive = function () {
  return ['active', 'trialing'].includes(this.subscription.status);
};

// Method to get default payment method
citizenSchema.methods.getDefaultPaymentMethod = function () {
  return this.payment_methods.find((pm) => pm.is_default) || null;
};

// Method to add a property
citizenSchema.methods.addProperty = function (propertyData) {
  // If this is marked as primary, unmark other primary properties
  if (propertyData.is_primary) {
    this.properties.forEach((p) => {
      p.is_primary = false;
    });
  }

  this.properties.push({
    ...propertyData,
    added_at: new Date(),
  });

  return this.save();
};

// Method to remove a property
citizenSchema.methods.removeProperty = function (propertyId) {
  this.properties = this.properties.filter(
    (p) => p.property_id.toString() !== propertyId.toString(),
  );
  return this.save();
};

// Static method to find by Stripe customer ID
citizenSchema.statics.findByStripeCustomerId = function (stripeCustomerId) {
  return this.findOne({ 'subscription.stripe_customer_id': stripeCustomerId });
};

// Static method to find active citizens
citizenSchema.statics.findActive = function () {
  return this.find({ is_active: true });
};

module.exports = mongoose.model('Citizen', citizenSchema);
