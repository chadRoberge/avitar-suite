const mongoose = require('mongoose');

const permitSchema = new mongoose.Schema(
  {
    // Municipality reference (all permits are scoped by municipality)
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },

    // Unique permit number
    permitNumber: {
      type: String,
      required: true,
      index: true,
    },

    // Property reference (all permits must be tied to a property)
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyTreeNode',
      required: true,
      index: true,
    },
    pidRaw: String, // Denormalized for quick reference
    pidFormatted: String, // Denormalized for display
    propertyAddress: String, // Denormalized for display

    // Card reference (optional - for multi-building properties)
    cardNumber: {
      type: Number,
      default: null,
    },
    buildingAssessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingAssessment',
    },

    // Permit type reference
    permitTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PermitType',
      index: true,
    },

    // Custom form field responses (from permit type configuration)
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Permit type and classification
    type: {
      type: String,
      enum: [
        'building',
        'electrical',
        'plumbing',
        'mechanical',
        'demolition',
        'zoning',
        'sign',
        'occupancy',
        'fire',
        'other',
      ],
      required: true,
      index: true,
    },
    subtype: String, // Additional classification (e.g., "New Construction", "Addition", "Repair")

    // Status tracking
    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'under_review',
        'approved',
        'denied',
        'on_hold',
        'expired',
        'closed',
        'cancelled',
      ],
      default: 'draft',
      required: true,
      index: true,
    },

    // Applicant information
    applicant: {
      name: { type: String, required: true },
      email: String,
      phone: String,
      address: String,
      relationshipToProperty: {
        type: String,
        enum: ['owner', 'tenant', 'contractor', 'agent', 'other'],
      },
    },

    // Contractor reference (new - links to Contractor model)
    contractor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contractor',
      index: true,
    },

    // User who submitted this permit
    submitted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    // Contractor information (legacy - for backwards compatibility and simple permits)
    // If contractor_id is set, this will be auto-populated from Contractor model
    contractor: {
      companyName: String,
      licenseNumber: { type: String, index: true },
      contactName: String,
      email: String,
      phone: String,
      address: String,
    },

    // Project details
    description: {
      type: String,
      required: true,
    },
    scopeOfWork: String,
    estimatedValue: {
      type: Number,
      default: 0,
    },
    squareFootage: Number,

    // Important dates
    applicationDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reviewStartDate: Date,
    approvalDate: Date,
    issuanceDate: Date,
    expirationDate: {
      type: Date,
      index: true,
    },
    completionDate: Date,
    finalInspectionDate: Date,

    // Fee tracking
    fees: [
      {
        type: {
          type: String,
          enum: [
            'base',
            'valuation',
            'plan_review',
            'inspection',
            'reinspection',
            'expedite',
            'late',
            'other',
          ],
        },
        description: String,
        amount: { type: Number, required: true },
        paid: { type: Boolean, default: false },
        paidDate: Date,
        paidAmount: Number,
        paymentMethod: String,
        receiptNumber: String,
        refunded: { type: Boolean, default: false },
        refundDate: Date,
        refundAmount: Number,
      },
    ],

    // Fee Schedule Snapshot - captured at permit submission for audit trail
    // This preserves the exact fee configuration used when the permit was submitted
    feeScheduleSnapshot: {
      feeScheduleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FeeSchedule',
      },
      version: Number,
      effectiveDate: Date,
      feeConfiguration: {
        baseAmount: Number,
        calculationType: {
          type: String,
          enum: ['flat', 'per_sqft', 'percentage', 'tiered', 'custom'],
        },
        perSqftRate: Number,
        percentageRate: Number,
        minimumFee: Number,
        maximumFee: Number,
        formula: String,
        tiers: [
          {
            minValue: Number,
            maxValue: Number,
            rate: Number,
            flatAmount: Number,
            description: String,
          },
        ],
        additionalFees: [
          {
            name: String,
            type: String,
            calculationType: String,
            amount: Number,
            percentageOfBase: Number,
            isOptional: Boolean,
            description: String,
          },
        ],
      },
      // Calculated fees at time of submission
      calculatedFees: {
        baseFee: Number,
        additionalFees: [
          {
            name: String,
            type: String,
            amount: Number,
            isOptional: Boolean,
          },
        ],
        totalFee: Number,
      },
      capturedAt: Date,
    },

    // Location data for GIS (copied from property for performance)
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere',
      },
    },

    // Access control (determines who can view this permit)
    visibility: {
      public: { type: Boolean, default: false }, // Public records search
      commercial: { type: Boolean, default: true }, // Commercial/research users
      owner: { type: Boolean, default: true }, // Property owner
    },

    // Internal municipal fields
    internalNotes: [
      {
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        authorName: String, // Denormalized
        note: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Assignment and workflow
    assignedInspector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignedReviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    priorityLevel: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    }, // 0=normal, 5=urgent

    // Approval/denial details
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvalNotes: String,
    denialReason: String,
    deniedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Department reviews tracking
    departmentReviews: [
      {
        department: {
          type: String,
          required: true,
        },
        required: {
          type: Boolean,
          default: true,
        },
        // Review status: pending, in_review, revisions_requested, approved, conditionally_approved, rejected
        status: {
          type: String,
          enum: [
            'pending',
            'in_review',
            'revisions_requested',
            'approved',
            'conditionally_approved',
            'rejected',
          ],
          default: 'pending',
        },
        approved: {
          type: Boolean,
          default: false,
        },
        // Assigned reviewer for this department
        assignedTo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        assignedAt: Date,
        // Who performed the review
        reviewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        reviewedAt: Date,
        // Review started timestamp (when reviewer first opens/claims)
        reviewStartedAt: Date,
        // Comments related to this department's review (references PermitComment IDs)
        // Allows both internal municipal comments and external applicant communication
        comments: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PermitComment',
          },
        ],
        // Conditions/stipulations attached to approval (e.g., "Must install fire sprinklers")
        conditions: [String],
        // Re-review tracking
        requiresReReview: {
          type: Boolean,
          default: false,
        },
        reReviewReason: String,
        reReviewRequestedAt: Date,
        reReviewRequestedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        // Review history for audit trail
        reviewHistory: [
          {
            action: {
              type: String,
              enum: [
                'assigned',
                'started',
                'approved',
                'conditionally_approved',
                'rejected',
                'revisions_requested',
                're_review_requested',
              ],
            },
            performedBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'User',
            },
            performedAt: {
              type: Date,
              default: Date.now,
            },
            notes: String,
          },
        ],
      },
    ],

    // SLA Tracking & Notifications (Category 3)
    sla: {
      // Target review time in business days (set from municipality settings or permit type)
      targetReviewDays: {
        type: Number,
        default: 30,
      },
      // Expected completion date based on submission + target days
      expectedCompletionDate: Date,
      // Actual completion date (when fully approved/denied)
      actualCompletionDate: Date,
      // Is this permit overdue?
      isOverdue: {
        type: Boolean,
        default: false,
      },
      // Days overdue (calculated)
      daysOverdue: {
        type: Number,
        default: 0,
      },
      // Warning notifications sent
      warningsSent: [
        {
          sentAt: Date,
          warningType: {
            type: String,
            enum: ['approaching_deadline', 'overdue', 'severely_overdue'],
          },
          daysFromDeadline: Number,
        },
      ],
    },

    // Notification tracking
    notifications: {
      // Track which notifications have been sent to avoid duplicates
      emailsSent: [
        {
          type: {
            type: String,
            enum: [
              'submitted',
              'assigned',
              'comment_added',
              'status_changed',
              'approved',
              'rejected',
              'revisions_requested',
              'sla_warning',
            ],
          },
          sentTo: [String], // Email addresses
          sentAt: {
            type: Date,
            default: Date.now,
          },
          relatedDepartment: String, // If notification is department-specific
        },
      ],
      // Track @mentions in comments
      mentions: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
          commentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PermitComment',
          },
          read: {
            type: Boolean,
            default: false,
          },
          readAt: Date,
        },
      ],
    },

    // Track when users view the permit (for unread comment tracking)
    viewedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        lastViewedAt: {
          type: Date,
          required: true,
          default: Date.now,
        },
      },
    ],

    // Project Management (for complex permits with multiple types)
    isProject: {
      type: Boolean,
      default: false,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permit',
      index: true,
    }, // References the parent project permit
    projectName: String, // e.g., "Major Construction - 123 Main St"
    projectTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectType',
    }, // References the project type template used
    projectOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }, // User who created the project (may differ from individual permit owners)
    projectTotalFee: {
      type: Number,
      default: 0,
      min: 0,
    }, // Total fee for entire project (upfront payment)
    projectFeePaid: {
      type: Boolean,
      default: false,
    }, // Whether project fee has been paid
    childPermits: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permit',
      },
    ], // For project permits, references to child permits (foundation, electrical, etc.)

    // Denormalized project stats (computed, updated when child permits change)
    projectStats: {
      totalChildren: {
        type: Number,
        default: 0,
      },
      childrenByStatus: {
        draft: { type: Number, default: 0 },
        submitted: { type: Number, default: 0 },
        under_review: { type: Number, default: 0 },
        approved: { type: Number, default: 0 },
        conditionally_approved: { type: Number, default: 0 },
        denied: { type: Number, default: 0 },
        closed: { type: Number, default: 0 },
      },
      totalProjectValue: {
        type: Number,
        default: 0,
      }, // Sum of all child estimatedValues
      completedChildren: {
        type: Number,
        default: 0,
      },
      overallProgress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      }, // 0-100%
      lastChildUpdate: Date,
    },

    // Related permits (non-project relationships)
    relatedPermits: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permit',
      },
    ],

    // Audit trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    statusHistory: [
      {
        status: String,
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        changedByName: String, // Denormalized
        timestamp: { type: Date, default: Date.now },
        notes: String,
      },
    ],

    // Analytics & Metrics (Category 5) - Cached for performance
    metrics: {
      // Total time from submission to final decision (in business days)
      totalReviewDays: Number,
      // Time in each department (cached for reporting)
      departmentReviewTimes: [
        {
          department: String,
          daysInReview: Number,
          startedAt: Date,
          completedAt: Date,
        },
      ],
      // Number of revisions requested
      revisionCount: {
        type: Number,
        default: 0,
      },
      // Number of comments/communications
      commentCount: {
        type: Number,
        default: 0,
      },
      // Number of document uploads
      documentCount: {
        type: Number,
        default: 0,
      },
      // Last activity timestamp (for staleness detection)
      lastActivityAt: Date,
      // Days since last activity
      daysSinceActivity: Number,
    },

    // Soft delete
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    collection: 'permits',
  },
);

// Compound indexes for common queries
permitSchema.index({ municipalityId: 1, status: 1 });
permitSchema.index({ municipalityId: 1, type: 1 });
permitSchema.index({ municipalityId: 1, propertyId: 1 });
permitSchema.index({ municipalityId: 1, 'contractor.licenseNumber': 1 });
permitSchema.index({ municipalityId: 1, contractor_id: 1 }); // New
permitSchema.index({ municipalityId: 1, submitted_by: 1 }); // New
permitSchema.index({ contractor_id: 1, status: 1 }); // New - for contractor dashboard
permitSchema.index({ submitted_by: 1, status: 1 }); // New - for user dashboard
permitSchema.index({ createdBy: 1, status: 1 }); // New - for user's own permits
permitSchema.index({ municipalityId: 1, applicationDate: -1 });
permitSchema.index({ municipalityId: 1, status: 1, applicationDate: -1 });
permitSchema.index({ municipalityId: 1, assignedInspector: 1, status: 1 });
permitSchema.index({ municipalityId: 1, permitNumber: 1 }, { unique: true });

// Text index for search
permitSchema.index({
  permitNumber: 'text',
  'applicant.name': 'text',
  'contractor.companyName': 'text',
  description: 'text',
  scopeOfWork: 'text',
  propertyAddress: 'text',
});

// Virtual for total fees
permitSchema.virtual('totalFees').get(function () {
  if (!this.fees || !Array.isArray(this.fees)) return 0;
  return this.fees.reduce((sum, fee) => sum + fee.amount, 0);
});

// Virtual for unpaid fees
permitSchema.virtual('unpaidFees').get(function () {
  if (!this.fees || !Array.isArray(this.fees)) return [];
  return this.fees.filter((fee) => !fee.paid);
});

// Virtual for total paid amount
permitSchema.virtual('totalPaid').get(function () {
  if (!this.fees || !Array.isArray(this.fees)) return 0;
  return this.fees
    .filter((fee) => fee.paid)
    .reduce((sum, fee) => sum + (fee.paidAmount || fee.amount), 0);
});

// Virtual for days until expiration
permitSchema.virtual('daysUntilExpiration').get(function () {
  if (!this.expirationDate) return null;
  const now = new Date();
  const days = Math.floor((this.expirationDate - now) / (1000 * 60 * 60 * 24));
  return days;
});

// Virtual for is expired
permitSchema.virtual('isExpired').get(function () {
  if (!this.expirationDate) return false;
  return new Date() > this.expirationDate;
});

// Virtual for processing time (days from application to approval)
permitSchema.virtual('processingTimeDays').get(function () {
  if (!this.approvalDate || !this.applicationDate) return null;
  return Math.floor(
    (this.approvalDate - this.applicationDate) / (1000 * 60 * 60 * 24),
  );
});

// Ensure virtuals are included in JSON
permitSchema.set('toJSON', { virtuals: true });
permitSchema.set('toObject', { virtuals: true });

// Pre-save middleware to update status history
permitSchema.pre('save', function (next) {
  if (this.isModified('status') && !this.isNew) {
    this.statusHistory.push({
      status: this.status,
      changedBy: this.updatedBy,
      timestamp: new Date(),
    });
  }
  next();
});

// Static method to generate next permit number
permitSchema.statics.generatePermitNumber = async function (
  municipalityId,
  type,
  year,
) {
  const prefix = this.getTypePrefix(type);
  const currentYear = year || new Date().getFullYear();

  // Count permits for this year and type
  const count = await this.countDocuments({
    municipalityId,
    type,
    applicationDate: {
      $gte: new Date(`${currentYear}-01-01`),
      $lt: new Date(`${currentYear + 1}-01-01`),
    },
  });

  const nextNumber = count + 1;
  return `${currentYear}-${prefix}-${String(nextNumber).padStart(6, '0')}`;
};

// Static method to get type prefix
permitSchema.statics.getTypePrefix = function (type) {
  const prefixes = {
    building: 'BLD',
    electrical: 'ELC',
    plumbing: 'PLB',
    mechanical: 'MEC',
    demolition: 'DEM',
    zoning: 'ZON',
    sign: 'SGN',
    occupancy: 'OCC',
    fire: 'FIR',
    other: 'OTH',
  };
  return prefixes[type] || 'PER';
};

// Instance method to add internal note
permitSchema.methods.addInternalNote = function (userId, userName, note) {
  this.internalNotes.push({
    author: userId,
    authorName: userName,
    note: note,
    timestamp: new Date(),
  });
};

// Instance method to update status with history
permitSchema.methods.updateStatus = function (
  newStatus,
  userId,
  userName,
  notes,
) {
  this.status = newStatus;
  this.updatedBy = userId;

  this.statusHistory.push({
    status: newStatus,
    changedBy: userId,
    changedByName: userName,
    timestamp: new Date(),
    notes: notes,
  });

  // Update relevant date fields
  if (newStatus === 'approved') {
    this.approvalDate = new Date();
    this.approvedBy = userId;
    if (notes) this.approvalNotes = notes;

    // Set expiration date (180 days from approval)
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 180);
    this.expirationDate = expiration;
  } else if (newStatus === 'denied') {
    this.deniedBy = userId;
    if (notes) this.denialReason = notes;
  } else if (newStatus === 'under_review') {
    this.reviewStartDate = new Date();
  } else if (newStatus === 'closed') {
    this.completionDate = new Date();
  }
};

// Static method to find permits needing attention
permitSchema.statics.findNeedingAttention = function (
  municipalityId,
  daysThreshold = 30,
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

  return this.find({
    municipalityId,
    status: 'under_review',
    applicationDate: { $lt: cutoffDate },
    isActive: true,
  }).sort({ applicationDate: 1 });
};

// Static method to find expiring soon
permitSchema.statics.findExpiringSoon = function (
  municipalityId,
  daysThreshold = 30,
) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysThreshold);

  return this.find({
    municipalityId,
    status: 'approved',
    expirationDate: {
      $gte: new Date(),
      $lte: futureDate,
    },
    isActive: true,
  }).sort({ expirationDate: 1 });
};

// Static method to find permits for a contractor (across all municipalities)
permitSchema.statics.findByContractor = function (contractorId, options = {}) {
  const query = {
    contractor_id: contractorId,
    isActive: true,
  };

  if (options.status) {
    query.status = options.status;
  }

  if (options.municipalityId) {
    query.municipalityId = options.municipalityId;
  }

  return this.find(query)
    .populate('municipalityId', 'name slug')
    .populate('propertyId', 'pidFormatted address')
    .populate('assignedInspector', 'first_name last_name')
    .sort({ applicationDate: -1 });
};

// Static method to find permits for a user (contractor member or citizen)
permitSchema.statics.findByUser = function (userId, options = {}) {
  const query = {
    $or: [{ createdBy: userId }, { submitted_by: userId }],
    isActive: true,
  };

  if (options.status) {
    query.status = options.status;
  }

  if (options.municipalityId) {
    query.municipalityId = options.municipalityId;
  }

  return this.find(query)
    .populate('municipalityId', 'name slug')
    .populate('propertyId', 'pidFormatted address')
    .populate('contractor_id', 'company_name license_number')
    .populate('assignedInspector', 'first_name last_name')
    .sort({ applicationDate: -1 });
};

// Static method to find all permits accessible by a user
// For contractors: includes all permits by their contractor company
// For citizens: only their own permits
permitSchema.statics.findAccessibleByUser = async function (
  user,
  options = {},
) {
  const query = {
    isActive: true,
  };

  // Build the OR conditions based on user type
  const orConditions = [{ createdBy: user._id }, { submitted_by: user._id }];

  // If user is a contractor, include all permits by their contractor
  if (user.contractor_id) {
    orConditions.push({ contractor_id: user.contractor_id });
  }

  query.$or = orConditions;

  if (options.status) {
    query.status = options.status;
  }

  if (options.municipalityId) {
    query.municipalityId = options.municipalityId;
  }

  return this.find(query)
    .populate('municipalityId', 'name slug')
    .populate('propertyId', 'pidFormatted address')
    .populate('contractor_id', 'company_name license_number')
    .populate('assignedInspector', 'first_name last_name')
    .populate('submitted_by', 'first_name last_name email')
    .sort({ applicationDate: -1 });
};

module.exports = mongoose.model('Permit', permitSchema);
