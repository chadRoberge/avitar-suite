const mongoose = require('mongoose');

const permitInspectionSchema = new mongoose.Schema(
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

    // Property reference (denormalized for performance)
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyTreeNode',
      index: true,
    },
    propertyAddress: String,

    // Inspection details
    type: {
      type: String,
      enum: [
        'foundation',
        'framing',
        'rough_electrical',
        'rough_plumbing',
        'rough_mechanical',
        'insulation',
        'drywall',
        'final_electrical',
        'final_plumbing',
        'final_mechanical',
        'final',
        'occupancy',
        'fire',
        'other',
      ],
      required: true,
      index: true,
    },
    description: String,

    // Scheduling
    scheduledDate: {
      type: Date,
      index: true,
    },
    scheduledTimeSlot: String, // e.g., "Morning", "Afternoon", "08:00-10:00"
    requestedDate: Date, // Date requested by applicant
    requestedBy: String, // Name or email of person requesting

    // Assignment
    inspector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    inspectorName: String, // Denormalized

    // Inspection status
    status: {
      type: String,
      enum: [
        'scheduled',
        'in_progress',
        'completed',
        'cancelled',
        'no_access',
        'rescheduled',
      ],
      default: 'scheduled',
      index: true,
    },

    // Completion details
    completedDate: Date,
    startTime: Date,
    endTime: Date,

    // Results
    result: {
      type: String,
      enum: [
        'pending',
        'passed',
        'failed',
        'partial',
        'conditional',
        'cancelled',
      ],
      default: 'pending',
    },

    // Findings
    comments: String,
    violations: [
      {
        code: String, // Building code reference
        description: { type: String, required: true },
        location: String, // Where on property/building
        severity: {
          type: String,
          enum: ['critical', 'major', 'minor'],
          default: 'major',
        },
        mustCorrectBy: Date,
        corrected: { type: Boolean, default: false },
        correctionVerifiedDate: Date,
        correctionNotes: String,
      },
    ],

    // Pass conditions (for conditional passes)
    conditions: [
      {
        description: { type: String, required: true },
        dueDate: Date,
        completed: { type: Boolean, default: false },
        completedDate: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],

    // Documentation
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
    documents: [
      {
        url: { type: String, required: true },
        filename: String,
        type: String, // e.g., "checklist", "report", "certificate"
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Inspection checklist (from template)
    checklist: [
      {
        templateId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'InspectionChecklistTemplate',
        },
        itemId: mongoose.Schema.Types.ObjectId, // Reference to template item _id
        itemText: { type: String, required: true }, // Denormalized for history
        order: Number,
        isRequired: Boolean,
        category: String,
        checked: { type: Boolean, default: false },
        notes: String,
        checkedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        checkedAt: Date,
      },
    ],

    // Reinspection tracking
    requiresReinspection: { type: Boolean, default: false },
    reinspectionReason: String,
    nextInspectionDate: Date,
    originalInspectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PermitInspection',
    }, // If this is a reinspection
    isReinspection: { type: Boolean, default: false },
    reinspectionNumber: { type: Number, default: 0 }, // 0 = original, 1 = first reinspection, etc.

    // Contact/access information
    contactName: String,
    contactPhone: String,
    contactEmail: String,
    accessInstructions: String, // Gate codes, special instructions, etc.

    // Weather/site conditions
    weatherConditions: String,
    siteConditions: String,
    accessIssues: String,

    // Cancellation details
    cancelledDate: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    cancellationReason: String,

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

    // Notes
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
            'created',
            'scheduled',
            'rescheduled',
            'status_updated',
            'note_added',
            'photo_added',
            'checklist_updated',
            'completed',
            'cancelled',
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

    // Reschedule tracking
    rescheduledAt: Date,
    rescheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rescheduleReason: String,

    // Completion tracking
    completedAt: Date,

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
    collection: 'permit_inspections',
  },
);

// Compound indexes for common queries
permitInspectionSchema.index({ municipalityId: 1, scheduledDate: 1 });
permitInspectionSchema.index({
  municipalityId: 1,
  inspector: 1,
  scheduledDate: 1,
});
permitInspectionSchema.index({ municipalityId: 1, status: 1 });
permitInspectionSchema.index({ permitId: 1, type: 1 });
permitInspectionSchema.index({ municipalityId: 1, result: 1 });

// Virtual for has open violations
permitInspectionSchema.virtual('hasOpenViolations').get(function () {
  if (!this.violations || !Array.isArray(this.violations)) return false;
  return this.violations.some((v) => !v.corrected);
});

// Virtual for inspection duration in minutes
permitInspectionSchema.virtual('durationMinutes').get(function () {
  if (!this.startTime || !this.endTime) return null;
  return Math.floor((this.endTime - this.startTime) / (1000 * 60));
});

// Ensure virtuals are included in JSON
permitInspectionSchema.set('toJSON', { virtuals: true });
permitInspectionSchema.set('toObject', { virtuals: true });

// Instance method to add violation
permitInspectionSchema.methods.addViolation = function (violationData) {
  this.violations.push({
    ...violationData,
    corrected: false,
  });

  // If we add violations, inspection cannot pass
  if (this.result === 'passed') {
    this.result = 'failed';
  }

  this.requiresReinspection = true;
};

// Instance method to mark violation as corrected
permitInspectionSchema.methods.correctViolation = function (
  violationId,
  notes,
) {
  const violation = this.violations.id(violationId);
  if (violation) {
    violation.corrected = true;
    violation.correctionVerifiedDate = new Date();
    violation.correctionNotes = notes;
  }
};

// Instance method to complete inspection
permitInspectionSchema.methods.complete = function (result, comments) {
  this.status = 'completed';
  this.result = result;
  this.completedDate = new Date();
  this.comments = comments;

  // Set reinspection flag if failed or has violations
  if (
    result === 'failed' ||
    (result === 'partial' && this.violations.some((v) => !v.corrected))
  ) {
    this.requiresReinspection = true;
  }
};

// Static method to find inspector's schedule
permitInspectionSchema.statics.findInspectorSchedule = function (
  municipalityId,
  inspectorId,
  startDate,
  endDate,
) {
  return this.find({
    municipalityId,
    inspector: inspectorId,
    scheduledDate: {
      $gte: startDate,
      $lte: endDate,
    },
    status: { $in: ['scheduled', 'in_progress'] },
    isActive: true,
  }).sort({ scheduledDate: 1, scheduledTimeSlot: 1 });
};

// Static method to find pending reinspections
permitInspectionSchema.statics.findPendingReinspections = function (
  municipalityId,
) {
  return this.find({
    municipalityId,
    requiresReinspection: true,
    nextInspectionDate: { $lte: new Date() },
    status: { $nin: ['completed', 'cancelled'] },
    isActive: true,
  }).sort({ nextInspectionDate: 1 });
};

// Static method to find today's inspections
permitInspectionSchema.statics.findTodaysInspections = function (
  municipalityId,
  inspectorId = null,
) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const query = {
    municipalityId,
    scheduledDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    status: { $in: ['scheduled', 'in_progress'] },
    isActive: true,
  };

  if (inspectorId) {
    query.inspector = inspectorId;
  }

  return this.find(query)
    .populate('permitId', 'permitNumber type propertyAddress')
    .sort({ scheduledTimeSlot: 1 });
};

module.exports = mongoose.model('PermitInspection', permitInspectionSchema);
