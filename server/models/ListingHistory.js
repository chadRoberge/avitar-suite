const mongoose = require('mongoose');

const listingHistorySchema = new mongoose.Schema(
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

    // Visit information
    visitDate: {
      type: Date,
      required: true,
    },
    visitorCode: {
      type: String,
      required: true,
      maxlength: 2,
      minlength: 2,
      trim: true,
      uppercase: true,
    },
    reasonCode: {
      type: String,
      required: true,
      maxlength: 2,
      minlength: 2,
      trim: true,
      uppercase: true,
    },

    // Notes for this visit
    notes: {
      type: String,
      default: '',
      maxlength: 2000,
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
listingHistorySchema.index({ propertyId: 1, visitDate: -1 });
listingHistorySchema.index({ municipalityId: 1 });

module.exports = mongoose.model('ListingHistory', listingHistorySchema);
