const mongoose = require('mongoose');

// Optimized for PID tree display and minimal storage
const propertyTreeSchema = new mongoose.Schema(
  {
    municipality_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      index: true,
    },

    // Essential identifiers
    pid_raw: {
      type: String,
      required: true,
      index: true,
      minlength: 18,
      maxlength: 18,
    }, // 18-digit raw PID
    pid_formatted: { type: String, index: true }, // Municipality-formatted display PID
    account_number: { type: String, index: true }, // Municipal account #

    // Tree display essentials
    location: {
      street: { type: String, index: true }, // For grouping
      street_number: String,
      address: String, // Full display address
      neighborhood: { type: String, index: true }, // For user filtering
      zone: String,
    },

    // Owner info (minimal for tree display)
    owner: {
      primary_name: { type: String, index: true }, // For grouping/search
      mailing_address: String, // For quick reference
      properties_count: Number, // Denormalized count for display
      owner_id: { type: String, index: true }, // Link to full owner record
    },

    // New owners structure (relational data cached for performance)
    owners: {
      primary: {
        owner_id: String,
        primary_name: String,
        first_name: String,
        last_name: String,
        business_name: String,
        owner_type: String,
        email: String,
        phone: String,
        mailing_street: String,
        mailing_city: String,
        mailing_state: String,
        mailing_zipcode: String,
        mailing_address: String,
        ownership_percentage: Number,
        ownership_type: String,
        receives_tax_bills: Boolean,
        receives_notices: Boolean,
        notes: String,
        is_primary: Boolean,
        additional_owner: Boolean,
        mail_to: Boolean,
        bill_copy: Boolean,
      },
      additional_owners: [
        {
          owner_id: String,
          owner_name: String,
          first_name: String,
          last_name: String,
          business_name: String,
          owner_type: String,
          email: String,
          phone: String,
          mailing_street: String,
          mailing_city: String,
          mailing_state: String,
          mailing_zipcode: String,
          mailing_address: String,
          ownership_percentage: Number,
          ownership_type: String,
          receives_tax_bills: Boolean,
          receives_notices: Boolean,
          notes: String,
          is_primary: Boolean,
          additional_owner: Boolean,
          mail_to: Boolean,
          bill_copy: Boolean,
        },
      ],
    },

    // Essential property info
    property_class: { type: String, index: true }, // R, C, I, U, etc.
    property_type: String, // SFR, Condo, Commercial, etc.

    // DEPRECATED: Use assessment_summary instead (kept for backward compatibility)
    assessed_value: Number, // Current year total assessed value (denormalized)

    // NEW: Comprehensive assessment summary (updated by ParcelAssessment)
    assessment_summary: {
      total_value: { type: Number, default: 0 },
      land_value: { type: Number, default: 0 },
      building_value: { type: Number, default: 0 },
      improvements_value: { type: Number, default: 0 },
      last_updated: { type: Date },
      assessment_year: { type: Number },
    },

    tax_status: {
      type: String,
      enum: ['taxable', 'exempt', 'abated'],
      default: 'taxable',
    },

    // Module-specific flags for filtering
    module_flags: {
      has_building_permits: { type: Boolean, default: false, index: true },
      has_recent_permits: { type: Boolean, default: false },
      has_pending_appeals: { type: Boolean, default: false, index: true },
      has_liens: { type: Boolean, default: false, index: true },
      needs_inspection: { type: Boolean, default: false },
      is_new_construction: { type: Boolean, default: false },
    },

    // User assignment for data collectors
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    // Property notes
    notes: String,

    // Multi-card support (NO LIMIT - supports unlimited cards per parcel)
    cards: {
      total_cards: { type: Number, default: 1, min: 1 }, // Removed max limit
      active_card: { type: Number, default: 1 },
      card_descriptions: [
        {
          card_number: { type: Number, required: true },
          description: { type: String, default: '' },
          created_date: { type: Date, default: Date.now },
          created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        },
      ],
    },

    // Minimal timestamps
    last_updated: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'property_tree_nodes',
  },
);

// Compound indexes for common queries
propertyTreeSchema.index({ municipality_id: 1, 'location.street': 1 });
propertyTreeSchema.index({ municipality_id: 1, 'owner.primary_name': 1 });
propertyTreeSchema.index({ municipality_id: 1, assigned_to: 1 });
propertyTreeSchema.index({
  municipality_id: 1,
  'module_flags.has_pending_appeals': 1,
});

// Virtual for backward compatibility - uses formatted PID
propertyTreeSchema.virtual('pid').get(function () {
  return this.pid_formatted || this.pid_raw;
});

// Virtual for PID components (extracted from raw PID using format)
propertyTreeSchema.virtual('mapNumber').get(function () {
  if (this.populated('pidFormat') && this.pidFormat) {
    const segments = this.pidFormat.getSegments(this.pid_raw);
    return segments.map || null;
  }
  // Fallback: assume first 6 digits are map
  return this.pid_raw ? this.pid_raw.substr(0, 6) : null;
});

propertyTreeSchema.virtual('lotNumber').get(function () {
  if (this.populated('pidFormat') && this.pidFormat) {
    const segments = this.pidFormat.getSegments(this.pid_raw);
    return segments.lot || null;
  }
  // Fallback: assume digits 6-12 are lot
  return this.pid_raw ? this.pid_raw.substr(6, 6) : null;
});

propertyTreeSchema.virtual('subLot').get(function () {
  if (this.populated('pidFormat') && this.pidFormat) {
    const segments = this.pidFormat.getSegments(this.pid_raw);
    return segments.sublot && parseInt(segments.sublot) > 0
      ? segments.sublot
      : null;
  }
  // Fallback: assume digits 12-18 are sublot
  const sublot = this.pid_raw ? this.pid_raw.substr(12, 6) : null;
  return sublot && parseInt(sublot) > 0 ? sublot : null;
});

// Virtual for display name based on grouping
propertyTreeSchema.virtual('displayName').get(function () {
  return this.location.address || `PID: ${this.pid}`;
});

// Method to format PID using municipality's format
propertyTreeSchema.methods.formatPID = async function (pidFormat) {
  if (!pidFormat) {
    const PIDFormat = require('./PIDFormat');
    pidFormat = await PIDFormat.findOne({
      municipality_id: this.municipality_id,
    });
  }

  if (pidFormat) {
    this.pid_formatted = pidFormat.formatPID(this.pid_raw);
  } else {
    // Default format: 6-6-6 with hyphens
    const map = this.pid_raw.substr(0, 6);
    const lot = this.pid_raw.substr(6, 6);
    const sublot = this.pid_raw.substr(12, 6);

    if (parseInt(sublot) > 0) {
      this.pid_formatted = `${map}-${lot}-${sublot}`;
    } else {
      this.pid_formatted = `${map}-${lot}`;
    }
  }

  return this.pid_formatted;
};

// Method to get all PID segments
propertyTreeSchema.methods.getPIDSegments = async function (pidFormat) {
  if (!pidFormat) {
    const PIDFormat = require('./PIDFormat');
    pidFormat = await PIDFormat.findOne({
      municipality_id: this.municipality_id,
    });
  }

  if (pidFormat) {
    return pidFormat.getSegments(this.pid_raw);
  }

  // Default segments
  return {
    map: this.pid_raw.substr(0, 6),
    lot: this.pid_raw.substr(6, 6),
    sublot: this.pid_raw.substr(12, 6),
  };
};

// Method to add a new card (NO LIMIT - supports unlimited cards)
propertyTreeSchema.methods.addCard = function (
  description = '',
  userId = null,
) {
  const newCardNumber = this.cards.total_cards + 1;

  this.cards.total_cards = newCardNumber;
  this.cards.card_descriptions.push({
    card_number: newCardNumber,
    description: description,
    created_by: userId,
  });

  return this.save();
};

// Method to remove a card (only if it's not the last card)
propertyTreeSchema.methods.removeCard = function (cardNumber) {
  if (this.cards.total_cards <= 1) {
    throw new Error('Cannot remove the last card');
  }

  if (cardNumber < 1 || cardNumber > this.cards.total_cards) {
    throw new Error('Invalid card number');
  }

  // Remove the card description
  this.cards.card_descriptions = this.cards.card_descriptions.filter(
    (card) => card.card_number !== cardNumber,
  );

  // Renumber remaining cards
  this.cards.card_descriptions.forEach((card, index) => {
    card.card_number = index + 1;
  });

  this.cards.total_cards -= 1;

  // Adjust active card if necessary
  if (this.cards.active_card > this.cards.total_cards) {
    this.cards.active_card = this.cards.total_cards;
  }

  return this.save();
};

// Method to update card description
propertyTreeSchema.methods.updateCardDescription = function (
  cardNumber,
  description,
) {
  const card = this.cards.card_descriptions.find(
    (c) => c.card_number === cardNumber,
  );
  if (!card) {
    throw new Error('Card not found');
  }

  card.description = description;
  return this.save();
};

// Method to set active card
propertyTreeSchema.methods.setActiveCard = function (cardNumber) {
  if (cardNumber < 1 || cardNumber > this.cards.total_cards) {
    throw new Error('Invalid card number');
  }

  this.cards.active_card = cardNumber;
  return this.save();
};

// Virtual to get current card info
propertyTreeSchema.virtual('currentCard').get(function () {
  const cardDesc = this.cards.card_descriptions.find(
    (c) => c.card_number === this.cards.active_card,
  );

  return {
    number: this.cards.active_card,
    total: this.cards.total_cards,
    description: cardDesc?.description || '',
    hasNext: this.cards.active_card < this.cards.total_cards,
    hasPrevious: this.cards.active_card > 1,
  };
});

// Method to sync owner cache from Owner/PropertyOwner data
propertyTreeSchema.statics.syncOwnerCache = async function (propertyId) {
  try {
    const PropertyOwner = require('./PropertyOwner');

    // Get the primary owner with populated owner data
    const primaryOwnerRelation = await PropertyOwner.findOne({
      property_id: propertyId,
      is_primary: true,
      is_active: true,
    }).populate('owner_id');

    // Get all additional owners with populated owner data
    const additionalOwnerRelations = await PropertyOwner.find({
      property_id: propertyId,
      is_primary: false,
      is_active: true,
    }).populate('owner_id');

    // Count total properties for this owner
    let propertiesCount = 0;
    let ownerCacheData = {
      primary_name: null,
      mailing_address: null,
      properties_count: 0,
      owner_id: null,
    };

    // New owners structure
    let ownersStructure = {
      primary: null,
      additional_owners: [],
    };

    if (primaryOwnerRelation && primaryOwnerRelation.owner_id) {
      const owner = primaryOwnerRelation.owner_id;
      const relation = primaryOwnerRelation;

      // Get properties count for this owner
      propertiesCount = await PropertyOwner.countDocuments({
        owner_id: owner._id,
        is_active: true,
      });

      // Get billing address
      const billingAddress = owner.getBillingAddress();
      const formattedAddress = billingAddress
        ? `${billingAddress.street}, ${billingAddress.city}, ${billingAddress.state} ${billingAddress.zip_code}`.trim()
        : '';

      // Legacy owner cache data
      ownerCacheData = {
        primary_name: owner.display_name,
        mailing_address: formattedAddress,
        properties_count: propertiesCount,
        owner_id: owner._id.toString(),
      };

      // New primary owner structure
      ownersStructure.primary = {
        owner_id: owner._id.toString(),
        primary_name: owner.display_name,
        first_name: owner.first_name,
        last_name: owner.last_name,
        business_name: owner.business_name,
        owner_type: owner.owner_type,
        email: owner.email,
        phone: owner.phone,
        mailing_street: billingAddress?.street || '',
        mailing_city: billingAddress?.city || '',
        mailing_state: billingAddress?.state || '',
        mailing_zipcode: billingAddress?.zip_code || '',
        mailing_address: formattedAddress,
        ownership_percentage: relation.ownership_percentage,
        ownership_type: relation.ownership_type,
        receives_tax_bills: relation.receives_tax_bills,
        receives_notices: relation.receives_notices,
        notes: relation.notes,
        is_primary: true,
        additional_owner: relation.additional_owner,
        mail_to: relation.mail_to,
        bill_copy: relation.bill_copy,
      };
    }

    // Process additional owners
    for (const relation of additionalOwnerRelations) {
      if (relation.owner_id) {
        const owner = relation.owner_id;
        const billingAddress = owner.getBillingAddress();
        const formattedAddress = billingAddress
          ? `${billingAddress.street}, ${billingAddress.city}, ${billingAddress.state} ${billingAddress.zip_code}`.trim()
          : '';

        ownersStructure.additional_owners.push({
          owner_id: owner._id.toString(),
          owner_name: owner.display_name,
          first_name: owner.first_name,
          last_name: owner.last_name,
          business_name: owner.business_name,
          owner_type: owner.owner_type,
          email: owner.email,
          phone: owner.phone,
          mailing_street: billingAddress?.street || '',
          mailing_city: billingAddress?.city || '',
          mailing_state: billingAddress?.state || '',
          mailing_zipcode: billingAddress?.zip_code || '',
          mailing_address: formattedAddress,
          ownership_percentage: relation.ownership_percentage,
          ownership_type: relation.ownership_type,
          receives_tax_bills: relation.receives_tax_bills,
          receives_notices: relation.receives_notices,
          notes: relation.notes,
          is_primary: false,
          additional_owner: relation.additional_owner,
          mail_to: relation.mail_to,
          bill_copy: relation.bill_copy,
        });
      }
    }

    // Update the PropertyTreeNode with both legacy and new owner data
    await this.findByIdAndUpdate(propertyId, {
      owner: ownerCacheData, // Legacy structure
      owners: ownersStructure, // New structure
      last_updated: new Date(),
    });

    console.log(
      `Synced owner cache for property ${propertyId}: primary=${!!ownersStructure.primary}, additional=${ownersStructure.additional_owners.length}`,
    );

    return { legacy: ownerCacheData, new: ownersStructure };
  } catch (error) {
    console.error('Error syncing owner cache for property:', propertyId, error);
    return null;
  }
};

// Method to sync owner cache for all properties of a specific owner
propertyTreeSchema.statics.syncOwnerCacheForOwner = async function (ownerId) {
  try {
    const PropertyOwner = require('./PropertyOwner');

    // Get all properties for this owner
    const ownerProperties = await PropertyOwner.find({
      owner_id: ownerId,
      is_active: true,
    }).select('property_id');

    const propertyIds = ownerProperties.map((op) => op.property_id);

    // Sync cache for each property
    const syncPromises = propertyIds.map((propertyId) =>
      this.syncOwnerCache(propertyId),
    );

    await Promise.all(syncPromises);

    console.log(
      `Synced owner cache for ${propertyIds.length} properties of owner ${ownerId}`,
    );
    return propertyIds.length;
  } catch (error) {
    console.error('Error syncing owner cache for owner:', ownerId, error);
    return 0;
  }
};

// Pre-save hook to ensure PID formatting
propertyTreeSchema.pre('save', async function (next) {
  if (this.isModified('pid_raw') || !this.pid_formatted) {
    try {
      await this.formatPID();
    } catch (error) {
      console.warn('Could not format PID:', error.message);
    }
  }
  next();
});

module.exports = mongoose.model('PropertyTreeNode', propertyTreeSchema);
