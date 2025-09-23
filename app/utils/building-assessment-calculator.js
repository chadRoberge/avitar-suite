/**
 * Shared Building Assessment Calculations
 *
 * This module contains all building assessment calculation logic that needs to be
 * consistent between frontend and backend. Used for:
 * - Real-time calculations in the UI
 * - Municipality-wide revaluations
 * - Batch processing and data migrations
 * - Validation and auditing
 */

class BuildingAssessmentCalculator {
  constructor(referenceData = {}) {
    this.buildingFeatureCodes = referenceData.buildingFeatureCodes || [];
    this.buildingCodes = referenceData.buildingCodes || [];
    this.calculationConfig = referenceData.calculationConfig || {};

    // Store municipality info for validation
    this.municipalityId = referenceData.municipalityId || null;

    // Caching for batch processing efficiency
    this.featureCache = new Map();
    this.codeCache = new Map();
  }

  /**
   * Calculate complete building assessment with all values
   * @param {Object} buildingData - Building assessment data
   * @param {Object} config - Calculation configuration
   * @returns {Object} Calculated building assessment with all values
   */
  calculateBuildingValue(buildingData, config = null) {
    const calculationConfig = config || this.calculationConfig;

    if (!buildingData || !calculationConfig) {
      return { error: 'Missing required building data or configuration' };
    }

    try {
      let calculations = {
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

      // Step 1: Calculate feature points
      calculations = this.calculateFeaturePoints(buildingData, calculations);

      // Step 2: Get base rate from building ladder
      calculations = this.calculateBaseRate(
        buildingData,
        calculations,
        calculationConfig,
      );

      // Step 3: Apply size adjustment factor
      calculations = this.applySizeAdjustment(
        buildingData,
        calculations,
        calculationConfig,
      );

      // Step 4: Calculate replacement cost new
      calculations = this.calculateReplacementCostNew(
        buildingData,
        calculations,
      );

      // Step 5: Calculate depreciation
      calculations = this.calculateDepreciation(
        buildingData,
        calculations,
        calculationConfig,
      );

      // Step 6: Calculate final building value
      calculations = this.calculateFinalValue(calculations);

      return calculations;
    } catch (error) {
      console.error('Error calculating building value:', error);
      return {
        error: error.message,
        buildingValue: 0,
      };
    }
  }

  /**
   * Calculate points from all building features
   */
  calculateFeaturePoints(buildingData, calculations) {
    // Calculate exterior wall points (average if two walls)
    if (buildingData.exterior_wall_1) {
      const wall1Points = this.getFeaturePoints(
        'exterior_wall',
        buildingData.exterior_wall_1,
      );
      calculations.exteriorWallPoints += wall1Points;
    }

    if (buildingData.exterior_wall_2) {
      const wall2Points = this.getFeaturePoints(
        'exterior_wall',
        buildingData.exterior_wall_2,
      );
      calculations.exteriorWallPoints += wall2Points;
      calculations.exteriorWallPoints = Math.round(
        calculations.exteriorWallPoints / 2,
      ); // Average
    }

    // Calculate interior wall points (average if two walls)
    if (buildingData.interior_wall_1) {
      const wall1Points = this.getFeaturePoints(
        'interior_wall',
        buildingData.interior_wall_1,
      );
      calculations.interiorWallPoints += wall1Points;
    }

    if (buildingData.interior_wall_2) {
      const wall2Points = this.getFeaturePoints(
        'interior_wall',
        buildingData.interior_wall_2,
      );
      calculations.interiorWallPoints += wall2Points;
      calculations.interiorWallPoints = Math.round(
        calculations.interiorWallPoints / 2,
      ); // Average
    }

    // Calculate roof points (style + cover)
    if (buildingData.roof_style) {
      calculations.roofPoints += this.getFeaturePoints(
        'roof_style',
        buildingData.roof_style,
      );
    }
    if (buildingData.roof_cover) {
      calculations.roofPoints += this.getFeaturePoints(
        'roof_cover',
        buildingData.roof_cover,
      );
    }

    // Calculate heating points
    if (buildingData.heating) {
      calculations.heatingPoints = this.getFeaturePoints(
        'heating',
        buildingData.heating,
      );
    }

    // Calculate flooring points
    if (buildingData.flooring) {
      calculations.flooringPoints = this.getFeaturePoints(
        'flooring',
        buildingData.flooring,
      );
    }

    // Calculate air conditioning points
    if (buildingData.air_conditioning) {
      calculations.airConditioningPoints = this.getFeaturePoints(
        'air_conditioning',
        buildingData.air_conditioning,
      );
    }

    // Calculate extra kitchen points
    if (buildingData.extra_kitchen) {
      calculations.extraKitchenPoints = this.getFeaturePoints(
        'extra_kitchen',
        buildingData.extra_kitchen,
      );
    }

    // Calculate generator points
    if (buildingData.generator) {
      calculations.generatorPoints = this.getFeaturePoints(
        'generator',
        buildingData.generator,
      );
    }

    // Calculate bedroom/bath rate
    const bedrooms = buildingData.bedrooms || 0;
    const bathrooms = buildingData.bathrooms || 0;
    calculations.bedroomBathRate = bedrooms + bathrooms;

    // Calculate total feature points
    calculations.totalFeaturePoints =
      calculations.exteriorWallPoints +
      calculations.interiorWallPoints +
      calculations.roofPoints +
      calculations.heatingPoints +
      calculations.flooringPoints +
      calculations.bedroomBathRate +
      calculations.airConditioningPoints +
      calculations.extraKitchenPoints +
      calculations.generatorPoints;

    return calculations;
  }

  /**
   * Get base rate from building code based on base_type
   */
  calculateBaseRate(buildingData, calculations, config) {
    const baseType = buildingData.base_type;

    // Find the building code that matches the base_type
    const buildingCode = this.getBuildingCodeByType(baseType);

    if (buildingCode) {
      calculations.baseRate = buildingCode.rate;
      calculations.baseDepreciationRate = buildingCode.depreciation / 100; // Convert percentage to decimal
    } else {
      calculations.baseRate = config.defaultBaseRate || 0;
      calculations.baseDepreciationRate = config.defaultDepreciationRate || 0;
    }

    return calculations;
  }

  /**
   * Apply size adjustment factor
   */
  applySizeAdjustment(buildingData, calculations, config) {
    const effectiveArea = buildingData.effective_area || 0;

    // Size adjustment logic from config
    if (config.sizeAdjustments && effectiveArea > 0) {
      // Find applicable size adjustment
      const adjustment = config.sizeAdjustments.find(
        (adj) => effectiveArea >= adj.minArea && effectiveArea <= adj.maxArea,
      );
      calculations.sizeAdjustmentFactor = adjustment ? adjustment.factor : 1;
    }

    calculations.adjustedBaseRate =
      calculations.baseRate * calculations.sizeAdjustmentFactor;
    return calculations;
  }

  /**
   * Calculate replacement cost new
   */
  calculateReplacementCostNew(buildingData, calculations) {
    const effectiveArea = buildingData.effective_area || 0;
    calculations.replacementCostNew =
      calculations.adjustedBaseRate * effectiveArea;
    return calculations;
  }

  /**
   * Calculate all depreciation types
   */
  calculateDepreciation(buildingData, calculations, config) {
    // Calculate building age
    calculations.buildingAge = this.calculateBuildingAge(buildingData);

    // Get base depreciation rate from config
    calculations.baseDepreciationRate = config.baseDepreciationRate || 0.04;

    // Calculate normal depreciation
    calculations.normalDepreciation = this.calculateNormalDepreciation(
      buildingData,
      calculations.buildingAge,
      calculations.baseDepreciationRate,
    );

    // Get other depreciation types (user-entered or calculated)
    calculations.physicalDepreciation = this.getDepreciationPercentage(
      buildingData.depreciation?.physical,
    );
    calculations.functionalDepreciation = this.getDepreciationPercentage(
      buildingData.depreciation?.functional,
    );
    calculations.externalDepreciation = this.getDepreciationPercentage(
      buildingData.depreciation?.external,
    );

    // Calculate total depreciation
    calculations.totalDepreciation =
      calculations.normalDepreciation +
      calculations.physicalDepreciation +
      calculations.functionalDepreciation +
      calculations.externalDepreciation;

    // Cap total depreciation at 95%
    calculations.totalDepreciation = Math.min(
      calculations.totalDepreciation,
      0.95,
    );

    return calculations;
  }

  /**
   * Calculate final building value
   */
  calculateFinalValue(calculations) {
    const depreciationAmount =
      calculations.replacementCostNew * calculations.totalDepreciation;
    const finalValue = calculations.replacementCostNew - depreciationAmount;
    calculations.buildingValue = Math.round(Math.max(0, finalValue));
    return calculations;
  }

  /**
   * Helper method to get feature points
   */
  getFeaturePoints(featureType, displayText) {
    if (!displayText) return 0;

    const cacheKey = `${featureType}:${displayText}`;
    if (this.featureCache.has(cacheKey)) {
      return this.featureCache.get(cacheKey);
    }

    const feature = this.buildingFeatureCodes.find(
      (f) =>
        f.featureType === featureType &&
        f.displayText === displayText &&
        f.isActive,
    );

    const points = feature ? feature.points || 0 : 0;
    this.featureCache.set(cacheKey, points);
    return points;
  }

  /**
   * Helper method to get building code by base type
   */
  getBuildingCodeByType(baseType) {
    if (!baseType) return null;

    // Include municipality in cache key for safety (though codes should already be filtered)
    const cacheKey = `${this.municipalityId || 'default'}:${baseType}`;
    if (this.codeCache.has(cacheKey)) {
      return this.codeCache.get(cacheKey);
    }

    // Find building code - codes should already be filtered by municipality
    // but we double-check municipalityId if available
    const buildingCode = this.buildingCodes.find(
      (code) => code.code === baseType &&
                code.isActive &&
                (!this.municipalityId || code.municipalityId?.toString() === this.municipalityId?.toString())
    );

    this.codeCache.set(cacheKey, buildingCode);
    return buildingCode;
  }

  /**
   * Calculate building age
   */
  calculateBuildingAge(buildingData) {
    if (buildingData.year_built && buildingData.effective_year) {
      const age = buildingData.effective_year - buildingData.year_built;
      return Math.max(0, age); // Ensure age is not negative
    } else if (buildingData.age) {
      return buildingData.age;
    }
    return 0;
  }

  /**
   * Calculate normal depreciation using standard formula
   */
  calculateNormalDepreciation(buildingData, buildingAge, baseDepreciationRate) {
    // Check if user has manually entered normal depreciation
    if (
      buildingData.depreciation?.normal?.percentage !== null &&
      buildingData.depreciation?.normal?.percentage !== undefined
    ) {
      const storedValue = buildingData.depreciation.normal.percentage;
      return storedValue > 1 ? storedValue / 100 : storedValue; // Handle both decimal and percentage formats
    }

    // Calculate age-based depreciation using proper formula:
    // Normal Depreciation = √(building age) × condition factor × base rate depreciation
    const conditionFactors = {
      Excellent: 1,
      'Very Good': 1.5,
      Good: 2,
      Average: 2.5,
      Fair: 3,
      Poor: 3.5,
      'Very Poor': 4,
    };

    const condition =
      buildingData.depreciation?.normal?.description || 'Average';
    const conditionFactor = conditionFactors[condition] || 2.5;

    const sqrtAge = Math.sqrt(buildingAge);
    const normalDepreciation = sqrtAge * conditionFactor * baseDepreciationRate;

    // Cap normal depreciation at 80%
    return Math.min(normalDepreciation / 100, 0.8);
  }

  /**
   * Helper to get depreciation percentage
   */
  getDepreciationPercentage(depreciation) {
    if (
      !depreciation ||
      depreciation.percentage === null ||
      depreciation.percentage === undefined
    ) {
      return 0;
    }
    const value = depreciation.percentage;
    return value > 1 ? value / 100 : value; // Handle both decimal and percentage formats
  }

  /**
   * Update reference data for batch processing
   */
  updateReferenceData(referenceData) {
    this.buildingFeatureCodes =
      referenceData.buildingFeatureCodes || this.buildingFeatureCodes;
    this.buildingLadders =
      referenceData.buildingLadders || this.buildingLadders;
    this.calculationConfig =
      referenceData.calculationConfig || this.calculationConfig;

    // Clear caches when reference data changes
    this.featureCache.clear();
    this.codeCache.clear();
  }
}

module.exports = BuildingAssessmentCalculator;
