const mongoose = require('mongoose');

const propertyNotesSchema = new mongoose.Schema(
  {
    propertyId: {
      type: String,
      required: true,
    },
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
    },

    // Property notes
    notes: {
      type: String,
      default: '',
      maxlength: 10000,
    },

    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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

// Indexes for efficient queries
propertyNotesSchema.index(
  { propertyId: 1, municipalityId: 1 },
  { unique: true },
);

module.exports = mongoose.model('PropertyNotes', propertyNotesSchema);
