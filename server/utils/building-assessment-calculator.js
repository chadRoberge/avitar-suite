/**
 * Server-side Building Assessment Calculator
 * Direct copy of the frontend calculator adapted for Node.js/CommonJS
 */

class BuildingAssessmentCalculator {
  constructor(referenceData = {}) {
    this.buildingFeatureCodes = referenceData.buildingFeatureCodes || [];
    this.buildingCodes = referenceData.buildingCodes || [];
    this.calculationConfig = referenceData.calculationConfig || {};

    // Store municipality info for validation
    this.municipalityId = referenceData.municipalityId || null;

    // Create ObjectId-based lookup maps for fast access
    this.featureCodeById = new Map(
      this.buildingFeatureCodes.map((fc) => [fc._id.toString(), fc]),
    );
    this.buildingCodeById = new Map(
      this.buildingCodes.map((bc) => [bc._id.toString(), bc]),
    );

    // Initialize caches for feature lookups
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
        framePoints: 0,
        ceilingHeightPoints: 0,
        bedroomBathRate: 0,
        airConditioningPoints: 0,
        extraKitchenPoints: 0,
        generatorPoints: 0,
        totalFeaturePoints: 0,
        baseRate: 0,
        storyHeightFactor: 1,
        qualityAdjustmentFactor: 1,
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
      calculations = this.calculateFeaturePoints(
        buildingData,
        calculations,
        calculationConfig,
      );

      // Step 2: Get base rate from building ladder
      calculations = this.calculateBaseRate(
        buildingData,
        calculations,
        calculationConfig,
      );

      // Step 3: Calculate quality adjustment factor
      calculations = this.calculateQualityAdjustmentFactor(
        buildingData,
        calculations,
        calculationConfig,
      );

      // Step 4: Calculate size adjustment factor
      calculations = this.calculateSizeAdjustmentFactor(
        buildingData,
        calculations,
        calculationConfig,
      );

      // Step 5: Calculate adjusted base rate
      calculations = this.calculateAdjustedBaseRate(
        buildingData,
        calculations,
        calculationConfig,
      );

      // Step 6: Calculate replacement cost new
      calculations = this.calculateReplacementCostNew(
        buildingData,
        calculations,
      );

      // Step 7: Calculate depreciation
      calculations = this.calculateDepreciation(
        buildingData,
        calculations,
        calculationConfig,
      );

      // Step 8: Calculate final building value
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
  calculateFeaturePoints(buildingData, calculations, calculationConfig) {
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

    // Calculate heating points (fuel + type)
    if (buildingData.heating_fuel) {
      calculations.heatingPoints += this.getFeaturePoints(
        'heating_fuel',
        buildingData.heating_fuel,
      );
    }
    if (buildingData.heating_type) {
      calculations.heatingPoints += this.getFeaturePoints(
        'heating_type',
        buildingData.heating_type,
      );
    }

    // Calculate flooring points (average if two types)
    if (buildingData.flooring_1) {
      const flooring1Points = this.getFeaturePoints(
        'flooring',
        buildingData.flooring_1,
      );
      calculations.flooringPoints += flooring1Points;
      console.log(
        `🏠 Flooring 1 (${buildingData.flooring_1}): ${flooring1Points} points`,
      );
    }

    if (buildingData.flooring_2) {
      const flooring2Points = this.getFeaturePoints(
        'flooring',
        buildingData.flooring_2,
      );
      calculations.flooringPoints += flooring2Points;
      calculations.flooringPoints = Math.round(calculations.flooringPoints / 2); // Average
      console.log(
        `🏠 Flooring 2 (${buildingData.flooring_2}): ${flooring2Points} points, averaged total: ${calculations.flooringPoints}`,
      );
    } else if (buildingData.flooring_1) {
      console.log(
        `🏠 Only Flooring 1, total flooring points: ${calculations.flooringPoints}`,
      );
    }

    // Calculate frame points
    if (buildingData.frame) {
      calculations.framePoints = this.getFeaturePoints(
        'frame',
        buildingData.frame,
      );
      console.log(
        `🏠 Frame (${buildingData.frame}): ${calculations.framePoints} points`,
      );
    }

    // Calculate ceiling height points
    if (buildingData.ceiling_height) {
      calculations.ceilingHeightPoints = this.getFeaturePoints(
        'ceiling_height',
        buildingData.ceiling_height,
      );
      console.log(
        `🏠 Ceiling Height (${buildingData.ceiling_height}): ${calculations.ceilingHeightPoints} points`,
      );
    }

    // Calculate air conditioning points using percentage
    if (buildingData.air_conditioning) {
      calculations.airConditioningPoints = this.calculateAirConditioningPoints(
        buildingData.air_conditioning,
        calculationConfig,
      );
    }

    // Calculate extra kitchen points
    if (buildingData.extra_kitchen) {
      calculations.extraKitchenPoints = this.calculateExtraKitchenPoints(
        buildingData.extra_kitchen,
        calculationConfig,
      );
    }

    // Calculate generator points
    if (buildingData.generator) {
      calculations.generatorPoints = this.calculateGeneratorPoints(
        buildingData.generator,
        calculationConfig,
      );
    }

    // Calculate bedroom/bath points using sophisticated ratio-based calculation
    const bedroomBathResult = this.calculateBedroomBathPoints(
      buildingData,
      calculationConfig,
    );
    calculations.bedroomBathRate = bedroomBathResult.points.adjusted;
    calculations.bedroomBathDetails = bedroomBathResult;

    // Debug logging for bedroom/bathroom calculations
    console.log('🏠 Bedroom/Bathroom Calculation Debug:', {
      input: bedroomBathResult.input,
      points: bedroomBathResult.points,
      ratio: bedroomBathResult.ratio,
      specialAdjustments: bedroomBathResult.specialAdjustments,
      finalBedroomBathRate: calculations.bedroomBathRate,
    });

    // Calculate total feature points
    calculations.totalFeaturePoints =
      calculations.exteriorWallPoints +
      calculations.interiorWallPoints +
      calculations.roofPoints +
      calculations.heatingPoints +
      calculations.flooringPoints +
      calculations.framePoints +
      calculations.ceilingHeightPoints +
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
      console.log(
        `Found building code ${buildingCode.code}: Rate $${buildingCode.rate}, Depreciation ${buildingCode.depreciation}%`,
      );
    } else {
      calculations.baseRate = config.defaultBaseRate || 0;
      calculations.baseDepreciationRate = config.defaultDepreciationRate || 0;
      console.warn(
        `No building code found for base_type ID '${baseType}', using defaults.`,
      );
    }

    return calculations;
  }

  /**
   * Calculate quality adjustment factor
   */
  calculateQualityAdjustmentFactor(buildingData, calculations, config) {
    const qualityGrade = buildingData.quality_grade;

    if (!qualityGrade) {
      calculations.qualityAdjustmentFactor = 1;
      console.log(
        '🏆 Quality Adjustment: No quality grade found, using factor 1.0',
      );
      return calculations;
    }

    // Look up quality factor from building feature codes
    const qualityFactor = this.getQualityFactor(qualityGrade);

    // Quality Adjustment Factor = (Total Feature Points ÷ 100) × Quality Factor
    calculations.qualityAdjustmentFactor =
      (calculations.totalFeaturePoints / 100) * qualityFactor;

    console.log('🏆 Quality Adjustment Debug:', {
      qualityGrade,
      qualityFactor,
      totalFeaturePoints: calculations.totalFeaturePoints,
      qualityAdjustmentFactor: calculations.qualityAdjustmentFactor,
    });

    return calculations;
  }

  /**
   * Calculate size adjustment factor using economy of scale methodology
   */
  calculateSizeAdjustmentFactor(buildingData, calculations, config) {
    const effectiveArea = buildingData.effective_area || 0;

    if (effectiveArea <= 0) {
      calculations.sizeAdjustmentFactor = 1;
      console.log('📏 Size Adjustment: No effective area, using factor 1.0');
      return calculations;
    }

    // Get building type from the building code
    const buildingType = this.getBuildingTypeForSizeAdjustment(
      buildingData.base_type,
    );

    // Get economy of scale configuration for this building type
    const economyConfig = config?.economiesOfScale?.[buildingType];

    if (!economyConfig) {
      calculations.sizeAdjustmentFactor = 1;
      console.log(
        `📏 Size Adjustment: No economy config for type '${buildingType}', using factor 1.0`,
      );
      return calculations;
    }

    // Calculate size adjustment factor using economy of scale methodology
    calculations.sizeAdjustmentFactor = this.calculateEconomyOfScaleFactor(
      effectiveArea,
      economyConfig,
    );

    console.log('📏 Size Adjustment Debug:', {
      effectiveArea,
      buildingType,
      economyConfig,
      sizeAdjustmentFactor: calculations.sizeAdjustmentFactor,
      base_type: buildingData.base_type,
      curveType: economyConfig?.curve_type,
      curvesteepness: economyConfig?.curve_steepness,
    });

    return calculations;
  }

  /**
   * Calculate adjusted base rate
   */
  calculateAdjustedBaseRate(buildingData, calculations, config) {
    // Get story height factor
    calculations.storyHeightFactor = this.getStoryHeightFactor(
      buildingData.story_height,
    );

    // Adjusted Base Rate = Base Rate × Story Height Factor × Quality Adjustment Factor × Size Adjustment Factor
    calculations.adjustedBaseRate =
      calculations.baseRate *
      calculations.storyHeightFactor *
      calculations.qualityAdjustmentFactor *
      calculations.sizeAdjustmentFactor;

    console.log('💰 Adjusted Base Rate Debug:', {
      baseRate: calculations.baseRate,
      storyHeightFactor: calculations.storyHeightFactor,
      qualityAdjustmentFactor: calculations.qualityAdjustmentFactor,
      sizeAdjustmentFactor: calculations.sizeAdjustmentFactor,
      adjustedBaseRate: calculations.adjustedBaseRate,
    });

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
    calculations.buildingValue =
      Math.round(Math.max(0, finalValue) / 100) * 100;
    return calculations;
  }

  /**
   * Helper method to get feature points
   */
  getFeaturePoints(featureType, featureCodeId) {
    if (!featureCodeId) return 0;

    // Convert ObjectId to string for Map lookup
    const idString = featureCodeId.toString();
    const feature = this.featureCodeById.get(idString);

    if (!feature) {
      console.warn(`⚠️ Feature code not found for ID: ${idString}`);
      return 0;
    }

    // Verify the feature type matches (safety check)
    if (feature.featureType !== featureType) {
      console.warn(
        `⚠️ Feature type mismatch: expected ${featureType}, got ${feature.featureType}`,
      );
      return 0;
    }

    // Only use points from active feature codes
    if (!feature.isActive) {
      console.warn(`⚠️ Feature code ${idString} is inactive`);
      return 0;
    }

    return feature.points || 0;
  }

  /**
   * Helper method to get building code by base type
   */
  getBuildingCodeByType(baseTypeId) {
    if (!baseTypeId) return null;

    // Convert ObjectId to string for Map lookup
    const idString = baseTypeId.toString();
    const buildingCode = this.buildingCodeById.get(idString);

    if (!buildingCode) {
      console.warn(`⚠️ Building code not found for ID: ${idString}`);
      return null;
    }

    // Only use active building codes
    if (!buildingCode.isActive) {
      console.warn(`⚠️ Building code ${idString} is inactive`);
      return null;
    }

    return buildingCode;
  }

  /**
   * Helper method to get building type for size adjustment from base type
   */
  getBuildingTypeForSizeAdjustment(baseTypeId) {
    if (!baseTypeId) return 'residential'; // Default fallback

    const buildingCode = this.getBuildingCodeByType(baseTypeId);

    if (!buildingCode) {
      return 'residential'; // Default fallback
    }

    if (buildingCode.sizeAdjustmentCategory) {
      return buildingCode.sizeAdjustmentCategory;
    }

    // Fallback to buildingType if sizeAdjustmentCategory not available
    if (buildingCode.buildingType) {
      return buildingCode.buildingType;
    }

    return 'residential'; // Default fallback
  }

  /**
   * Calculate economy of scale factor based on building size
   */
  calculateEconomyOfScaleFactor(effectiveArea, economyConfig) {
    const {
      median_size: medianSize,
      smallest_size: smallestSize,
      smallest_factor: smallestFactor,
      largest_size: largestSize,
      largest_factor: largestFactor,
      curve_type: curveType = 'linear',
      curve_steepness: steepness = 1.0,
    } = economyConfig;

    console.log('🔧 Economy Scale Factor Calculation:', {
      effectiveArea,
      medianSize,
      smallestSize,
      smallestFactor,
      largestSize,
      largestFactor,
      curveType,
      steepness,
    });

    // Handle edge cases
    if (effectiveArea <= smallestSize) {
      return smallestFactor;
    }
    if (effectiveArea >= largestSize) {
      return largestFactor;
    }

    // Calculate factor based on curve type
    if (curveType === 'linear') {
      return this.calculateLinearInterpolation(
        effectiveArea,
        medianSize,
        smallestSize,
        smallestFactor,
        largestSize,
        largestFactor,
      );
    } else if (curveType === 'exponential') {
      return this.calculateExponentialInterpolation(
        effectiveArea,
        medianSize,
        smallestSize,
        smallestFactor,
        largestSize,
        largestFactor,
        steepness,
      );
    } else if (curveType === 'power') {
      return this.calculatePowerInterpolation(
        effectiveArea,
        medianSize,
        smallestSize,
        smallestFactor,
        largestSize,
        largestFactor,
        steepness,
      );
    }

    // Fallback to linear
    return this.calculateLinearInterpolation(
      effectiveArea,
      medianSize,
      smallestSize,
      smallestFactor,
      largestSize,
      largestFactor,
    );
  }

  /**
   * Linear interpolation (original method)
   */
  calculateLinearInterpolation(
    effectiveArea,
    medianSize,
    smallestSize,
    smallestFactor,
    largestSize,
    largestFactor,
  ) {
    if (effectiveArea < medianSize) {
      // Between smallest and median: interpolate from smallest factor to 1.0
      const ratio =
        (effectiveArea - smallestSize) / (medianSize - smallestSize);
      return smallestFactor + ratio * (1.0 - smallestFactor);
    } else {
      // Between median and largest: interpolate from 1.0 to largest factor
      const ratio = (effectiveArea - medianSize) / (largestSize - medianSize);
      return 1.0 + ratio * (largestFactor - 1.0);
    }
  }

  /**
   * Exponential interpolation for smooth curves
   */
  calculateExponentialInterpolation(
    effectiveArea,
    medianSize,
    smallestSize,
    smallestFactor,
    largestSize,
    largestFactor,
    steepness,
  ) {
    if (effectiveArea < medianSize) {
      // Between smallest and median: exponential curve from smallest to 1.0
      const normalizedPosition =
        (effectiveArea - smallestSize) / (medianSize - smallestSize);
      const exponentialPosition = Math.pow(normalizedPosition, steepness);
      return smallestFactor + exponentialPosition * (1.0 - smallestFactor);
    } else {
      // Between median and largest: exponential curve from 1.0 to largest
      const normalizedPosition =
        (effectiveArea - medianSize) / (largestSize - medianSize);
      const exponentialPosition = Math.pow(normalizedPosition, steepness);
      return 1.0 + exponentialPosition * (largestFactor - 1.0);
    }
  }

  /**
   * Power law interpolation for realistic construction economics
   */
  calculatePowerInterpolation(
    effectiveArea,
    medianSize,
    smallestSize,
    smallestFactor,
    largestSize,
    largestFactor,
    steepness,
  ) {
    // Power law: factor = (size/median)^exponent
    // Adjust exponent based on steepness and target factors

    if (effectiveArea < medianSize) {
      // Below median: factor should be > 1.0 (smaller buildings cost more per sq ft)
      const sizeRatio = effectiveArea / medianSize;

      // Calculate exponent to hit the smallest factor at smallest size
      const targetRatio = smallestSize / medianSize;
      const targetExponent = Math.log(smallestFactor) / Math.log(targetRatio);

      // Apply steepness adjustment
      const adjustedExponent = targetExponent * steepness;

      return Math.pow(sizeRatio, adjustedExponent);
    } else {
      // Above median: factor should be < 1.0 (larger buildings benefit from scale)
      const sizeRatio = effectiveArea / medianSize;

      // Calculate exponent to hit the largest factor at largest size
      const targetRatio = largestSize / medianSize;
      const targetExponent = Math.log(largestFactor) / Math.log(targetRatio);

      // Apply steepness adjustment
      const adjustedExponent = targetExponent * steepness;

      return Math.pow(sizeRatio, adjustedExponent);
    }
  }

  /**
   * Calculate air conditioning points using percentage
   */
  calculateAirConditioningPoints(airConditioningPercent, config) {
    const miscConfig = config?.miscellaneousPoints?.air_conditioning;
    const totalPoints = miscConfig?.total_points || 4; // Total points for 100% AC

    console.log(`❄️ AC Debug - Raw input:`, {
      airConditioningPercent,
      typeOf: typeof airConditioningPercent,
      miscConfig,
      totalPoints,
    });

    // Extract percentage (remove % symbol if present)
    let percent =
      parseFloat(airConditioningPercent.toString().replace('%', '')) || 0;

    // Check if the input is already a decimal (0.6 instead of 60)
    if (percent <= 1 && percent > 0) {
      // Input is likely already a decimal, convert to percentage
      percent = percent * 100;
      console.log(
        `❄️ AC Debug - Converted decimal to percentage: ${airConditioningPercent} -> ${percent}%`,
      );
    }

    // Calculate points: Total Points × (Percentage ÷ 100)
    const points = totalPoints * (percent / 100);

    console.log(
      `❄️ AC Points Debug: ${airConditioningPercent} -> ${percent}% of ${totalPoints} total points -> ${points} points`,
    );

    return Math.round(points * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate extra kitchen points
   */
  calculateExtraKitchenPoints(extraKitchen, config) {
    const miscConfig = config?.miscellaneousPoints?.extra_kitchen;
    const pointsPerKitchen = miscConfig?.points_per_kitchen || 1;

    // Convert to number (could be "1", "2", etc.)
    const kitchenCount = parseInt(extraKitchen) || 0;

    const points = kitchenCount * pointsPerKitchen;

    console.log(
      `🍳 Extra Kitchen Points Debug: ${extraKitchen} -> ${kitchenCount} kitchens -> ${points} points (${pointsPerKitchen} pts per kitchen)`,
    );

    return points;
  }

  /**
   * Calculate generator points
   */
  calculateGeneratorPoints(generator, config) {
    const miscConfig = config?.miscellaneousPoints?.generator;
    const defaultPoints = miscConfig?.default_points || 5;

    // For now, use default points if generator exists
    // Could be enhanced to handle different generator types/sizes
    const points = generator ? defaultPoints : 0;

    console.log(
      `⚡ Generator Points Debug: ${generator} -> ${points} points (default: ${defaultPoints})`,
    );

    return points;
  }

  /**
   * Helper method to get quality factor from quality grade
   */
  getQualityFactor(qualityGrade) {
    if (!qualityGrade) return 1.0;

    const cacheKey = `quality:${qualityGrade}`;
    if (this.featureCache.has(cacheKey)) {
      return this.featureCache.get(cacheKey);
    }

    // Look for quality grade in building feature codes
    const qualityFeature = this.buildingFeatureCodes.find(
      (f) =>
        f.featureType === 'quality_grade' &&
        f.displayText === qualityGrade &&
        f.isActive,
    );

    const factor = qualityFeature
      ? qualityFeature.factor || qualityFeature.points || 1.0
      : 1.0;
    this.featureCache.set(cacheKey, factor);

    console.log(`Quality factor lookup for ${qualityGrade}: ${factor}`);
    return factor;
  }

  /**
   * Helper method to get story height factor
   */
  getStoryHeightFactor(storyHeight) {
    if (!storyHeight) return 1.0;

    const cacheKey = `story_height:${storyHeight}`;
    if (this.featureCache.has(cacheKey)) {
      return this.featureCache.get(cacheKey);
    }

    // Look for story height in building feature codes
    const storyFeature = this.buildingFeatureCodes.find(
      (f) =>
        f.featureType === 'story_height' &&
        f.displayText === storyHeight &&
        f.isActive,
    );

    const rawFactor = storyFeature
      ? storyFeature.factor || storyFeature.points || 100
      : 100;
    const factor = rawFactor / 100; // Convert to percentage (99 becomes 0.99)
    this.featureCache.set(cacheKey, factor);

    console.log(
      `Story height factor lookup for ${storyHeight}: raw=${rawFactor}, factor=${factor}`,
    );
    return factor;
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
   * Calculate bedroom/bathroom ratio points for property valuation
   * @param {Object} buildingData - Building data object containing bedroom/bath counts
   * @param {Object} calculationConfig - Building calculation configuration from database
   * @returns {Object} Points calculation with breakdown
   */
  calculateBedroomBathPoints(buildingData, calculationConfig) {
    // Extract data with validation
    const bedrooms = parseInt(buildingData.bedrooms) || 0;
    const fullBaths = parseInt(buildingData.full_baths) || 0;
    const halfBaths = parseInt(buildingData.half_baths) || 0;

    console.log('🔧 Bedroom/Bath Config Debug:', {
      buildingData: {
        bedrooms: buildingData.bedrooms,
        full_baths: buildingData.full_baths,
        half_baths: buildingData.half_baths,
      },
      calculationConfig: calculationConfig,
      parsedInputs: { bedrooms, fullBaths, halfBaths },
    });

    // Use existing config structure with defaults
    const config = calculationConfig || {};
    const basePoints = config.base || 5;
    const perBedroom = config.perBedroom || 3;
    const perFullBath = config.perFullBath || 2;
    const perHalfBath = config.perHalfBath || 0.8;

    console.log('📊 Point Configuration:', {
      basePoints,
      perBedroom,
      perFullBath,
      perHalfBath,
      hasRatioAdjustments: !!config.ratioAdjustments,
      hasSpecialAdjustments: !!config.specialAdjustments,
    });

    // Calculate base points using existing structure
    const bedroomBasePoints = bedrooms * perBedroom;
    const bathBasePoints = fullBaths * perFullBath + halfBaths * perHalfBath;
    const totalBasePoints = basePoints + bedroomBasePoints + bathBasePoints;

    // Calculate bathroom equivalents (half baths count as 0.5)
    const bathEquivalent = fullBaths + halfBaths * 0.5;

    // Calculate bath-to-bedroom ratio for adjustments
    const bathToBedroomRatio = bedrooms > 0 ? bathEquivalent / bedrooms : 0;

    // Apply ratio adjustments from existing config
    let ratioMultiplier = 1.0;
    let ratioCategory = 'standard';

    if (config.ratioAdjustments) {
      const ratioAdj = config.ratioAdjustments;

      if (bathToBedroomRatio >= (ratioAdj.luxury_threshold || 1.0)) {
        ratioMultiplier = ratioAdj.luxury_modifier || 1.1;
        ratioCategory = 'luxury';
      } else if (
        bathToBedroomRatio >= (ratioAdj.good_ratio_threshold || 0.75)
      ) {
        ratioMultiplier = ratioAdj.good_ratio_modifier || 1.05;
        ratioCategory = 'good';
      } else if (bathToBedroomRatio <= (ratioAdj.poor_ratio_threshold || 0.5)) {
        ratioMultiplier = ratioAdj.poor_ratio_modifier || 0.95;
        ratioCategory = 'poor';
      }
    }

    // Apply special adjustments from existing config
    let specialMultiplier = 1.0;
    let specialAdjustment = 'none';

    if (config.specialAdjustments) {
      const specialAdj = config.specialAdjustments;

      // 3 bedroom, no half bath penalty
      if (bedrooms === 3 && halfBaths === 0) {
        specialMultiplier = specialAdj.three_br_no_half_bath_modifier || 0.97;
        specialAdjustment = '3br_no_half_bath_penalty';
      }
      // 2 bedroom, 1 half bath ideal bonus
      else if (bedrooms === 2 && halfBaths === 1) {
        specialMultiplier =
          specialAdj.two_br_one_half_bath_ideal_modifier || 1.03;
        specialAdjustment = '2br_1half_bath_bonus';
      }
    }

    // Calculate final adjusted points
    const adjustedPoints =
      totalBasePoints * ratioMultiplier * specialMultiplier;

    console.log('🧮 Final Calculation Steps:', {
      bedroomBasePoints,
      bathBasePoints,
      totalBasePoints,
      bathToBedroomRatio,
      ratioCategory,
      ratioMultiplier,
      specialAdjustment,
      specialMultiplier,
      adjustedPoints,
    });

    // Return detailed breakdown compatible with existing system
    return {
      points: {
        base: basePoints,
        bedroom: bedroomBasePoints,
        bathroom: bathBasePoints,
        raw: totalBasePoints,
        adjusted: Math.round(adjustedPoints * 100) / 100,
      },
      ratio: {
        bathToBedroomRatio: Math.round(bathToBedroomRatio * 100) / 100,
        category: ratioCategory,
        multiplier: ratioMultiplier,
        bathEquivalent: bathEquivalent,
      },
      specialAdjustments: {
        type: specialAdjustment,
        multiplier: specialMultiplier,
      },
      input: {
        bedrooms: bedrooms,
        fullBaths: fullBaths,
        halfBaths: halfBaths,
      },
    };
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
