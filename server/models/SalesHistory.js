const mongoose = require('mongoose');

const salesHistorySchema = new mongoose.Schema(
  {
    propertyId: {
      type: String,
      required: true,
      index: true,
    },
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },
    saleDate: {
      type: Date,
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    buyer: {
      type: String,
      trim: true,
      default: '',
    },
    seller: {
      type: String,
      trim: true,
      default: '',
    },
    saleType: {
      type: String,
      enum: ['arm-length', 'family', 'foreclosure', 'estate', 'other', ''],
      default: '',
    },
    verified: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
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
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        return ret;
      },
    },
  },
);

// Index for efficient querying by property and municipality
salesHistorySchema.index({ propertyId: 1, municipalityId: 1 });

// Index for sorting by sale date
salesHistorySchema.index({ saleDate: -1 });

// Static method to get sales for a property
salesHistorySchema.statics.getSalesForProperty = async function (
  propertyId,
  limit = 20,
) {
  return await this.find({ propertyId })
    .sort({ saleDate: -1 })
    .limit(limit)
    .populate('createdBy updatedBy', 'firstName lastName')
    .lean();
};

module.exports = mongoose.model('SalesHistory', salesHistorySchema);
