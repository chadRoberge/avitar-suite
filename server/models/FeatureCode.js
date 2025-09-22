const mongoose = require('mongoose');

const featureCodeSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true,
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    minlength: 1,
    maxlength: 10,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
  },
  sizeAdjustment: {
    type: String,
    required: true,
    enum: ['normal', 'zero'],
    lowercase: true,
  },
  measurementType: {
    type: String,
    required: true,
    enum: ['length_width', 'units'],
    lowercase: true,
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

// Compound index for unique codes within municipality
featureCodeSchema.index({ municipalityId: 1, code: 1 }, { unique: true });

// Update the updatedAt field on save
featureCodeSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('FeatureCode', featureCodeSchema);
