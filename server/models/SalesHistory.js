const mongoose = require('mongoose');

const salesHistorySchema = new mongoose.Schema(
  {
    property_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PropertyTreeNode',
      required: true,
      index: true,
    },
    municipality_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      index: true,
    },
    sale_date: {
      type: Date,
      required: true,
      index: true,
    },
    sale_price: {
      type: Number,
      required: true,
      min: 0,
    },
    buyer_name: {
      type: String,
      trim: true,
      default: '',
    },
    buyer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Owner',
      index: true,
    },
    seller_name: {
      type: String,
      trim: true,
      default: '',
    },
    seller_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Owner',
      index: true,
    },
    book: {
      type: String,
      trim: true,
      default: '',
    },
    page: {
      type: String,
      trim: true,
      default: '',
    },
    sale_type: {
      type: String,
      enum: ['arm-length', 'family', 'foreclosure', 'estate', 'other', ''],
      default: '',
    },
    sale_code: {
      type: Number,
      default: 0,
      min: 0,
    },
    sale_quality_code_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SaleQualityCode',
      index: true,
    },
    is_vacant: {
      type: Boolean,
      default: false,
    },
    is_valid_sale: {
      type: Boolean,
      default: true,
    },
    verification_source: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Legacy field names for backward compatibility
    propertyId: {
      type: String,
    },
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
    },
    saleDate: {
      type: Date,
    },
    salePrice: {
      type: Number,
    },
    buyer: {
      type: String,
    },
    seller: {
      type: String,
    },
    saleType: {
      type: String,
    },
    saleCode: {
      type: Number,
    },
    vacant: {
      type: Boolean,
    },
    verified: {
      type: Boolean,
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
    collection: 'sales_history', // Explicitly set collection name
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;

        // Ensure new field names are used, legacy fields are removed from output
        // This prevents old boolean/legacy values from overriding correct data
        delete ret.buyer;
        delete ret.seller;
        delete ret.propertyId;
        delete ret.municipalityId;
        delete ret.saleDate;
        delete ret.salePrice;
        delete ret.saleType;
        delete ret.saleCode;
        delete ret.vacant;
        delete ret.verified;
        delete ret.createdBy;
        delete ret.updatedBy;

        return ret;
      },
    },
  },
);

// Index for efficient querying by property and municipality
salesHistorySchema.index({ property_id: 1, municipality_id: 1 });
salesHistorySchema.index({ propertyId: 1, municipalityId: 1 }); // Legacy

// Index for sorting by sale date
salesHistorySchema.index({ sale_date: -1 });
salesHistorySchema.index({ saleDate: -1 }); // Legacy

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
