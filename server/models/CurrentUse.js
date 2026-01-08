const mongoose = require('mongoose');

const currentUseSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Municipality',
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 10,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255,
  },
  displayText: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  effective_year: {
    type: Number,
    required: true,
    index: true,
  },
  minRate: {
    type: Number,
    required: true,
    min: 0,
  },
  maxRate: {
    type: Number,
    required: true,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
}, );

// Compound index to ensure unique codes per municipality per year
currentUseSchema.index(
  { municipalityId: 1, code: 1, effective_year: 1 },
  { unique: true },
);
currentUseSchema.index({ municipalityId: 1, effective_year: 1 });

// Validation to ensure min rate is not greater than max rate
currentUseSchema.pre('save', function(next) {
  if (this.minRate > this.maxRate) {
    const error = new Error('Minimum rate cannot be greater than maximum rate');
    return next(error);
  }
  next();
});

module.exports = mongoose.model('CurrentUse', currentUseSchema);
