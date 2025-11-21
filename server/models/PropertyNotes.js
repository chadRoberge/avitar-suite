const mongoose = require('mongoose');

const propertyNotesSchema = new mongoose.Schema(
  {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyTreeNode',
      required: true,
      index: true,
    },
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
    },
    card_number: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
      index: true,
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

// Indexes for efficient queries - unique per property, municipality, AND card
propertyNotesSchema.index(
  { propertyId: 1, municipalityId: 1, card_number: 1 },
  { unique: true },
);

module.exports = mongoose.model('PropertyNotes', propertyNotesSchema);
