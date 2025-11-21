const mongoose = require('mongoose');

const saleQualityCodeSchema = new mongoose.Schema({
  code: {
    type: Number,
    required: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  displayText: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  stateId: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 2,
    index: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for unique codes within state
saleQualityCodeSchema.index({ stateId: 1, code: 1 }, { unique: true });

// Update the updatedAt field on save
saleQualityCodeSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SaleQualityCode', saleQualityCodeSchema);
