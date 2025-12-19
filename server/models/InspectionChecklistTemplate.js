const mongoose = require('mongoose');

const inspectionChecklistTemplateSchema = new mongoose.Schema(
  {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },

    inspectionType: {
      type: String,
      required: true,
      enum: [
        'foundation',
        'framing',
        'insulation',
        'drywall',
        'final',
        'rough_electrical',
        'final_electrical',
        'rough_plumbing',
        'final_plumbing',
        'rough_mechanical',
        'final_mechanical',
        'occupancy',
        'fire',
        'other',
      ],
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      maxlength: 1000,
    },

    items: [
      {
        order: {
          type: Number,
          required: true,
        },
        text: {
          type: String,
          required: true,
          trim: true,
          maxlength: 500,
        },
        isRequired: {
          type: Boolean,
          default: true,
        },
        category: {
          type: String,
          trim: true,
          maxlength: 100,
        },
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
      index: true,
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

// Compound index for unique template per inspection type per municipality
inspectionChecklistTemplateSchema.index(
  { municipalityId: 1, inspectionType: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

// Ensure items are sorted by order
inspectionChecklistTemplateSchema.pre('save', function (next) {
  if (this.items && this.items.length > 0) {
    this.items.sort((a, b) => a.order - b.order);
  }
  next();
});

const InspectionChecklistTemplate = mongoose.model(
  'InspectionChecklistTemplate',
  inspectionChecklistTemplateSchema,
);

module.exports = InspectionChecklistTemplate;
