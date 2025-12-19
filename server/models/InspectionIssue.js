const mongoose = require('mongoose');

const inspectionIssueSchema = new mongoose.Schema(
  {
    // Unique issue identifier (YYMMDD-AHSLN3 format)
    issueNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: /^\d{6}-[A-Z0-9]{6}$/,
    },

    // Municipality reference
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },

    // Permit reference (required)
    permitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permit',
      required: true,
      index: true,
    },

    // Property reference
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyTreeNode',
      required: true,
      index: true,
    },

    // Optional inspection reference (if created during specific inspection)
    inspectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PermitInspection',
      index: true,
    },

    // Issue details (populated when card is scanned)
    description: String, // Required after scanning
    location: String, // "North wall, second floor", etc.
    severity: {
      type: String,
      enum: ['critical', 'major', 'minor'],
      default: 'major',
    },

    // Issue photos (taken by inspector)
    photos: [
      {
        url: { type: String, required: true }, // Google Cloud Storage URL
        filename: String,
        caption: String,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        uploadedAt: { type: Date, default: Date.now },
        thumbnail: String, // Thumbnail URL
      },
    ],

    // QR Code information
    qrCodeUrl: String, // Google Cloud Storage URL for QR code image
    batchId: mongoose.Schema.Types.ObjectId, // Reference to card batch

    // Tracking
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }, // Inspector who first scanned
    createdAt: Date, // When first scanned and issue created

    // Status workflow
    status: {
      type: String,
      enum: [
        'pending',
        'open',
        'contractor_viewed',
        'corrected',
        'verified',
        'closed',
      ],
      default: 'pending', // pending = card generated but not scanned yet
      index: true,
    },

    // Contractor interaction
    viewedByContractor: { type: Boolean, default: false },
    viewedAt: Date,
    contractorViewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Correction tracking
    correctionPhotos: [
      {
        url: { type: String, required: true },
        filename: String,
        caption: String,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        uploadedAt: { type: Date, default: Date.now },
        thumbnail: String,
      },
    ],
    correctionNotes: String,
    correctionRequestedAt: Date,
    correctionRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Verification (inspector reviews correction)
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verifiedAt: Date,
    verificationNotes: String,
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
    },

    // Additional notes
    notes: [
      {
        content: { type: String, required: true },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        createdAt: { type: Date, default: Date.now },
        attachments: [String], // URLs to attachments
      },
    ],

    // History tracking
    history: [
      {
        action: {
          type: String,
          required: true,
          enum: [
            'card_generated',
            'issue_created',
            'viewed_by_contractor',
            'correction_uploaded',
            'reinspection_requested',
            'verified',
            'closed',
            'reopened',
          ],
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        performedAt: { type: Date, default: Date.now },
        details: mongoose.Schema.Types.Mixed, // Flexible field for action-specific data
      },
    ],

    // Audit trail
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Soft delete
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
    collection: 'inspection_issues',
  },
);

// Compound indexes for common queries
inspectionIssueSchema.index({ municipalityId: 1, status: 1 });
inspectionIssueSchema.index({ permitId: 1, status: 1 });
inspectionIssueSchema.index({ municipalityId: 1, createdAt: -1 });
inspectionIssueSchema.index({ batchId: 1, status: 1 });

// Virtual for checking if issue is resolved
inspectionIssueSchema.virtual('isResolved').get(function () {
  return this.status === 'verified' || this.status === 'closed';
});

// Virtual for checking if correction is pending review
inspectionIssueSchema.virtual('isPendingVerification').get(function () {
  return this.status === 'corrected' && this.correctionPhotos.length > 0;
});

// Ensure virtuals are included in JSON
inspectionIssueSchema.set('toJSON', { virtuals: true });
inspectionIssueSchema.set('toObject', { virtuals: true });

// Instance method to mark as viewed by contractor
inspectionIssueSchema.methods.markViewedByContractor = function (userId) {
  this.viewedByContractor = true;
  this.viewedAt = new Date();
  this.contractorViewedBy = userId;
  this.status = 'contractor_viewed';

  this.history.push({
    action: 'viewed_by_contractor',
    performedBy: userId,
    performedAt: new Date(),
  });
};

// Instance method to add correction
inspectionIssueSchema.methods.addCorrection = function (userId, notes, photos) {
  this.correctionNotes = notes;
  this.correctionPhotos = photos || [];
  this.correctionRequestedAt = new Date();
  this.correctionRequestedBy = userId;
  this.status = 'corrected';

  this.history.push({
    action: 'correction_uploaded',
    performedBy: userId,
    performedAt: new Date(),
    details: { photoCount: photos.length },
  });
};

// Instance method to verify correction
inspectionIssueSchema.methods.verifyCorrection = function (
  userId,
  approved,
  notes,
) {
  this.verifiedBy = userId;
  this.verifiedAt = new Date();
  this.verificationNotes = notes;
  this.verificationStatus = approved ? 'approved' : 'rejected';
  this.status = approved ? 'verified' : 'open'; // Reopen if rejected

  this.history.push({
    action: 'verified',
    performedBy: userId,
    performedAt: new Date(),
    details: { approved, notes },
  });
};

// Instance method to close issue
inspectionIssueSchema.methods.close = function (userId, notes) {
  this.status = 'closed';
  this.updatedBy = userId;

  if (notes) {
    this.notes.push({
      content: notes,
      createdBy: userId,
      createdAt: new Date(),
    });
  }

  this.history.push({
    action: 'closed',
    performedBy: userId,
    performedAt: new Date(),
  });
};

// Static method to find pending issues for a permit
inspectionIssueSchema.statics.findPendingForPermit = function (permitId) {
  return this.find({
    permitId,
    status: { $in: ['open', 'contractor_viewed', 'corrected'] },
    isActive: true,
  }).sort({ createdAt: -1 });
};

// Static method to find issues needing verification
inspectionIssueSchema.statics.findNeedingVerification = function (
  municipalityId,
) {
  return this.find({
    municipalityId,
    status: 'corrected',
    isActive: true,
  })
    .populate('permitId', 'permitNumber propertyAddress')
    .populate('createdBy', 'first_name last_name')
    .populate('correctionRequestedBy', 'first_name last_name')
    .sort({ correctionRequestedAt: 1 });
};

// Static method to find issues from a batch
inspectionIssueSchema.statics.findByBatch = function (batchId) {
  return this.find({
    batchId,
    isActive: true,
  }).sort({ issueNumber: 1 });
};

module.exports = mongoose.model('InspectionIssue', inspectionIssueSchema);
