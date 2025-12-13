const mongoose = require('mongoose');

const contractorVerificationSchema = new mongoose.Schema(
  {
    contractor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contractor',
      required: true,
      unique: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Application status
    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'under_review',
        'approved',
        'rejected',
        'expired',
      ],
      default: 'draft',
    },

    // License information
    licenses: [
      {
        type: {
          type: String,
          enum: ['general_contractor', 'electrical', 'plumbing', 'hvac'],
          required: true,
        },
        license_number: {
          type: String,
          required: true,
        },
        issuing_state: {
          type: String,
          required: true,
        },
        issue_date: {
          type: Date,
          required: true,
        },
        expiration_date: {
          type: Date,
          required: true,
        },
        file_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'File',
          required: true,
        },
      },
    ],

    // Driver's license for ID verification
    drivers_license: {
      license_number: {
        type: String,
        required: function () {
          return this.status !== 'draft';
        },
      },
      issuing_state: {
        type: String,
        required: function () {
          return this.status !== 'draft';
        },
      },
      expiration_date: {
        type: Date,
        required: function () {
          return this.status !== 'draft';
        },
      },
      file_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File',
        required: function () {
          return this.status !== 'draft';
        },
      },
    },

    // Insurance information (optional but recommended)
    insurance: {
      has_insurance: {
        type: Boolean,
        default: false,
      },
      policy_number: String,
      provider: String,
      coverage_amount: Number,
      expiration_date: Date,
      file_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File',
      },
    },

    // Verification details
    submitted_at: Date,
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewed_at: Date,
    review_notes: String,

    // Approval details
    approved_at: Date,
    expires_at: Date, // Verification expires after 1 year

    // Rejection details
    rejection_reason: String,
    rejection_details: String,
  },
  {
    timestamps: true,
    collection: 'contractor_verifications',
  },
);

// Indexes
contractorVerificationSchema.index({ contractor_id: 1 });
contractorVerificationSchema.index({ user_id: 1 });
contractorVerificationSchema.index({ status: 1 });
contractorVerificationSchema.index({ expires_at: 1 });

// Virtual for checking if verification is valid
contractorVerificationSchema.virtual('isValid').get(function () {
  if (this.status !== 'approved') return false;
  if (!this.expires_at) return false;
  return new Date() < this.expires_at;
});

// Virtual for checking if verification is expiring soon (within 30 days)
contractorVerificationSchema.virtual('isExpiringSoon').get(function () {
  if (this.status !== 'approved' || !this.expires_at) return false;
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return this.expires_at <= thirtyDaysFromNow;
});

// Method to approve verification
contractorVerificationSchema.methods.approve = function (
  reviewerId,
  notes = '',
) {
  this.status = 'approved';
  this.reviewed_by = reviewerId;
  this.reviewed_at = new Date();
  this.approved_at = new Date();
  this.review_notes = notes;

  // Set expiration to 1 year from approval
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  this.expires_at = expiresAt;

  return this.save();
};

// Method to reject verification
contractorVerificationSchema.methods.reject = function (
  reviewerId,
  reason,
  details = '',
) {
  this.status = 'rejected';
  this.reviewed_by = reviewerId;
  this.reviewed_at = new Date();
  this.rejection_reason = reason;
  this.rejection_details = details;
  this.review_notes = `${reason}: ${details}`;

  return this.save();
};

// Method to submit verification
contractorVerificationSchema.methods.submit = function () {
  // Validate required fields
  if (!this.licenses || this.licenses.length === 0) {
    throw new Error('At least one professional license is required');
  }

  if (!this.drivers_license || !this.drivers_license.file_id) {
    throw new Error("Driver's license is required for identity verification");
  }

  this.status = 'submitted';
  this.submitted_at = new Date();

  return this.save();
};

// Static method to check if contractor is verified
contractorVerificationSchema.statics.isContractorVerified = async function (
  contractorId,
) {
  const verification = await this.findOne({
    contractor_id: contractorId,
    status: 'approved',
    expires_at: { $gt: new Date() },
  });

  return !!verification;
};

// Ensure virtuals are included when converting to JSON
contractorVerificationSchema.set('toJSON', { virtuals: true });
contractorVerificationSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model(
  'ContractorVerification',
  contractorVerificationSchema,
);
