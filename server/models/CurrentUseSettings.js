const mongoose = require('mongoose');

const currentUseSettingsSchema = new mongoose.Schema(
  {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Municipality',
      unique: true, // One settings record per municipality
    },
    showAdValorem: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('CurrentUseSettings', currentUseSettingsSchema);
