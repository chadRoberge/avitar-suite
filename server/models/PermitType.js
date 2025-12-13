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
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'At least one category must be selected',
      },
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
        default: 0.5,
        min: 0,
      },
      formula: String, // For custom calculations
      linkedScheduleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FeeSchedule',
      },
    },

    // Department review requirements (Category 4: Department-Specific Requirements)
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
            'Electrical',
            'Plumbing',
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
        // Required documents specific to this department
        requiredDocuments: [
          {
            name: {
              type: String,
              required: true,
            },
            description: String,
            fileTypes: [String], // ['pdf', 'dwg', 'jpg']
            isMandatory: {
              type: Boolean,
              default: true,
            },
          },
        ],
        // Review checklist/template for this department
        reviewChecklist: [
          {
            id: String,
            question: {
              type: String,
              required: true,
            },
            category: String, // e.g., "Safety", "Compliance", "Technical"
            responseType: {
              type: String,
              enum: ['yes_no', 'pass_fail', 'text', 'number', 'rating'],
              default: 'yes_no',
            },
            isRequired: {
              type: Boolean,
              default: false,
            },
            order: {
              type: Number,
              default: 0,
            },
            helpText: String,
          },
        ],
        // Custom data fields this department needs to collect
        customFields: [
          {
            id: String,
            label: {
              type: String,
              required: true,
            },
            fieldType: {
              type: String,
              enum: [
                'text',
                'number',
                'currency',
                'date',
                'select',
                'multiselect',
                'textarea',
              ],
              required: true,
            },
            options: [String], // For select/multiselect
            unit: String, // e.g., "feet", "PSI", "degrees"
            isRequired: {
              type: Boolean,
              default: false,
            },
            validationRules: {
              min: Number,
              max: Number,
              regex: String,
            },
            order: {
              type: Number,
              default: 0,
            },
          },
        ],
        // Estimated review time for this department (in business days)
        estimatedReviewDays: {
          type: Number,
          default: 5,
        },
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

    // Inspection scheduling requirements
    inspectionSettings: {
      requiredInspections: [
        {
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
          },
          bufferDays: {
            type: Number,
            default: 1,
            min: 0,
            max: 30,
          },
          estimatedMinutes: {
            type: Number,
            default: 60,
            min: 15,
            max: 480, // 8 hours max
          },
          required: {
            type: Boolean,
            default: true,
          },
          description: String,
        },
      ],
      requiresMultipleInspections: {
        type: Boolean,
        default: false,
      },
    },

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
