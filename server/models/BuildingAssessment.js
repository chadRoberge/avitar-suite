const mongoose = require('mongoose');
const { roundToNearestHundred } = require('../utils/assessment');

// Building Assessment - Card-specific (each card can have a building assessment)
const buildingAssessmentSchema = new mongoose.Schema(
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
    card_number: {
      type: Number,
      required: true,
      default: 1,
      index: true,
    },

    // Assessment year this record applies to
    effective_year: { type: Number, required: true, index: true },

    // Basic Building Information
    building_model: { type: String, trim: true },
    frame: { type: String, trim: true },
    year_built: { type: Number },
    base_type: { type: String, trim: true },
    quality_grade: { type: String, trim: true },
    story_height: { type: String, trim: true },

    // Roof Details
    roof_style: { type: String, trim: true },
    roof_cover: { type: String, trim: true },

    // Wall Details
    exterior_wall_1: { type: String, trim: true },
    exterior_wall_2: { type: String, trim: true },
    interior_wall_1: { type: String, trim: true },
    interior_wall_2: { type: String, trim: true },

    // Flooring
    flooring_1: { type: String, trim: true },
    flooring_2: { type: String, trim: true },

    // Heating/Cooling
    heating_fuel: { type: String, trim: true },
    heating_type: { type: String, trim: true },
    air_conditioning: { type: String, trim: true },

    // Room Details
    bedrooms: { type: Number, default: 0 },
    full_baths: { type: Number, default: 0 },
    half_baths: { type: Number, default: 0 },
    extra_kitchen: { type: Number, default: 0 },

    // Additional Features
    generator: { type: String, trim: true },

    // Building Valuation
    base_rate: { type: Number, default: 0 },
    building_value: { type: Number, default: 0 },
    replacement_cost_new: { type: Number, default: 0 },
    assessed_value: { type: Number, default: 0 },

    // Building size and area information
    effective_area: { type: Number, default: 0 },

    // Building age information
    age: { type: Number, default: 0 },

    // Depreciation Details
    depreciation: {
      normal: {
        percentage: { type: Number, default: 0 },
        description: { type: String, default: '' },
      },
      physical: {
        percentage: { type: Number, default: 0 },
        notes: { type: String, default: '' },
      },
      functional: {
        percentage: { type: Number, default: 0 },
        notes: { type: String, default: '' },
      },
      economic: {
        percentage: { type: Number, default: 0 },
        notes: { type: String, default: '' },
      },
      temporary: {
        percentage: { type: Number, default: 0 },
        notes: { type: String, default: '' },
      },
    },

    // Calculated depreciation total
    total_depreciation: { type: Number, default: 0 },

    // Building photos
    photos: [
      {
        url: { type: String, required: true },
        description: { type: String, default: '' },
        uploaded_at: { type: Date, default: Date.now },
        uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],

    // Calculation tracking
    last_calculated: { type: Date },
    calculation_details: {
      exteriorWallPoints: { type: Number, default: 0 },
      interiorWallPoints: { type: Number, default: 0 },
      roofPoints: { type: Number, default: 0 },
      heatingPoints: { type: Number, default: 0 },
      flooringPoints: { type: Number, default: 0 },
      bedroomBathRate: { type: Number, default: 0 },
      airConditioningPoints: { type: Number, default: 0 },
      extraKitchenPoints: { type: Number, default: 0 },
      generatorPoints: { type: Number, default: 0 },
      totalFeaturePoints: { type: Number, default: 0 },
      buildingValue: { type: Number, default: 0 },

      // New refined calculation components
      totalPoints: { type: Number, default: 0 },
      pointsAsPercentage: { type: Number, default: 0 },
      qualityCodeFactor: { type: Number, default: 1.0 },
      qualityAdjustmentFactor: { type: Number, default: 0 },
      storyHeightFactor: { type: Number, default: 1.0 },
      sizeAdjustmentFactor: { type: Number, default: 1.0 },
      baseRate: { type: Number, default: 0 },
      adjustedBaseRate: { type: Number, default: 0 },
      replacementCostNew: { type: Number, default: 0 },
      ageDepreciation: { type: Number, default: 0 },
      otherDepreciation: { type: Number, default: 0 },
      totalDepreciation: { type: Number, default: 0 },
    },

    // Audit trail
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_at: { type: Date, default: Date.now },

    // Assessment details
    last_changed: { type: Date, default: Date.now },
    change_reason: {
      type: String,
      enum: [
        'revaluation',
        'appeal',
        'new_construction',
        'renovation',
        'market_correction',
        'cyclical_review',
        'condition_change',
        'code_update',
        'sketch_update',
      ],
    },
  },
  {
    collection: 'building_assessments',
  },
);

// Compound index for property + card + year uniqueness
buildingAssessmentSchema.index(
  {
    property_id: 1,
    card_number: 1,
    effective_year: -1,
  },
  { unique: true },
);

buildingAssessmentSchema.index({ municipality_id: 1, effective_year: -1 });

// Update the updated_at field on save
buildingAssessmentSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
    this.last_changed = new Date();
  }
  next();
});

// Trigger total assessment update after save/remove
buildingAssessmentSchema.post('save', async function (doc) {
  try {
    const { updatePropertyTotalAssessment } = require('../utils/assessment');

    await updatePropertyTotalAssessment(
      doc.property_id,
      doc.municipality_id,
      doc.effective_year,
      null, // userId not available in hook
    );
    console.log(
      `Updated total assessment for property ${doc.property_id} after building assessment change`,
    );
  } catch (error) {
    console.error(
      'Error updating total assessment after building assessment save:',
      error,
    );
  }
});

buildingAssessmentSchema.post('remove', async function (doc) {
  try {
    const { updatePropertyTotalAssessment } = require('../utils/assessment');

    await updatePropertyTotalAssessment(
      doc.property_id,
      doc.municipality_id,
      doc.effective_year,
      null, // userId not available in hook
    );
    console.log(
      `Updated total assessment for property ${doc.property_id} after building assessment removal`,
    );
  } catch (error) {
    console.error(
      'Error updating total assessment after building assessment removal:',
      error,
    );
  }
});

// Static method to get or create building assessment for a property/card
buildingAssessmentSchema.statics.getOrCreateForPropertyCard = async function (
  propertyId,
  municipalityId,
  cardNumber = 1,
  year = null,
) {
  try {
    const currentYear = year || new Date().getFullYear();

    let buildingAssessment = await this.findOne({
      property_id: propertyId,
      card_number: cardNumber,
      effective_year: currentYear,
    });

    if (!buildingAssessment) {
      console.log(
        `Creating new building assessment for property ${propertyId}, card ${cardNumber}, year ${currentYear}`,
      );

      buildingAssessment = new this({
        property_id: propertyId,
        municipality_id: municipalityId,
        card_number: cardNumber,
        effective_year: currentYear,
      });

      try {
        await buildingAssessment.save();
        console.log(
          `Successfully created building assessment for property ${propertyId}`,
        );
      } catch (saveError) {
        console.error(
          `Error saving building assessment for property ${propertyId}:`,
          {
            error: saveError.message,
            propertyId,
            municipalityId,
            cardNumber,
            currentYear,
          },
        );

        // If it's a duplicate key error, try to find the existing record
        if (
          saveError.code === 11000 ||
          saveError.message.includes('duplicate key')
        ) {
          console.log(
            `Duplicate key error, attempting to find existing record for property ${propertyId}`,
          );
          buildingAssessment = await this.findOne({
            property_id: propertyId,
            card_number: cardNumber,
            effective_year: currentYear,
          });

          if (!buildingAssessment) {
            throw new Error(
              `Failed to create or find building assessment for property ${propertyId}: ${saveError.message}`,
            );
          }
        } else {
          throw saveError;
        }
      }
    }

    return buildingAssessment;
  } catch (error) {
    console.error(
      `Error in getOrCreateForPropertyCard for property ${propertyId}:`,
      {
        error: error.message,
        stack: error.stack,
        propertyId,
        municipalityId,
        cardNumber,
        year,
      },
    );
    throw error;
  }
};

// Static method to update building assessment
buildingAssessmentSchema.statics.updateForPropertyCard = async function (
  propertyId,
  municipalityId,
  cardNumber,
  assessmentData,
  userId,
  year = null,
) {
  const currentYear = year || new Date().getFullYear();

  const updateData = {
    ...assessmentData,
    municipality_id: municipalityId, // Ensure municipality_id is always set
    updated_by: userId,
    updated_at: new Date(),
    last_changed: new Date(),
  };

  let buildingAssessment = await this.findOneAndUpdate(
    {
      property_id: propertyId,
      card_number: cardNumber,
      effective_year: currentYear,
    },
    updateData,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  // Ensure municipality_id is set - if not, manually set it and save
  if (!buildingAssessment.municipality_id) {
    buildingAssessment.municipality_id = municipalityId;
    await buildingAssessment.save();

    // Reload the document to ensure all fields are properly populated
    buildingAssessment = await this.findById(buildingAssessment._id);
  }

  // Calculate and update building value automatically
  try {
    await buildingAssessment.calculateAndUpdateValue();
    await buildingAssessment.save();
    console.log('Building value calculated successfully for property:', propertyId);
  } catch (calcError) {
    console.warn('Building value calculation failed, saving without calculation:', calcError.message);
    // Save the building assessment without calculation if calculation fails
    await buildingAssessment.save();
  }

  return buildingAssessment;
};

// Static method to calculate building value with configurable parameters
buildingAssessmentSchema.statics.calculateBuildingValue = async function (
  buildingAssessment,
  calculationConfig = null,
) {
  let config = calculationConfig;

  // If no config provided, get it from the municipality's settings
  if (!config) {
    if (!buildingAssessment.municipality_id) {
      throw new Error(
        'Municipality ID is required for building value calculation',
      );
    }

    const BuildingCalculationConfig = require('./BuildingCalculationConfig');
    const configDoc =
      await BuildingCalculationConfig.getOrCreateForMunicipality(
        buildingAssessment.municipality_id,
        buildingAssessment.effective_year,
      );
    config = configDoc.toCalculationConfig();
  }

  // Load reference data for shared calculator
  const BuildingFeatureCode = require('./BuildingFeatureCode');
  const BuildingLadder = require('./BuildingLadder');

  const [buildingFeatureCodes, buildingLadders] = await Promise.all([
    BuildingFeatureCode.find({
      municipalityId: buildingAssessment.municipality_id,
      isActive: true,
    }),
    BuildingLadder.find({
      municipalityId: buildingAssessment.municipality_id,
      isActive: true,
    }),
  ]);

  // Use shared calculator
  const BuildingAssessmentCalculator = require('../../app/utils/building-assessment-calculator');
  const calculator = new BuildingAssessmentCalculator({
    buildingFeatureCodes,
    buildingLadders,
    calculationConfig: config,
  });

  return calculator.calculateBuildingValue(buildingAssessment, config);
};

// Instance method to calculate and update building value
buildingAssessmentSchema.methods.calculateAndUpdateValue = async function (
  calculationConfig = null,
) {
  try {
    const calculations = await this.constructor.calculateBuildingValue(
      this,
      calculationConfig,
    );

    if (!calculations.error) {
    this.building_value = calculations.buildingValue;
    this.replacement_cost_new = calculations.replacementCostNew; // Store the replacement cost new
    this.assessed_value = calculations.buildingValue; // Assessed value equals calculated value initially
    this.base_rate = calculations.baseRate; // Store the actual base rate used
    this.age = calculations.buildingAge; // Store the calculated age
    this.last_calculated = new Date();

    // Update normal depreciation percentage if it was calculated (not manually entered)
    if (!this.depreciation) {
      this.depreciation = {
        normal: { description: '', percentage: 0 },
        physical: { notes: '', percentage: 0 },
        functional: { notes: '', percentage: 0 },
        economic: { notes: '', percentage: 0 },
        temporary: { notes: '', percentage: 0 },
      };
    }

    // Only update the normal depreciation percentage if it was calculated, preserve user-entered values
    if (
      this.depreciation?.normal?.percentage === null ||
      this.depreciation?.normal?.percentage === undefined
    ) {
      if (!this.depreciation.normal) {
        this.depreciation.normal = { description: '', percentage: 0 };
      }
      // Store as percentage (calculations.normalDepreciation is already decimal, so multiply by 100)
      this.depreciation.normal.percentage =
        calculations.normalDepreciation * 100;
    } else if (
      calculations.buildingAge > 0 &&
      calculations.baseDepreciationRate > 0
    ) {
      // Always update if we have valid age and base rate, even if user had previous value
      // This ensures the depreciation stays current with building age and condition
      if (!this.depreciation.normal) {
        this.depreciation.normal = { description: '', percentage: 0 };
      }
      this.depreciation.normal.percentage =
        calculations.normalDepreciation * 100;
    }

    // Store calculation breakdown for transparency
    this.calculation_details = calculations;
    } else {
      console.warn('Building value calculation returned error:', calculations.error);
      throw new Error(calculations.error);
    }

    return calculations;
  } catch (error) {
    console.error('Error in calculateAndUpdateValue:', error.message);
    throw error;
  }
};

// Static method for mass recalculation of building assessments
buildingAssessmentSchema.statics.massRecalculateForMunicipality =
  async function (municipalityId, year = null, options = {}) {
    const currentYear = year || new Date().getFullYear();
    const batchSize = options.batchSize || 50; // Process in batches to avoid memory issues

    console.log(
      `Starting mass building recalculation for municipality ${municipalityId}, year ${currentYear}`,
    );

    let processed = 0;
    let updated = 0;
    let errors = 0;
    const errorLog = [];

    try {
      // Get total count for progress tracking
      const totalCount = await this.countDocuments({
        municipality_id: municipalityId,
        effective_year: currentYear,
      });

      console.log(`Found ${totalCount} building assessments to recalculate`);

      // Process in batches
      let skip = 0;
      while (skip < totalCount) {
        const batch = await this.find({
          municipalityId: municipalityId,
          effective_year: currentYear,
        })
          .skip(skip)
          .limit(batchSize);

        console.log(
          `Processing batch ${Math.floor(skip / batchSize) + 1} of ${Math.ceil(totalCount / batchSize)} (${batch.length} assessments)`,
        );

        // Process each assessment in the batch
        for (const assessment of batch) {
          try {
            const oldValue = assessment.building_value;

            // Recalculate the building value
            await assessment.calculateAndUpdateValue();
            await assessment.save();

            const newValue = assessment.building_value;

            if (oldValue !== newValue) {
              updated++;
              console.log(
                `Updated assessment ${assessment._id}: ${oldValue} -> ${newValue}`,
              );
            }

            processed++;
          } catch (error) {
            errors++;
            const errorMessage = `Error processing assessment ${assessment._id}: ${error.message}`;
            console.error(errorMessage);
            errorLog.push(errorMessage);
          }
        }

        skip += batchSize;

        // Log progress
        const progress = Math.min(100, ((skip / totalCount) * 100).toFixed(1));
        console.log(
          `Progress: ${progress}% (${processed}/${totalCount} processed, ${updated} updated, ${errors} errors)`,
        );
      }

      const summary = {
        municipalityId,
        year: currentYear,
        totalProcessed: processed,
        totalUpdated: updated,
        totalErrors: errors,
        errorLog: errorLog,
        completedAt: new Date(),
      };

      console.log('Mass recalculation completed:', summary);
      return summary;
    } catch (error) {
      console.error('Mass recalculation failed:', error);
      throw new Error(`Mass recalculation failed: ${error.message}`);
    }
  };

// Static method for mass recalculation with specific filters
buildingAssessmentSchema.statics.massRecalculateWithFilters = async function (
  municipalityId,
  filters = {},
  year = null,
  options = {},
) {
  const currentYear = year || new Date().getFullYear();

  // Build query based on filters
  const query = {
    municipality_id: municipalityId,
    effective_year: currentYear,
    ...filters,
  };

  console.log(`Starting filtered mass building recalculation:`, query);

  const batchSize = options.batchSize || 50;
  let processed = 0;
  let updated = 0;
  let errors = 0;
  const errorLog = [];

  try {
    const totalCount = await this.countDocuments(query);
    console.log(`Found ${totalCount} building assessments matching filters`);

    let skip = 0;
    while (skip < totalCount) {
      const batch = await this.find(query).skip(skip).limit(batchSize);

      for (const assessment of batch) {
        try {
          const oldValue = assessment.building_value;
          await assessment.calculateAndUpdateValue();
          await assessment.save();

          if (oldValue !== assessment.building_value) {
            updated++;
          }
          processed++;
        } catch (error) {
          errors++;
          errorLog.push(
            `Error processing assessment ${assessment._id}: ${error.message}`,
          );
        }
      }

      skip += batchSize;
    }

    return {
      municipalityId,
      year: currentYear,
      filters,
      totalProcessed: processed,
      totalUpdated: updated,
      totalErrors: errors,
      errorLog,
      completedAt: new Date(),
    };
  } catch (error) {
    throw new Error(`Filtered mass recalculation failed: ${error.message}`);
  }
};

// Static method to calculate building type statistics for a municipality
buildingAssessmentSchema.statics.getBuildingTypeStatistics = async function (
  municipalityId,
  year = null,
) {
  const currentYear = year || new Date().getFullYear();

  try {
    const stats = await this.aggregate([
      {
        $match: {
          municipality_id: new mongoose.Types.ObjectId(municipalityId),
          effective_year: currentYear,
          base_type: { $in: ['RSA', 'COM', 'IND', 'MAN'] }, // Residential, Commercial, Industrial, Manufactured
          effective_area: { $gt: 0 }, // Only include buildings with valid effective area
        },
      },
      {
        $group: {
          _id: '$base_type',
          sizes: { $push: '$effective_area' },
          count: { $sum: 1 },
          avgSize: { $avg: '$effective_area' },
          minSize: { $min: '$effective_area' },
          maxSize: { $max: '$effective_area' },
        },
      },
    ]);

    // Calculate median for each building type
    const result = {};
    for (const stat of stats) {
      const sizes = stat.sizes.sort((a, b) => a - b);
      const median =
        sizes.length % 2 === 0
          ? (sizes[sizes.length / 2 - 1] + sizes[sizes.length / 2]) / 2
          : sizes[Math.floor(sizes.length / 2)];

      const buildingType =
        {
          RSA: 'residential',
          COM: 'commercial',
          IND: 'industrial',
          MAN: 'manufactured',
        }[stat._id] || stat._id.toLowerCase();

      result[buildingType] = {
        count: stat.count,
        median: Math.round(median),
        average: Math.round(stat.avgSize),
        min: stat.minSize,
        max: stat.maxSize,
      };
    }

    // Ensure all building types are represented
    ['residential', 'commercial', 'industrial', 'manufactured'].forEach(
      (type) => {
        if (!result[type]) {
          result[type] = {
            count: 0,
            median: 0,
            average: 0,
            min: 0,
            max: 0,
          };
        }
      },
    );

    return result;
  } catch (error) {
    console.error('Error calculating building type statistics:', error);
    return {
      residential: { count: 0, median: 0, average: 0, min: 0, max: 0 },
      commercial: { count: 0, median: 0, average: 0, min: 0, max: 0 },
      industrial: { count: 0, median: 0, average: 0, min: 0, max: 0 },
      manufactured: { count: 0, median: 0, average: 0, min: 0, max: 0 },
    };
  }
};

// Trigger total assessment update after save/remove
buildingAssessmentSchema.post('save', async function (doc) {
  try {
    const { updatePropertyTotalAssessment } = require('../utils/assessment');

    await updatePropertyTotalAssessment(
      doc.property_id,
      doc.municipality_id,
      doc.effective_year,
      null, // userId not available in hook
    );
    console.log(
      `Updated total assessment for property ${doc.property_id} after building assessment change`,
    );
  } catch (error) {
    console.error(
      'Error updating total assessment after building assessment save:',
      error,
    );
  }
});

buildingAssessmentSchema.post('remove', async function (doc) {
  try {
    const { updatePropertyTotalAssessment } = require('../utils/assessment');

    await updatePropertyTotalAssessment(
      doc.property_id,
      doc.municipality_id,
      doc.effective_year,
      null, // userId not available in hook
    );
    console.log(
      `Updated total assessment for property ${doc.property_id} after building assessment removal`,
    );
  } catch (error) {
    console.error(
      'Error updating total assessment after building assessment removal:',
      error,
    );
  }
});

module.exports = mongoose.model('BuildingAssessment', buildingAssessmentSchema);
