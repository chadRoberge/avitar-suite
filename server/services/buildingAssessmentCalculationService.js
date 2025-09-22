const BuildingAssessmentCalculator = require('../../app/utils/building-assessment-calculator');
const BuildingAssessment = require('../models/BuildingAssessment');
const BuildingFeatureCode = require('../models/BuildingFeatureCode');
const BuildingCode = require('../models/BuildingCode');
const BuildingCalculationConfig = require('../models/BuildingCalculationConfig');

/**
 * Backend service for building assessment calculations
 * Uses shared calculation logic for consistency with frontend
 */
class BuildingAssessmentCalculationService {
  constructor() {
    this.calculator = null;
    this.referenceData = {};
  }

  /**
   * Initialize the service with reference data for a municipality
   * @param {String} municipalityId - Municipality ID
   * @param {Number} effectiveYear - Assessment year
   */
  async initialize(municipalityId, effectiveYear = null) {
    try {
      const currentYear = effectiveYear || new Date().getFullYear();
      console.log(
        `Initializing building assessment calculator for municipality: ${municipalityId}, year: ${currentYear}`,
      );

      // Load all reference data in parallel
      const [buildingFeatureCodes, buildingCodes, calculationConfig] =
        await Promise.all([
          BuildingFeatureCode.find({
            municipalityId: municipalityId,
            isActive: true,
          }),
          BuildingCode.find({
            municipalityId: municipalityId,
            is_active: true,
          }),
          BuildingCalculationConfig.getOrCreateForMunicipality(
            municipalityId,
            currentYear,
          ),
        ]);

      // Prepare reference data for calculator
      this.referenceData = {
        buildingFeatureCodes,
        buildingLadders: buildingCodes,
        calculationConfig: calculationConfig.toCalculationConfig(),
      };

      // Initialize calculator with reference data
      this.calculator = new BuildingAssessmentCalculator(this.referenceData);

      console.log(
        `Calculator initialized with ${buildingFeatureCodes.length} feature codes, ${buildingCodes.length} building codes`,
      );
      return true;
    } catch (error) {
      console.error(
        'Failed to initialize building assessment calculator:',
        error,
      );
      throw error;
    }
  }

  /**
   * Calculate assessment values for a single building assessment
   * @param {Object} buildingAssessment - BuildingAssessment document
   * @returns {Object} Calculated assessment values
   */
  calculateBuildingAssessment(buildingAssessment) {
    if (!this.calculator) {
      throw new Error(
        'Calculator not initialized. Call initialize(municipalityId) first.',
      );
    }

    if (!buildingAssessment) {
      return this.getDefaultCalculations();
    }

    return this.calculator.calculateBuildingValue(
      buildingAssessment.toObject(),
      this.referenceData.calculationConfig,
    );
  }

  /**
   * Recalculate all building assessments for a municipality
   * @param {String} municipalityId - Municipality ID
   * @param {Number} effectiveYear - Assessment year
   * @param {Object} options - Calculation options
   * @returns {Object} Summary of recalculation results
   */
  async recalculateAllProperties(
    municipalityId,
    effectiveYear = null,
    options = {},
  ) {
    const currentYear = effectiveYear || new Date().getFullYear();
    await this.initialize(municipalityId, currentYear);

    console.log(
      `Starting municipality-wide building recalculation for: ${municipalityId}, year: ${currentYear}`,
    );

    const batchSize = options.batchSize || 100;
    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      // Get total count for progress tracking
      const totalCount = await BuildingAssessment.countDocuments({
        municipality_id: municipalityId,
        effective_year: currentYear,
      });

      console.log(`Found ${totalCount} building assessments to recalculate`);

      // Process in batches to avoid memory issues
      for (let offset = 0; offset < totalCount; offset += batchSize) {
        const buildingAssessments = await BuildingAssessment.find({
          municipality_id: municipalityId,
          effective_year: currentYear,
        })
          .skip(offset)
          .limit(batchSize);

        // Process batch
        const batchPromises = buildingAssessments.map(
          async (buildingAssessment) => {
            try {
              const calculatedValues =
                this.calculateBuildingAssessment(buildingAssessment);

              if (!calculatedValues.error) {
                // Update building assessment with new calculated values
                buildingAssessment.building_value =
                  calculatedValues.buildingValue;
                buildingAssessment.replacement_cost_new =
                  calculatedValues.replacementCostNew;
                buildingAssessment.assessed_value =
                  calculatedValues.buildingValue;
                buildingAssessment.base_rate = calculatedValues.baseRate;
                buildingAssessment.age = calculatedValues.buildingAge;
                buildingAssessment.calculation_details = calculatedValues;
                buildingAssessment.last_calculated = new Date();

                if (options.save !== false) {
                  await buildingAssessment.save();
                }

                return {
                  success: true,
                  propertyId: buildingAssessment.property_id,
                  cardNumber: buildingAssessment.card_number,
                  values: calculatedValues,
                };
              } else {
                return {
                  success: false,
                  propertyId: buildingAssessment.property_id,
                  cardNumber: buildingAssessment.card_number,
                  error: calculatedValues.error,
                };
              }
            } catch (error) {
              console.error(
                `Error calculating building assessment ${buildingAssessment._id}:`,
                error,
              );
              return {
                success: false,
                propertyId: buildingAssessment.property_id,
                cardNumber: buildingAssessment.card_number,
                error: error.message,
              };
            }
          },
        );

        const results = await Promise.all(batchPromises);

        // Count results
        results.forEach((result) => {
          processedCount++;
          if (result.success) {
            updatedCount++;
          } else {
            errorCount++;
            errors.push(result);
          }
        });

        // Log progress
        const progress = Math.round((processedCount / totalCount) * 100);
        console.log(
          `Progress: ${progress}% (${processedCount}/${totalCount}) - Updated: ${updatedCount}, Errors: ${errorCount}`,
        );
      }

      const summary = {
        municipalityId,
        year: currentYear,
        totalProperties: totalCount,
        processedCount,
        updatedCount,
        errorCount,
        errors: errors.slice(0, 10), // Limit error details
        completedAt: new Date(),
      };

      console.log(
        'Municipality-wide building recalculation completed:',
        summary,
      );
      return summary;
    } catch (error) {
      console.error(
        'Failed to complete municipality-wide building recalculation:',
        error,
      );
      throw error;
    }
  }

  /**
   * Recalculate properties affected by reference data changes
   * @param {String} municipalityId - Municipality ID
   * @param {String} changeType - Type of change (feature_code, ladder, config, etc.)
   * @param {String} changeId - ID of changed reference data
   * @param {Number} effectiveYear - Assessment year
   * @returns {Object} Summary of selective recalculation
   */
  async recalculateAffectedProperties(
    municipalityId,
    changeType,
    changeId,
    effectiveYear = null,
  ) {
    const currentYear = effectiveYear || new Date().getFullYear();
    await this.initialize(municipalityId, currentYear);

    let query = {
      municipality_id: municipalityId,
      effective_year: currentYear,
    };

    // Build selective query based on change type
    switch (changeType) {
      case 'feature_code':
        // For feature code changes, we might need to recalculate all buildings
        // as they could affect any building using that feature
        break;
      case 'ladder':
        // For ladder changes, affect all buildings of the same class
        query['building_class'] = changeId;
        break;
      case 'config':
        // For config changes, recalculate all buildings
        break;
      case 'base_type':
        query['base_type'] = changeId;
        break;
      case 'quality_grade':
        query['quality_grade'] = changeId;
        break;
      default:
        // For global changes, recalculate all
        break;
    }

    console.log(
      `Recalculating building assessments affected by ${changeType} change:`,
      changeId,
    );

    const affectedBuildingAssessments = await BuildingAssessment.find(query);
    console.log(
      `Found ${affectedBuildingAssessments.length} affected building assessments`,
    );

    let updatedCount = 0;
    let errorCount = 0;

    for (const buildingAssessment of affectedBuildingAssessments) {
      try {
        const calculatedValues =
          this.calculateBuildingAssessment(buildingAssessment);

        if (!calculatedValues.error) {
          buildingAssessment.building_value = calculatedValues.buildingValue;
          buildingAssessment.replacement_cost_new =
            calculatedValues.replacementCostNew;
          buildingAssessment.assessed_value = calculatedValues.buildingValue;
          buildingAssessment.base_rate = calculatedValues.baseRate;
          buildingAssessment.age = calculatedValues.buildingAge;
          buildingAssessment.calculation_details = calculatedValues;
          buildingAssessment.last_calculated = new Date();
          await buildingAssessment.save();

          updatedCount++;
        } else {
          console.error(
            `Error in calculation for building assessment ${buildingAssessment._id}:`,
            calculatedValues.error,
          );
          errorCount++;
        }
      } catch (error) {
        console.error(
          `Error recalculating building assessment ${buildingAssessment._id}:`,
          error,
        );
        errorCount++;
      }
    }

    return {
      municipalityId,
      year: currentYear,
      changeType,
      changeId,
      affectedCount: affectedBuildingAssessments.length,
      updatedCount,
      errorCount,
      completedAt: new Date(),
    };
  }

  /**
   * Validate calculation consistency across properties
   * @param {String} municipalityId - Municipality ID
   * @param {Number} effectiveYear - Assessment year
   * @param {Number} sampleSize - Number of properties to validate
   * @returns {Object} Validation results
   */
  async validateCalculations(
    municipalityId,
    effectiveYear = null,
    sampleSize = 50,
  ) {
    const currentYear = effectiveYear || new Date().getFullYear();
    await this.initialize(municipalityId, currentYear);

    const buildingAssessments = await BuildingAssessment.aggregate([
      {
        $match: {
          municipality_id: municipalityId,
          effective_year: currentYear,
        },
      },
      { $sample: { size: sampleSize } },
    ]);

    const validationResults = [];

    for (const buildingAssessment of buildingAssessments) {
      const storedValue = buildingAssessment.building_value || 0;
      const calculatedValues =
        this.calculateBuildingAssessment(buildingAssessment);
      const recalculatedValue = calculatedValues.buildingValue || 0;

      const difference = Math.abs(storedValue - recalculatedValue);

      if (difference > 1) {
        // Allow for rounding differences
        validationResults.push({
          propertyId: buildingAssessment.property_id,
          cardNumber: buildingAssessment.card_number,
          storedValue,
          recalculatedValue,
          difference,
          calculationDetails: calculatedValues,
        });
      }
    }

    return {
      municipalityId,
      year: currentYear,
      sampleSize: buildingAssessments.length,
      propertiesWithDiscrepancies: validationResults.length,
      discrepancies: validationResults,
      validatedAt: new Date(),
    };
  }

  /**
   * Get default/empty calculation structure
   */
  getDefaultCalculations() {
    return {
      exteriorWallPoints: 0,
      interiorWallPoints: 0,
      roofPoints: 0,
      heatingPoints: 0,
      flooringPoints: 0,
      bedroomBathRate: 0,
      airConditioningPoints: 0,
      extraKitchenPoints: 0,
      generatorPoints: 0,
      totalFeaturePoints: 0,
      baseRate: 0,
      sizeAdjustmentFactor: 1,
      adjustedBaseRate: 0,
      replacementCostNew: 0,
      buildingAge: 0,
      normalDepreciation: 0,
      physicalDepreciation: 0,
      functionalDepreciation: 0,
      externalDepreciation: 0,
      totalDepreciation: 0,
      baseDepreciationRate: 0,
      buildingValue: 0,
    };
  }
}

module.exports = BuildingAssessmentCalculationService;
