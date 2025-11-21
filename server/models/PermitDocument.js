const mongoose = require('mongoose');

const permitDocumentSchema = new mongoose.Schema(
  {
    // Municipality reference
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },

    // Permit reference
    permitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permit',
      required: true,
      index: true,
    },

    // Inspection reference (optional - if document is inspection-related)
    inspectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PermitInspection',
    },

    // File reference (new unified file storage system)
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      index: true,
    },

    // Document classification
    type: {
      type: String,
      enum: [
        'application',
        'site_plan',
        'floor_plan',
        'elevation',
        'survey',
        'structural_calc',
        'approval_letter',
        'inspection_report',
        'certificate_of_occupancy',
        'photo',
        'correspondence',
        'invoice',
        'receipt',
        'other',
      ],
      required: true,
      index: true,
    },
    subtype: String, // Additional classification

    // File information
    filename: {
      type: String,
      required: true,
    },
    originalFilename: String, // Original upload name
    url: {
      type: String,
      required: true,
    }, // Google Cloud Storage URL
    thumbnailUrl: String, // For images/PDFs
    size: {
      type: Number,
      required: true,
    }, // File size in bytes
    mimeType: {
      type: String,
      required: true,
    },

    // Document metadata
    title: String,
    description: String,
    version: {
      type: Number,
      default: 1,
    },
    supersedes: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PermitDocument',
    }, // Previous version

    // Access control
    visibility: {
      public: { type: Boolean, default: false },
      commercial: { type: Boolean, default: true },
      owner: { type: Boolean, default: true },
      municipal: { type: Boolean, default: true },
    },

    // Document dates
    documentDate: Date, // Date on the document (if different from upload)
    expirationDate: Date, // For time-sensitive documents
    receivedDate: Date, // When physical document was received

    // Upload information
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uploadedByName: String, // Denormalized
    uploadSource: {
      type: String,
      enum: ['web_upload', 'mobile_app', 'email', 'scan', 'system_generated'],
      default: 'web_upload',
    },

    // Review/approval tracking
    requiresReview: { type: Boolean, default: false },
    reviewed: { type: Boolean, default: false },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedDate: Date,
    reviewNotes: String,
    approved: { type: Boolean, default: false },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedDate: Date,

    // Google Cloud Storage metadata
    gcsMetadata: {
      bucket: String,
      path: String,
      generation: String,
      contentType: String,
    },

    // Processing status (for async operations like thumbnail generation)
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'completed',
    },
    processingError: String,

    // OCR and text extraction
    extractedText: String, // For searchability
    ocrCompleted: { type: Boolean, default: false },
    ocrDate: Date,

    // Tags and categorization
    tags: [String],
    category: String,

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
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    collection: 'permit_documents',
  },
);

// Compound indexes for common queries
permitDocumentSchema.index({ municipalityId: 1, permitId: 1 });
permitDocumentSchema.index({ municipalityId: 1, type: 1 });
permitDocumentSchema.index({ permitId: 1, type: 1, createdAt: -1 });
permitDocumentSchema.index({ inspectionId: 1 });
permitDocumentSchema.index({ uploadedBy: 1, createdAt: -1 });

// Text index for search
permitDocumentSchema.index({
  filename: 'text',
  title: 'text',
  description: 'text',
  extractedText: 'text',
  tags: 'text',
});

// Virtual for file size in MB
permitDocumentSchema.virtual('sizeMB').get(function () {
  return (this.size / (1024 * 1024)).toFixed(2);
});

// Virtual for is image
permitDocumentSchema.virtual('isImage').get(function () {
  return this.mimeType && this.mimeType.startsWith('image/');
});

// Virtual for is PDF
permitDocumentSchema.virtual('isPDF').get(function () {
  return this.mimeType === 'application/pdf';
});

// Virtual for file extension
permitDocumentSchema.virtual('extension').get(function () {
  if (!this.filename) return null;
  const parts = this.filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
});

// Ensure virtuals are included in JSON
permitDocumentSchema.set('toJSON', { virtuals: true });
permitDocumentSchema.set('toObject', { virtuals: true });

// Instance method to mark as reviewed
permitDocumentSchema.methods.markReviewed = function (
  userId,
  userName,
  notes,
  approved = false,
) {
  this.reviewed = true;
  this.reviewedBy = userId;
  this.reviewedDate = new Date();
  this.reviewNotes = notes;

  if (approved) {
    this.approved = true;
    this.approvedBy = userId;
    this.approvedDate = new Date();
  }
};

// Instance method to create new version
permitDocumentSchema.methods.createNewVersion = async function (newDocData) {
  const newDoc = new this.constructor({
    ...newDocData,
    municipalityId: this.municipalityId,
    permitId: this.permitId,
    type: this.type,
    version: this.version + 1,
    supersedes: this._id,
  });

  await newDoc.save();
  return newDoc;
};

// Static method to find documents by permit
permitDocumentSchema.statics.findByPermit = function (
  permitId,
  includeDeleted = false,
) {
  const query = { permitId };
  if (!includeDeleted) {
    query.isActive = true;
  }
  return this.find(query).sort({ type: 1, version: -1, createdAt: -1 });
};

// Static method to find documents requiring review
permitDocumentSchema.statics.findRequiringReview = function (municipalityId) {
  return this.find({
    municipalityId,
    requiresReview: true,
    reviewed: false,
    isActive: true,
  }).sort({ createdAt: 1 });
};

// Static method to find recent uploads
permitDocumentSchema.statics.findRecentUploads = function (
  municipalityId,
  days = 7,
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return this.find({
    municipalityId,
    createdAt: { $gte: cutoffDate },
    isActive: true,
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('PermitDocument', permitDocumentSchema);
