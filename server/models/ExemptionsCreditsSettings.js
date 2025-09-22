const mongoose = require('mongoose');

const exemptionsCreditsSettingsSchema = new mongoose.Schema(
  {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Municipality',
      required: true,
      unique: true,
    },

    // Elderly exemption amounts by age group
    elderlyExemptions: {
      elderly6574: {
        type: Number,
        default: 0,
        min: 0,
      },
      elderly7579: {
        type: Number,
        default: 0,
        min: 0,
      },
      elderly80plus: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Income and asset limits for elderly exemptions
    elderlyLimits: {
      singleIncomeLimit: {
        type: Number,
        default: 0,
        min: 0,
      },
      marriedIncomeLimit: {
        type: Number,
        default: 0,
        min: 0,
      },
      singleAssetLimit: {
        type: Number,
        default: 0,
        min: 0,
      },
      marriedAssetLimit: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Physical and disability exemptions
    disabilityExemptions: {
      blindExemption: {
        type: Number,
        default: 0,
        min: 0,
      },
      physicalHandicapExemption: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Veteran tax credits
    veteranCredits: {
      veteranCredit: {
        type: Number,
        default: 0,
        min: 0,
      },
      allVeteranCredit: {
        type: Number,
        default: 0,
        min: 0,
      },
      disabledVeteranCredit: {
        type: Number,
        default: 0,
        min: 0,
      },
      survivingSpouseCredit: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Institutional exemptions
    institutionalExemptions: {
      religious: [
        {
          name: {
            type: String,
            required: true,
            trim: true,
          },
        },
      ],
      educational: [
        {
          name: {
            type: String,
            required: true,
            trim: true,
          },
        },
      ],
      charitable: [
        {
          name: {
            type: String,
            required: true,
            trim: true,
          },
        },
      ],
    },

    // Audit fields
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

module.exports = mongoose.model(
  'ExemptionsCreditsSettings',
  exemptionsCreditsSettingsSchema,
);
