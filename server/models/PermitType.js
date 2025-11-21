const mongoose = require('mongoose');

const permitTypeSchema = new mongoose.Schema(
  {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Municipality',
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },

    // Permit categories (can have multiple for projects)
    categories: {
      type: [String],
      enum: [
        'building',
        'electrical',
        'plumbing',
        'mechanical',
        'renovation',
        'demolition',
        'landscape',
        'replacement',
        'zoning',
        'sign',
        'occupancy',
        'fire',
        'roofing',
        'fence',
        'pool',
        'deck',
        'foundation',
        'other',
      ],
      default: [],
      validate: {
        validator: function(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'At least one category must be selected'
      }
    },

    // Computed: Is this a project (multiple categories)?
    isProject: {
      type: Boolean,
      default: false,
    },

    icon: {
      type: String,
      default: 'file-alt',
    },

    subtypes: [
      {
        type: String,
        trim: true,
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    // Fee configuration
    feeSchedule: {
      baseAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
      calculationType: {
        type: String,
        enum: ['flat', 'per_sqft', 'percentage', 'custom'],
        default: 'flat',
      },
      perSqftRate: {
        type: Number,
        default: 0.50,
        min: 0,
      },
      formula: String, // For custom calculations
      linkedScheduleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FeeSchedule',
      },
    },

    // Department review requirements
    departmentReviews: [
      {
        departmentName: {
          type: String,
          required: true,
          enum: [
            'Building Inspector',
            'Fire Marshal',
            'Health Department',
            'Planning & Zoning',
            'Engineering',
            'Conservation',
            'Public Works',
            'Code Enforcement',
          ],
        },
        isRequired: {
          type: Boolean,
          default: true,
        },
        reviewOrder: {
          type: Number,
          default: 1,
          min: 1,
        },
        requiredDocuments: [String], // Array of document names
      },
    ],

    // Custom form fields for application
    customFormFields: [
      {
        id: {
          type: String,
          required: true,
        },
        label: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          required: true,
          enum: ['text', 'textarea', 'number', 'currency', 'select', 'checkbox', 'date'],
        },
        placeholder: String,
        required: {
          type: Boolean,
          default: false,
        },
        options: [String], // For select and checkbox types
        helpText: String,
        order: {
          type: Number,
          default: 0,
        },
      },
    ],

    // Applicant document requirements
    requiredDocuments: [
      {
        name: {
          type: String,
          required: true,
        },
        description: String,
        fileTypes: [String], // ['pdf', 'jpg', 'png']
        maxSizeBytes: {
          type: Number,
          default: 10485760, // 10MB
        },
        exampleFileUrl: String,
      },
    ],

    suggestedDocuments: [
      {
        name: {
          type: String,
          required: true,
        },
        description: String,
        fileTypes: [String],
        maxSizeBytes: {
          type: Number,
          default: 10485760,
        },
        exampleFileUrl: String,
      },
    ],

    // Municipal template files for download
    templateFiles: [
      {
        fileName: {
          type: String,
          required: true,
        },
        displayName: String,
        description: String,
        fileUrl: {
          type: String,
          required: true,
        },
        fileSize: Number,
        isPublic: {
          type: Boolean,
          default: true,
        },
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
permitTypeSchema.index({ municipalityId: 1, name: 1 }, { unique: true });
permitTypeSchema.index({ municipalityId: 1, isActive: 1 });

// Virtual for full display name with status
permitTypeSchema.virtual('displayName').get(function () {
  return this.isActive ? this.name : `${this.name} (Inactive)`;
});

// Method to get document count
permitTypeSchema.virtual('requiredDocumentCount').get(function () {
  return this.requiredDocuments?.length || 0;
});

permitTypeSchema.virtual('departmentCount').get(function () {
  return this.departmentReviews?.length || 0;
});

// Ensure virtuals are included in JSON
permitTypeSchema.set('toJSON', { virtuals: true });
permitTypeSchema.set('toObject', { virtuals: true });

const PermitType = mongoose.model('PermitType', permitTypeSchema);

module.exports = PermitType;
