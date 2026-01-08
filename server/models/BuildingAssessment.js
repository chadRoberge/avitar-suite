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

    // Version tracking for copy-on-write pattern
    previous_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingAssessment',
      default: null,
    },
    next_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingAssessment',
      default: null,
    },

    // Basic Building Information
    building_model: { type: String, trim: true },
    frame: { type: mongoose.Schema.Types.ObjectId, ref: 'BuildingFeatureCode' },
    frame_height: { type: Number },
    ceiling_height: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    year_built: { type: Number },
    base_type: { type: mongoose.Schema.Types.ObjectId, ref: 'BuildingCode' },
    quality_grade: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    story_height: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },

    // Roof Details
    roof_style: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    roof_cover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },

    // Wall Details
    exterior_wall_1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    exterior_wall_2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    interior_wall_1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    interior_wall_2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },

    // Flooring
    flooring_1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    flooring_2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },

    // Heating/Cooling
    heating_fuel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    heating_type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    air_conditioning: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },

    // Room Details
    bedrooms: { type: Number, default: 0 },
    full_baths: { type: Number, default: 0 },
    half_baths: { type: Number, default: 0 },
    extra_kitchen: { type: Number, default: 0 },
    fireplaces: { type: Number, default: 0 },

    // Additional Features
    generator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },
    condition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BuildingFeatureCode',
    },

    // Building Valuation
    base_rate: { type: Number, default: 0 },
    building_value: { type: Number, default: 0 },
    replacement_cost_new: { type: Number, default: 0 },
    assessed_value: { type: Number, default: 0 },

    // Building size and area information
    gross_area: { type: Number, default: 0 },
    gross_living_area: { type: Number, default: 0 },
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

// Trigger parcel assessment update after save
buildingAssessmentSchema.post('save', async function (doc) {
  try {
    const { updateParcelAssessment } = require('../utils/assessment');

    console.log(
      `[Card ${doc.card_number}] Building assessment saved, triggering parcel recalculation for property ${doc.property_id}...`,
    );
    console.log(
      `[Card ${doc.card_number}] Building value: $${doc.building_value?.toLocaleString() || 0}`,
    );

    const result = await updateParcelAssessment(
      doc.property_id,
      doc.municipality_id,
      doc.effective_year,
      { trigger: 'building_update', userId: null },
    );

    console.log(
      `[Card ${doc.card_number}] ✓ Parcel assessment updated:`,
      `Total: $${result.parcelTotals.total_assessed_value.toLocaleString()},`,
      `Change: ${result.changeAmount > 0 ? '+' : ''}$${result.changeAmount.toLocaleString()} (${result.changePercentage}%)`,
    );
  } catch (error) {
    console.error(
      `[Card ${doc.card_number}] ✗ Error updating parcel assessment after building save:`,
      {
        propertyId: doc.property_id,
        cardNumber: doc.card_number,
        buildingValue: doc.building_value,
        error: error.message,
        stack: error.stack,
      },
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
    console.log(
      `[Card ${cardNumber}] Calculating building value for property ${propertyId}...`,
    );
    const calculations = await buildingAssessment.calculateAndUpdateValue();
    await buildingAssessment.save();
    console.log(
      `[Card ${cardNumber}] Building value calculated successfully for property ${propertyId}:`,
      {
        propertyId,
        cardNumber,
        buildingValue: buildingAssessment.building_value,
        effectiveArea: buildingAssessment.effective_area,
        baseType: buildingAssessment.base_type,
        calculationSuccess: true,
      },
    );
  } catch (calcError) {
    console.error(
      `[Card ${cardNumber}] Building value calculation FAILED for property ${propertyId}:`,
      {
        propertyId,
        cardNumber,
        error: calcError.message,
        stack: calcError.stack,
        buildingData: {
          base_type: buildingAssessment.base_type,
          effective_area: buildingAssessment.effective_area,
          quality_grade: buildingAssessment.quality_grade,
          year_built: buildingAssessment.year_built,
        },
      },
    );
    // Save the building assessment without calculation if calculation fails
    // This ensures the data is saved but building_value will be 0
    await buildingAssessment.save();
    console.warn(
      `[Card ${cardNumber}] Saved building assessment WITHOUT calculated value - building_value will be 0`,
    );
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
  const BuildingCode = require('./BuildingCode');

  const [buildingFeatureCodes, buildingCodes] = await Promise.all([
    BuildingFeatureCode.find({
      municipalityId: buildingAssessment.municipality_id,
      isActive: true,
    }),
    BuildingCode.find({
      municipalityId: buildingAssessment.municipality_id,
      isActive: true,
    }),
  ]);

  // Use shared calculator
  const BuildingAssessmentCalculator = require('../utils/building-assessment-calculator');
  const calculator = new BuildingAssessmentCalculator({
    buildingFeatureCodes,
    buildingCodes,
    calculationConfig: config,
    municipalityId: buildingAssessment.municipality_id,
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
      this.building_value =
        Math.round((calculations.buildingValue || 0) / 100) * 100;
      this.replacement_cost_new = calculations.replacementCostNew; // Store the replacement cost new
      this.assessed_value =
        Math.round((calculations.buildingValue || 0) / 100) * 100; // Assessed value equals calculated value initially
      this.base_rate = calculations.baseRate; // Store the actual base rate used
      this.age = calculations.buildingAge; // Store the calculated age
      this.last_calculated = new Date();

      // Update depreciation fields
      if (!this.depreciation) {
        this.depreciation = {
          normal: { description: '', percentage: 0 },
          physical: { notes: '', percentage: 0 },
          functional: { notes: '', percentage: 0 },
          economic: { notes: '', percentage: 0 },
          temporary: { notes: '', percentage: 0 },
        };
      }

      // Ensure normal depreciation object exists
      if (!this.depreciation.normal) {
        this.depreciation.normal = { description: '', percentage: 0 };
      }

      // Update normal depreciation percentage from calculation
      // (calculations use the description/condition factor if set)
      if (calculations.buildingAge > 0 && calculations.baseDepreciationRate > 0) {
        // Store as percentage (calculations.normalDepreciation is decimal, so multiply by 100)
        this.depreciation.normal.percentage =
          calculations.normalDepreciation * 100;
      }

      // Store total depreciation (as percentage)
      this.total_depreciation = calculations.totalDepreciation * 100;

      // Store calculation breakdown for transparency
      this.calculation_details = calculations;
    } else {
      console.warn(
        'Building value calculation returned error:',
        calculations.error,
      );
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

/**
 * Get effective building assessment for a property/card/year using temporal query
 * Returns the most recent record where effective_year <= requested year
 * @param {ObjectId} propertyId - Property ID
 * @param {number} cardNumber - Card number
 * @param {number} year - Assessment year
 * @param {Object} options - Query options (populate, etc.)
 * @returns {Object|null} - The effective building assessment
 */
buildingAssessmentSchema.statics.getForPropertyYear = async function (
  propertyId,
  cardNumber = 1,
  year = null,
  options = {},
) {
  const currentYear = year || new Date().getFullYear();

  let query = this.findOne({
    property_id: propertyId,
    card_number: cardNumber,
    effective_year: { $lte: currentYear },
  }).sort({ effective_year: -1 });

  // Apply populates if requested
  if (options.populate) {
    if (Array.isArray(options.populate)) {
      options.populate.forEach((field) => {
        query = query.populate(field);
      });
    } else {
      query = query.populate(options.populate);
    }
  }

  return query;
};

/**
 * Get all effective building assessments for a property (all cards) for a year
 * Uses aggregation to get most recent record per card
 * @param {ObjectId} propertyId - Property ID
 * @param {number} year - Assessment year
 * @returns {Array} - Array of effective building assessments per card
 */
buildingAssessmentSchema.statics.getEffectiveCardsForProperty = async function (
  propertyId,
  year = null,
) {
  const currentYear = year || new Date().getFullYear();

  return this.aggregate([
    {
      $match: {
        property_id: new mongoose.Types.ObjectId(propertyId),
        effective_year: { $lte: currentYear },
      },
    },
    { $sort: { card_number: 1, effective_year: -1 } },
    {
      $group: {
        _id: '$card_number',
        doc: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { card_number: 1 } },
  ]);
};

/**
 * Sanitize assessment data by removing invalid ObjectId values
 * Fields that expect ObjectId references but receive invalid strings are removed
 */
function sanitizeAssessmentData(data) {
  const objectIdFields = [
    'frame',
    'base_type',
    'quality',
    'exterior_wall',
    'interior_wall',
    'roofing',
    'roof_style',
    'flooring',
    'heating_fuel',
    'heating_type',
    'air_conditioning',
    'generator',
    'story_height',
    'ceiling_height',
  ];

  const sanitized = { ...data };

  for (const field of objectIdFields) {
    if (sanitized[field] !== undefined && sanitized[field] !== null) {
      const value = sanitized[field];
      // Check if it's a valid ObjectId (24 hex characters or already an ObjectId)
      if (typeof value === 'string') {
        if (!/^[0-9a-fA-F]{24}$/.test(value)) {
          // Invalid ObjectId string - remove it
          delete sanitized[field];
        }
      } else if (typeof value !== 'object' || !value._bsontype) {
        // Not a valid ObjectId object - remove it
        delete sanitized[field];
      }
    }
  }

  return sanitized;
}

/**
 * Update building assessment for a property/card/year using copy-on-write
 * If the year doesn't have a record, copies from the effective record
 * @param {ObjectId} propertyId - Property ID
 * @param {ObjectId} municipalityId - Municipality ID
 * @param {number} cardNumber - Card number
 * @param {Object} assessmentData - Data to update
 * @param {ObjectId} userId - User ID for audit
 * @param {number} year - Assessment year
 * @returns {Object} - The created or updated building assessment
 */
buildingAssessmentSchema.statics.updateForPropertyCardYear = async function (
  propertyId,
  municipalityId,
  cardNumber,
  assessmentData,
  userId,
  year = null,
) {
  const currentYear = year || new Date().getFullYear();

  // Sanitize incoming data to remove invalid ObjectId values
  const cleanedData = sanitizeAssessmentData(assessmentData);

  // Check if record for this year exists
  let record = await this.findOne({
    property_id: propertyId,
    card_number: cardNumber,
    effective_year: currentYear,
  });

  if (record) {
    // Deep merge depreciation to preserve all nested properties
    if (cleanedData.depreciation) {
      if (!record.depreciation) {
        record.depreciation = {
          normal: { description: '', percentage: 0 },
          physical: { notes: '', percentage: 0 },
          functional: { notes: '', percentage: 0 },
          economic: { notes: '', percentage: 0 },
          temporary: { notes: '', percentage: 0 },
        };
      }

      // Merge each depreciation type separately to preserve all fields
      if (cleanedData.depreciation.normal) {
        record.depreciation.normal = {
          ...record.depreciation.normal,
          ...cleanedData.depreciation.normal,
        };
      }
      if (cleanedData.depreciation.physical) {
        record.depreciation.physical = {
          ...record.depreciation.physical,
          ...cleanedData.depreciation.physical,
        };
      }
      if (cleanedData.depreciation.functional) {
        record.depreciation.functional = {
          ...record.depreciation.functional,
          ...cleanedData.depreciation.functional,
        };
      }
      if (cleanedData.depreciation.economic) {
        record.depreciation.economic = {
          ...record.depreciation.economic,
          ...cleanedData.depreciation.economic,
        };
      }
      if (cleanedData.depreciation.temporary) {
        record.depreciation.temporary = {
          ...record.depreciation.temporary,
          ...cleanedData.depreciation.temporary,
        };
      }

      // Remove depreciation from cleanedData to avoid shallow overwrite
      const { depreciation: _depToIgnore, ...restData } = cleanedData;
      void _depToIgnore; // Suppress unused variable warning
      Object.assign(record, restData);
    } else {
      // No depreciation in update, just do regular assign
      Object.assign(record, cleanedData);
    }

    record.municipality_id = municipalityId;
    record.updated_by = userId;
    record.updated_at = new Date();
    record.last_changed = new Date();

    // Recalculate value
    try {
      await record.calculateAndUpdateValue();
    } catch (calcError) {
      console.warn('Failed to calculate value during update:', calcError.message);
    }

    await record.save();
    return record;
  }

  // Get effective record to copy from (copy-on-write)
  const effectiveRecord = await this.getForPropertyYear(propertyId, cardNumber, currentYear);

  if (effectiveRecord) {
    // Copy from effective record
    const recordData = effectiveRecord.toObject();
    delete recordData._id;
    delete recordData.createdAt;
    delete recordData.updatedAt;

    // Deep merge depreciation from existing record and new data
    let mergedDepreciation = recordData.depreciation || {
      normal: { description: '', percentage: 0 },
      physical: { notes: '', percentage: 0 },
      functional: { notes: '', percentage: 0 },
      economic: { notes: '', percentage: 0 },
      temporary: { notes: '', percentage: 0 },
    };

    if (cleanedData.depreciation) {
      if (cleanedData.depreciation.normal) {
        mergedDepreciation.normal = {
          ...mergedDepreciation.normal,
          ...cleanedData.depreciation.normal,
        };
      }
      if (cleanedData.depreciation.physical) {
        mergedDepreciation.physical = {
          ...mergedDepreciation.physical,
          ...cleanedData.depreciation.physical,
        };
      }
      if (cleanedData.depreciation.functional) {
        mergedDepreciation.functional = {
          ...mergedDepreciation.functional,
          ...cleanedData.depreciation.functional,
        };
      }
      if (cleanedData.depreciation.economic) {
        mergedDepreciation.economic = {
          ...mergedDepreciation.economic,
          ...cleanedData.depreciation.economic,
        };
      }
      if (cleanedData.depreciation.temporary) {
        mergedDepreciation.temporary = {
          ...mergedDepreciation.temporary,
          ...cleanedData.depreciation.temporary,
        };
      }
    }

    // Remove depreciation from cleanedData to use merged version
    const { depreciation: _depToRemove, ...restCleanedData } = cleanedData;
    void _depToRemove; // Suppress unused variable warning

    record = new this({
      ...recordData,
      ...restCleanedData,
      depreciation: mergedDepreciation,
      property_id: propertyId,
      municipality_id: municipalityId,
      card_number: cardNumber,
      effective_year: currentYear,
      created_by: userId,
      created_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
      last_changed: new Date(),
      change_reason: cleanedData.change_reason || 'cyclical_review',
    });
  } else {
    // No prior record - create new
    record = new this({
      property_id: propertyId,
      municipality_id: municipalityId,
      card_number: cardNumber,
      effective_year: currentYear,
      ...cleanedData,
      created_by: userId,
      created_at: new Date(),
      updated_by: userId,
      updated_at: new Date(),
    });
  }

  // Calculate value before saving
  try {
    await record.calculateAndUpdateValue();
  } catch (calcError) {
    console.warn('Failed to calculate value during creation:', calcError.message);
  }

  await record.save();
  return record;
};

/**
 * Get year history for a property/card showing inherited vs explicit values
 * @param {ObjectId} propertyId - Property ID
 * @param {number} cardNumber - Card number
 * @param {number} startYear - Start year
 * @param {number} endYear - End year
 * @returns {Array} - Year history with inheritance info
 */
buildingAssessmentSchema.statics.getYearHistory = async function (
  propertyId,
  cardNumber,
  startYear,
  endYear,
) {
  const history = [];

  for (let year = startYear; year <= endYear; year++) {
    const record = await this.getForPropertyYear(propertyId, cardNumber, year);

    history.push({
      year,
      effectiveYear: record?.effective_year || null,
      isInherited: record ? record.effective_year !== year : true,
      hasData: !!record,
      buildingValue: record?.building_value || 0,
      effectiveArea: record?.effective_area || 0,
      yearBuilt: record?.year_built || null,
    });
  }

  return history;
};

// Trigger parcel assessment update after remove
buildingAssessmentSchema.post('remove', async function (doc) {
  try {
    const { updateParcelAssessment } = require('../utils/assessment');

    console.log(
      `[Card ${doc.card_number}] Building assessment removed, recalculating parcel for property ${doc.property_id}...`,
    );

    const result = await updateParcelAssessment(
      doc.property_id,
      doc.municipality_id,
      doc.effective_year,
      { trigger: 'building_update', userId: null },
    );

    console.log(
      `[Card ${doc.card_number}] ✓ Parcel assessment updated after removal:`,
      `Total: $${result.parcelTotals.total_assessed_value.toLocaleString()}`,
    );
  } catch (error) {
    console.error(
      `[Card ${doc.card_number}] ✗ Error updating parcel assessment after building removal:`,
      {
        propertyId: doc.property_id,
        cardNumber: doc.card_number,
        error: error.message,
      },
    );
  }
});

module.exports = mongoose.model('BuildingAssessment', buildingAssessmentSchema);
