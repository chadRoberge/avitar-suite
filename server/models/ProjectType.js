const mongoose = require('mongoose');

const projectTypeSchema = new mongoose.Schema(
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

    category: {
      type: String,
      enum: [
        'residential',
        'commercial',
        'industrial',
        'mixed_use',
        'renovation',
        'new_construction',
        'infrastructure',
        'other',
      ],
      default: 'residential',
    },

    icon: {
      type: String,
      default: 'folder-open',
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Default permit types that should be included in this project type
    defaultPermitTypes: [
      {
        permitTypeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'PermitType',
          required: true,
        },
        isRequired: {
          type: Boolean,
          default: true,
        },
        order: {
          type: Number,
          default: 0,
        },
        description: String, // Optional note about this permit in the project context
      },
    ],

    // Project-level custom form fields (in addition to individual permit fields)
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
        fieldType: {
          type: String,
          required: true,
          enum: [
            'text',
            'textarea',
            'number',
            'currency',
            'select',
            'checkbox',
            'date',
          ],
        },
        placeholder: String,
        required: {
          type: Boolean,
          default: false,
        },
        options: [String], // For select and checkbox types
        helpText: String,
        unit: String, // e.g., "months", "days"
        order: {
          type: Number,
          default: 0,
        },
      },
    ],

    // Project-level document requirements
    requiredDocuments: [
      {
        name: {
          type: String,
          required: true,
        },
        description: String,
        fileTypes: [String], // ['pdf', 'dwg', 'jpg']
        maxSizeBytes: {
          type: Number,
          default: 10485760, // 10MB
        },
        exampleFileUrl: String,
        isMandatory: {
          type: Boolean,
          default: true,
        },
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

    // Fee configuration for the project as a whole
    feeSchedule: {
      baseAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
      calculationType: {
        type: String,
        enum: ['none', 'flat', 'percentage', 'custom'],
        default: 'none', // Most projects will just sum child permit fees
      },
      percentageOfChildFees: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      formula: String, // For custom calculations
    },

    // Estimated timeline information
    estimatedCompletionDays: {
      type: Number,
      min: 1,
    },

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
projectTypeSchema.index({ municipalityId: 1, name: 1 }, { unique: true });
projectTypeSchema.index({ municipalityId: 1, isActive: 1 });

// Virtual for full display name with status
projectTypeSchema.virtual('displayName').get(function () {
  return this.isActive ? this.name : `${this.name} (Inactive)`;
});

// Virtual for permit count
projectTypeSchema.virtual('permitTypeCount').get(function () {
  return this.defaultPermitTypes?.length || 0;
});

// Virtual for required document count
projectTypeSchema.virtual('requiredDocumentCount').get(function () {
  return this.requiredDocuments?.filter((d) => d.isMandatory).length || 0;
});

// Ensure virtuals are included in JSON
projectTypeSchema.set('toJSON', { virtuals: true });
projectTypeSchema.set('toObject', { virtuals: true });

const ProjectType = mongoose.model('ProjectType', projectTypeSchema);

module.exports = ProjectType;
