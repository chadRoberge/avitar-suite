/**
 * Shared Land Assessment Calculations
 *
 * This module contains all land assessment calculation logic that needs to be
 * consistent between frontend and backend. Used for:
 * - Real-time calculations in the UI
 * - Municipality-wide revaluations
 * - Batch processing and data migrations
 * - Validation and auditing
 */

class LandAssessmentCalculator {
  constructor(referenceData = {}) {
    this.landLadders = referenceData.landLadders || {};
    this.topologyAttributes = referenceData.topologyAttributes || [];
    this.currentUseCategories = referenceData.currentUseCategories || [];
    this.landTaxationCategories = referenceData.landTaxationCategories || [];
    this.neighborhoodCodes = referenceData.neighborhoodCodes || [];
    this.siteAttributes = referenceData.siteAttributes || [];
    this.drivewayAttributes = referenceData.drivewayAttributes || [];
    this.roadAttributes = referenceData.roadAttributes || [];
    this.zones = referenceData.zones || [];
    this.acreageDiscountSettings =
      referenceData.acreageDiscountSettings || null;

    // Caching for batch processing efficiency
    this.factorCache = {
      neighborhoods: new Map(),
      sites: new Map(),
      driveways: new Map(),
      roads: new Map(),
      topography: new Map(),
      zones: new Map(),
      currentUseCategories: new Map(),
      landTaxationCategories: new Map(),
    };
  }

  /**
   * Calculate complete land line assessment with all values stored in the land line object
   * @param {Object} landLine - Individual land line entry
   * @param {Object} propertyData - Property-level data (zone, neighborhood, site, driveway, road)
   * @param {Number} accumulatedAcreage - Running total of acreage from previous land lines
   * @returns {Object} Calculated land line with all values
   */
  calculateLandLine(landLine, propertyData, accumulatedAcreage = 0) {
    if (!landLine || !propertyData.zoneId) {
      return { ...landLine, calculationError: 'Missing required data' };
    }

    try {
      const calculatedLine = { ...landLine };
      const acreage =
        landLine.size_unit === 'AC' ? parseFloat(landLine.size) || 0 : 0;
      const frontage =
        landLine.size_unit === 'FF' ? parseFloat(landLine.size) || 0 : 0;

      // Step 1: Get base land rate and calculate base value
      if (acreage > 0) {
        if (landLine.is_excess_acreage) {
          // Use excess acreage calculation
          calculatedLine.baseRate = this.getExcessAcreageRate(
            propertyData.zoneId,
          );
          calculatedLine.baseValue = calculatedLine.baseRate * acreage;
          // Apply acreage discount
          calculatedLine.baseValue = this.applyAcreageDiscount(
            calculatedLine.baseValue,
            acreage,
          );
        } else {
          // Use land ladder - ensure first land line doesn't exceed zone minimum
          const zone = this.getZoneData(propertyData.zoneId);
          const effectiveAcreage = Math.min(
            acreage,
            Math.max(0, (zone?.minimumAcreage || 0) - accumulatedAcreage),
          );
          console.log(
            `Calculating non-excess land line: ${acreage} AC, zone min: ${zone?.minimumAcreage}, accumulated: ${accumulatedAcreage}, effective: ${effectiveAcreage}`,
          );

          calculatedLine.baseValue = this.getLandLadderRate(
            acreage,
            propertyData.zoneId,
          );
          calculatedLine.baseRate =
            acreage > 0 ? calculatedLine.baseValue / acreage : 0;

          console.log(
            `Land line calculation result: baseValue=${calculatedLine.baseValue}, baseRate=${calculatedLine.baseRate}`,
          );
        }
      } else if (frontage > 0) {
        calculatedLine.baseRate = this.getFrontageRate(propertyData.zoneId);
        calculatedLine.baseValue = calculatedLine.baseRate * frontage;
      } else {
        calculatedLine.baseRate = 0;
        calculatedLine.baseValue = 0;
      }

      if (calculatedLine.baseValue === 0) {
        calculatedLine.economyOfScaleFactor =
          this.calculateAcreageDiscountPercentage(acreage);
        calculatedLine.marketValue = 0;
        calculatedLine.currentUseValue = 0;
        calculatedLine.currentUseCredit = 0;
        calculatedLine.assessedValue = 0;
        return calculatedLine;
      }

      // Step 2: Apply all factors in sequence
      calculatedLine.neighborhoodFactor = this.getNeighborhoodFactor(
        propertyData.neighborhoodId,
      );
      calculatedLine.economyOfScaleFactor =
        this.calculateAcreageDiscountPercentage(acreage);
      calculatedLine.siteFactor = this.getSiteFactor(
        propertyData.siteConditionsId,
      );
      calculatedLine.drivewayFactor = this.getDrivewayFactor(
        propertyData.drivewayTypeId,
      );
      calculatedLine.roadFactor = this.getRoadFactor(propertyData.roadTypeId);
      calculatedLine.topographyFactor = this.getTopographyFactor(
        landLine.topography,
      );
      calculatedLine.conditionFactor = this.getConditionFactor(
        landLine.condition,
      );

      // Step 3: Calculate market value
      const rawMarketValue =
        calculatedLine.baseValue *
        calculatedLine.neighborhoodFactor *
        calculatedLine.siteFactor *
        calculatedLine.drivewayFactor *
        calculatedLine.roadFactor *
        calculatedLine.topographyFactor *
        calculatedLine.conditionFactor;

      // Store both raw and rounded values for different purposes
      calculatedLine.rawMarketValue = rawMarketValue;

      // CAMA Rule: Round all individual land lines to nearest $100 (including current use)
      // Only the current use VALUE calculation is exact, not the market value
      calculatedLine.marketValue = Math.round(rawMarketValue / 100) * 100;

      // Step 4: Calculate current use value if applicable
      if (this.isCurrentUseCategory(landLine.land_use_type)) {
        calculatedLine.currentUseValue =
          this.calculateCurrentUseValue(landLine);
        calculatedLine.currentUseCredit =
          calculatedLine.marketValue - calculatedLine.currentUseValue;
        // For current use land, assessed value IS the current use value (what gets taxed)
        calculatedLine.assessedValue = calculatedLine.currentUseValue;
      } else {
        calculatedLine.currentUseValue = 0;
        calculatedLine.currentUseCredit = 0;
        calculatedLine.assessedValue = calculatedLine.marketValue;
      }

      return calculatedLine;
    } catch (error) {
      console.error('Error calculating land line:', error);
      return { ...landLine, calculationError: error.message };
    }
  }

  /**
   * Calculate current use value for agricultural/forestry land
   * @param {Object} entry - Land use entry
   * @returns {Number} Current use value in dollars
   */
  calculateCurrentUseValue(entry) {
    if (!this.isCurrentUseCategory(entry.land_use_type)) {
      return 0;
    }

    const currentUseCategory = this.currentUseCategories.find(
      (category) => category.code === entry.land_use_type,
    );

    if (!currentUseCategory) {
      return 0;
    }

    const acreage = entry.size_unit === 'AC' ? parseFloat(entry.size) || 0 : 0;
    const spi = parseFloat(entry.spi) || 50; // Default SPI of 50 if not provided
    const spiRatio = Math.min(Math.max(spi / 100, 0), 1); // Clamp between 0 and 1

    // Calculate rate based on SPI
    const minRate = currentUseCategory.minRate;
    const maxRate = currentUseCategory.maxRate;
    const rate = minRate + (maxRate - minRate) * spiRatio;

    return Math.round(rate * acreage);
  }

  /**
   * Calculate total assessed value based on taxation category
   * @param {Number} marketValue - Total market value
   * @param {String} taxationCategoryId - Land taxation category ID
   * @returns {Number} Assessed value in dollars
   */
  calculateAssessedValue(marketValue, taxationCategoryId) {
    const taxationCategory = this.landTaxationCategories.find(
      (cat) => cat._id === taxationCategoryId || cat.id === taxationCategoryId,
    );

    const taxPercentage = taxationCategory
      ? taxationCategory.taxPercentage / 100
      : 1;
    return Math.round(marketValue * taxPercentage);
  }

  /**
   * Calculate current use credit (tax savings)
   * @param {Array} entries - Land use entries
   * @param {String} zoneId - Zone ID
   * @param {String} neighborhoodId - Neighborhood ID
   * @param {Object} referenceRates - Site, driveway, road rates
   * @returns {Number} Current use credit in dollars
   */
  calculateCurrentUseCredit(
    entries,
    zoneId,
    neighborhoodId,
    referenceRates = {},
  ) {
    return entries.reduce((total, entry) => {
      if (this.isCurrentUseCategory(entry.land_use_type)) {
        const marketValue = this.calculateMarketValue(
          entry,
          zoneId,
          neighborhoodId,
          referenceRates,
        );
        const currentUseValue = this.calculateCurrentUseValue(entry);
        return total + (marketValue - currentUseValue);
      }
      return total;
    }, 0);
  }

  /**
   * Calculate complete property land assessment
   * @param {Object} landAssessment - Complete land assessment data
   * @param {Array} views - Property views data (optional)
   * @param {Array} waterfronts - Property waterfront data (optional)
   * @returns {Object} Land assessment with calculated land lines and totals
   */
  calculatePropertyAssessment(landAssessment, views = [], waterfronts = []) {
    const propertyData = {
      zoneId: landAssessment.zone,
      neighborhoodId: landAssessment.neighborhood,
      siteConditionsId: landAssessment.site_conditions,
      drivewayTypeId: landAssessment.driveway_type,
      roadTypeId: landAssessment.road_type,
    };

    console.log(
      `Calculating property assessment for zone: ${propertyData.zoneId} (type: ${typeof propertyData.zoneId})`,
    );
    console.log(
      `Available land ladder zones:`,
      Object.keys(this.landLadders || {}),
    );

    const landLines = landAssessment.land_use_details || [];
    const calculatedLandLines = [];
    let accumulatedAcreage = 0;

    // Calculate each land line with proper accumulated acreage tracking
    for (const landLine of landLines) {
      const calculatedLine = this.calculateLandLine(
        landLine,
        propertyData,
        accumulatedAcreage,
      );
      calculatedLandLines.push(calculatedLine);

      // Track accumulated acreage for zone minimum enforcement
      if (landLine.size_unit === 'AC' && !landLine.is_excess_acreage) {
        accumulatedAcreage += parseFloat(landLine.size) || 0;
      }
    }

    // Calculate totals from the calculated land lines, views, and waterfronts
    const totals = this.calculateTotalsFromLandLines(
      calculatedLandLines,
      views,
      waterfronts,
    );

    return {
      ...landAssessment,
      land_use_details: calculatedLandLines,
      calculated_totals: totals,
      views: views || [],
    };
  }

  /**
   * Calculate totals from pre-calculated land lines
   * @param {Array} calculatedLandLines - Array of calculated land lines
   * @returns {Object} All calculated totals
   */
  calculateTotalsFromLandLines(
    calculatedLandLines,
    views = [],
    waterfronts = [],
  ) {
    const totalAcreage = calculatedLandLines.reduce((total, line) => {
      const size = parseFloat(line.size) || 0;
      return line.size_unit === 'AC' ? total + size : total;
    }, 0);

    const totalFrontage = calculatedLandLines.reduce((total, line) => {
      const size = parseFloat(line.size) || 0;
      return line.size_unit === 'FF' ? total + size : total;
    }, 0);

    // Calculate LAND DETAILS values (land lines only - no views/waterfront)
    let landDetailsMarketValue = 0;
    let landCurrentUseValue = 0;
    let landCurrentUseCredit = 0;

    calculatedLandLines.forEach((line) => {
      // Market value is always the true market value for land details
      // Apply consistent treatment regardless of current use status
      landDetailsMarketValue += line.marketValue || 0;
      landCurrentUseValue += line.currentUseValue || 0;
      landCurrentUseCredit += line.currentUseCredit || 0;
    });

    // Land Details Assessed Value = Market Value - Current Use Credit
    const landDetailsAssessedValue =
      landDetailsMarketValue - landCurrentUseCredit;

    // Calculate VIEW values (market value is always the true value)
    const viewMarketValue = views.reduce((total, view) => {
      return total + (parseFloat(view.calculatedValue) || 0);
    }, 0);

    // View assessed value: market value unless the specific view is marked as current use
    const viewAssessedValue = views.reduce((total, view) => {
      const marketValue = parseFloat(view.calculatedValue) || 0;
      // If this specific view is current use, assessed value is 0, otherwise use market value
      return total + (view.current_use ? 0 : marketValue);
    }, 0);

    // Calculate WATERFRONT values (market value is always the true value)
    const waterfrontMarketValue = waterfronts.reduce((total, waterfront) => {
      return (
        total +
        (parseFloat(
          waterfront.calculated_value || waterfront.calculatedValue,
        ) || 0)
      );
    }, 0);

    // Waterfront assessed value: use assessed_value if available, otherwise calculate from current_use flag
    const waterfrontAssessedValue = waterfronts.reduce((total, waterfront) => {
      // Check if we have a pre-calculated assessed_value (from the modal)
      if (waterfront.assessed_value !== undefined) {
        return total + (parseFloat(waterfront.assessed_value) || 0);
      }
      // Fallback: calculate from current_use flag
      const marketValue =
        parseFloat(waterfront.calculated_value || waterfront.calculatedValue) ||
        0;
      return total + (waterfront.current_use ? 0 : marketValue);
    }, 0);

    // Calculate TOTAL values
    const totalMarketValue =
      landDetailsMarketValue + viewMarketValue + waterfrontMarketValue;
    // Total assessed = land assessed + view assessed + waterfront assessed
    const totalAssessedValue =
      landDetailsAssessedValue + viewAssessedValue + waterfrontAssessedValue;

    // CAMA Rule: Keep exact totals for current use precision (individual lines already rounded appropriately)
    const roundedLandDetailsMarketValue = Math.round(landDetailsMarketValue);
    const roundedLandDetailsAssessedValue = Math.round(
      landDetailsAssessedValue,
    );
    const roundedViewMarketValue = Math.round(viewMarketValue);
    const roundedViewAssessedValue = Math.round(viewAssessedValue);
    const roundedWaterfrontMarketValue = Math.round(waterfrontMarketValue);
    const roundedWaterfrontAssessedValue = Math.round(waterfrontAssessedValue);
    const roundedTotalMarketValue = Math.round(totalMarketValue);
    const roundedTotalAssessedValue = Math.round(totalAssessedValue);

    return {
      // Basic measurements
      totalAcreage: Math.round(totalAcreage * 1000) / 1000,
      totalFrontage: Math.round(totalFrontage * 100) / 100,

      // Land totals (land lines only) - New field names
      landMarketValue: roundedLandDetailsMarketValue,
      landCurrentUseValue: Math.round(landCurrentUseValue),
      landTaxableValue: roundedLandDetailsAssessedValue,

      // Legacy field names for backward compatibility
      landDetailsMarketValue: roundedLandDetailsMarketValue,
      landDetailsAssessedValue: roundedLandDetailsAssessedValue,
      landAssessedValue: roundedLandDetailsAssessedValue,

      // View totals
      viewMarketValue: roundedViewMarketValue,
      viewTaxableValue: roundedViewAssessedValue,
      viewAssessedValue: roundedViewAssessedValue,

      // Waterfront totals
      waterfrontMarketValue: roundedWaterfrontMarketValue,
      waterfrontTaxableValue: roundedWaterfrontAssessedValue,
      waterfrontAssessedValue: roundedWaterfrontAssessedValue,

      // Grand totals (land + view + waterfront)
      totalMarketValue: roundedTotalMarketValue,
      totalCurrentUseValue: Math.round(landCurrentUseValue),
      totalCurrentUseCredit: Math.round(landCurrentUseCredit),
      totalTaxableValue: roundedTotalAssessedValue,
      totalAssessedValue: roundedTotalAssessedValue,

      // Legacy field names for other totals
      totalLNICU: Math.round(landCurrentUseValue),
      totalCUValue: Math.round(landCurrentUseValue),
      totalViewValue: roundedViewMarketValue,

      // Metadata
      hasCurrentUseLand: calculatedLandLines.some((line) =>
        this.isCurrentUseCategory(line.land_use_type),
      ),
    };
  }

  // Helper methods with caching for efficient factor lookups

  /**
   * Get zone data with caching
   * @param {String} zoneId - Zone ID
   * @returns {Object} Zone data
   */
  getZoneData(zoneId) {
    if (this.factorCache.zones.has(zoneId)) {
      return this.factorCache.zones.get(zoneId);
    }

    const zone = this.zones.find((z) => z.id === zoneId || z._id === zoneId);
    this.factorCache.zones.set(zoneId, zone);
    return zone;
  }

  /**
   * Get excess acreage rate from zone
   * @param {String} zoneId - Zone ID
   * @returns {Number} Rate per acre
   */
  getExcessAcreageRate(zoneId) {
    const zone = this.getZoneData(zoneId);
    return zone?.excessLandCostPerAcre || 0;
  }

  /**
   * Get land ladder value for given acreage using smooth curve interpolation (returns total value, not rate per acre)
   * @param {Number} acreage - Acreage amount
   * @param {String} zoneId - Zone ID
   * @returns {Number} Total interpolated value for the acreage using monotone cubic interpolation
   */
  getLandLadderRate(acreage, zoneId) {
    const ladders = this.landLadders[zoneId];
    console.log(`DEBUG: Looking up zone ${zoneId}:`);
    console.log(`  - landLadders[zoneId] exists:`, zoneId in this.landLadders);
    console.log(`  - ladders value:`, ladders);
    console.log(`  - ladders is array:`, Array.isArray(ladders));
    console.log(`  - ladders length:`, ladders?.length);

    if (!ladders || !Array.isArray(ladders) || ladders.length === 0) {
      console.warn(
        `No land ladder data found for zone ${zoneId}. Available zones:`,
        Object.keys(this.landLadders || {}),
      );
      console.warn(
        `Full landLadders object:`,
        JSON.stringify(this.landLadders, null, 2),
      );
      return 0;
    }
    console.log(
      `Looking up ladder rate for ${acreage} acres in zone ${zoneId}. Available tiers:`,
      ladders.map((t) => `${t.acreage}AC@${t.value}`),
    );

    const sortedLadders = [...ladders].sort((a, b) => a.acreage - b.acreage);

    // If only one point, return that value
    if (sortedLadders.length === 1) {
      return sortedLadders[0].value;
    }

    // If acreage is at or before first tier, use first tier value
    if (acreage <= sortedLadders[0].acreage) {
      return sortedLadders[0].value;
    }

    // If acreage is at or after last tier, use last tier value
    if (acreage >= sortedLadders[sortedLadders.length - 1].acreage) {
      return sortedLadders[sortedLadders.length - 1].value;
    }

    // Use monotone cubic interpolation (same as D3's curveMonotoneX)
    return this.monotoneCubicInterpolation(sortedLadders, acreage);
  }

  /**
   * Monotone cubic interpolation - maintains shape and prevents overshooting
   * This matches D3's curveMonotoneX mathematical approach
   * @param {Array} points - Array of {acreage, value} points
   * @param {Number} targetAcreage - Target acreage to interpolate
   * @returns {Number} Interpolated value
   */
  monotoneCubicInterpolation(points, targetAcreage) {
    // Find the interval containing the target acreage
    let i = 0;
    for (let j = 1; j < points.length; j++) {
      if (targetAcreage <= points[j].acreage) {
        i = j - 1;
        break;
      }
    }

    // If somehow we didn't find an interval, use linear interpolation as fallback
    if (i >= points.length - 1) {
      const last = points[points.length - 1];
      const secondLast = points[points.length - 2];
      const ratio =
        (targetAcreage - secondLast.acreage) /
        (last.acreage - secondLast.acreage);
      return secondLast.value + (last.value - secondLast.value) * ratio;
    }

    const x0 = points[i].acreage;
    const x1 = points[i + 1].acreage;
    const y0 = points[i].value;
    const y1 = points[i + 1].value;

    // Calculate tangent slopes using finite differences (monotone preserving)
    let m0 = 0,
      m1 = 0;

    if (i > 0) {
      const dx0 = points[i].acreage - points[i - 1].acreage;
      const dy0 = points[i].value - points[i - 1].value;
      const dx1 = x1 - x0;
      const dy1 = y1 - y0;

      // Monotone slope calculation
      const s0 = dx0 > 0 ? dy0 / dx0 : 0;
      const s1 = dx1 > 0 ? dy1 / dx1 : 0;

      if (s0 * s1 > 0) {
        m0 = (s0 + s1) / 2;
        // Apply monotonicity constraint
        const alpha = m0 / s1;
        if (alpha > 3) m0 = 3 * s1;
        else if (alpha < 0) m0 = 0;
      }
    } else {
      // For first point, use the slope of the first segment
      m0 = (y1 - y0) / (x1 - x0);
    }

    if (i < points.length - 2) {
      const dx1 = x1 - x0;
      const dy1 = y1 - y0;
      const dx2 = points[i + 2].acreage - x1;
      const dy2 = points[i + 2].value - y1;

      // Monotone slope calculation
      const s1 = dx1 > 0 ? dy1 / dx1 : 0;
      const s2 = dx2 > 0 ? dy2 / dx2 : 0;

      if (s1 * s2 > 0) {
        m1 = (s1 + s2) / 2;
        // Apply monotonicity constraint
        const beta = m1 / s1;
        if (beta > 3) m1 = 3 * s1;
        else if (beta < 0) m1 = 0;
      }
    } else {
      // For last point, use the slope of the last segment
      m1 = (y1 - y0) / (x1 - x0);
    }

    // Hermite interpolation
    const t = (targetAcreage - x0) / (x1 - x0);
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1; // basis function for y0
    const h10 = t3 - 2 * t2 + t; // basis function for m0
    const h01 = -2 * t3 + 3 * t2; // basis function for y1
    const h11 = t3 - t2; // basis function for m1

    const dx = x1 - x0;
    return h00 * y0 + h10 * dx * m0 + h01 * y1 + h11 * dx * m1;
  }

  /**
   * Get frontage rate for zone
   * @param {String} zoneId - Zone ID
   * @returns {Number} Rate per front foot
   */
  getFrontageRate(zoneId) {
    const ladders = this.landLadders[zoneId];
    if (!ladders || !Array.isArray(ladders) || ladders.length === 0) {
      return 0;
    }
    return ladders[0]?.frontageRate || ladders[0]?.value || 0;
  }

  /**
   * Get neighborhood factor with caching
   * @param {String} neighborhoodId - Neighborhood ID
   * @returns {Number} Neighborhood factor
   */
  getNeighborhoodFactor(neighborhoodId) {
    if (!neighborhoodId) return 1.0;

    if (this.factorCache.neighborhoods.has(neighborhoodId)) {
      return this.factorCache.neighborhoods.get(neighborhoodId);
    }

    const neighborhood = this.neighborhoodCodes.find(
      (n) => n._id === neighborhoodId || n.id === neighborhoodId,
    );
    const factor = neighborhood?.factor ? neighborhood.factor / 100 : 1.0;
    this.factorCache.neighborhoods.set(neighborhoodId, factor);
    return factor;
  }

  /**
   * Get site factor with caching
   * @param {String} siteConditionsId - Site conditions ID
   * @returns {Number} Site factor
   */
  getSiteFactor(siteConditionsId) {
    if (!siteConditionsId) return 1.0;

    if (this.factorCache.sites.has(siteConditionsId)) {
      return this.factorCache.sites.get(siteConditionsId);
    }

    const siteAttribute = this.siteAttributes.find(
      (s) => s._id === siteConditionsId || s.id === siteConditionsId,
    );
    const factor = siteAttribute?.rate ? siteAttribute.rate / 100 : 1.0;
    this.factorCache.sites.set(siteConditionsId, factor);
    return factor;
  }

  /**
   * Get driveway factor with caching
   * @param {String} drivewayTypeId - Driveway type ID
   * @returns {Number} Driveway factor
   */
  getDrivewayFactor(drivewayTypeId) {
    if (!drivewayTypeId) return 1.0;

    if (this.factorCache.driveways.has(drivewayTypeId)) {
      return this.factorCache.driveways.get(drivewayTypeId);
    }

    const drivewayAttribute = this.drivewayAttributes.find(
      (d) => d._id === drivewayTypeId || d.id === drivewayTypeId,
    );
    const factor = drivewayAttribute?.rate ? drivewayAttribute.rate / 100 : 1.0;
    this.factorCache.driveways.set(drivewayTypeId, factor);
    return factor;
  }

  /**
   * Get road factor with caching
   * @param {String} roadTypeId - Road type ID
   * @returns {Number} Road factor
   */
  getRoadFactor(roadTypeId) {
    if (!roadTypeId) return 1.0;

    if (this.factorCache.roads.has(roadTypeId)) {
      return this.factorCache.roads.get(roadTypeId);
    }

    const roadAttribute = this.roadAttributes.find(
      (r) => r._id === roadTypeId || r.id === roadTypeId,
    );
    const factor = roadAttribute?.rate ? roadAttribute.rate / 100 : 1.0;
    this.factorCache.roads.set(roadTypeId, factor);
    return factor;
  }

  /**
   * Get topography factor with caching
   * @param {String} topography - Topography description
   * @returns {Number} Topography factor
   */
  getTopographyFactor(topography) {
    if (!topography) return 1.0;

    if (this.factorCache.topography.has(topography)) {
      return this.factorCache.topography.get(topography);
    }

    const topologyAttribute = this.topologyAttributes.find(
      (t) => t.displayText?.toLowerCase() === topography?.toLowerCase(),
    );
    const factor = topologyAttribute?.rate ? topologyAttribute.rate / 100 : 1.0;
    this.factorCache.topography.set(topography, factor);
    return factor;
  }

  /**
   * Get condition factor
   * @param {String} condition - Condition value
   * @returns {Number} Condition factor
   */
  getConditionFactor(condition) {
    const conditionValue = parseFloat(condition);
    if (isNaN(conditionValue)) {
      return 1.0;
    }
    return conditionValue / 100;
  }

  // Additional helper methods for land assessment calculations

  /**
   * Calculate excess land value using zone's excess land cost per acre
   * @param {Number} excessAcreage - Amount of acreage beyond the highest ladder tier
   * @param {String} zoneId - Zone ID
   * @returns {Number} Excess land value
   */
  calculateExcessLandValue(excessAcreage, zoneId) {
    const zone = this.zones.find((z) => z.id === zoneId || z._id === zoneId);
    if (!zone || !zone.excessLandCostPerAcre) {
      console.warn(
        `No excess land cost found for zone ${zoneId}, using highest tier rate`,
      );
      // Fallback to highest tier rate if no excess land rate defined
      const ladders = this.landLadders[zoneId];
      if (ladders && ladders.length > 0) {
        const highestTier = ladders.sort((a, b) => b.acreage - a.acreage)[0];
        return excessAcreage * highestTier.value;
      }
      return 0;
    }

    return excessAcreage * zone.excessLandCostPerAcre;
  }

  /**
   * Apply acreage discount to a calculated value based on acreage discount settings
   * @param {Number} value - The calculated land value before discount
   * @param {Number} acreage - The acreage amount
   * @returns {Number} Discounted land value
   */
  applyAcreageDiscount(value, acreage) {
    if (!this.acreageDiscountSettings || !value || !acreage) {
      return value;
    }

    const discountPercentage = this.calculateAcreageDiscountPercentage(acreage);
    const discountAmount = (value * discountPercentage) / 100;

    return Math.round(value - discountAmount);
  }

  /**
   * Calculate discount percentage for given acreage based on settings
   * @param {Number} acreage - The acreage amount
   * @returns {Number} Discount percentage (0-100)
   */
  calculateAcreageDiscountPercentage(acreage) {
    if (!this.acreageDiscountSettings) {
      return 0;
    }

    const settings = this.acreageDiscountSettings;

    // If below minimum, no discount
    if (acreage < settings.minimumQualifyingAcreage) {
      return 0;
    }

    // If above maximum, use maximum discount
    if (acreage >= settings.maximumQualifyingAcreage) {
      return settings.maximumDiscountPercentage;
    }

    // Linear interpolation between minimum and maximum
    const acreageRange =
      settings.maximumQualifyingAcreage - settings.minimumQualifyingAcreage;
    const acreageAboveMin = acreage - settings.minimumQualifyingAcreage;
    const discountRatio = acreageAboveMin / acreageRange;

    return (
      Math.round(discountRatio * settings.maximumDiscountPercentage * 100) / 100
    );
  }

  /**
   * Check if a land use type is a current use category
   * @param {String} landUseTypeCode - Land use type code
   * @returns {Boolean} True if current use category
   */
  isCurrentUseCategory(landUseTypeCode) {
    return this.currentUseCategories.some(
      (category) => category.code === landUseTypeCode,
    );
  }
}

// Export for both CommonJS (Node.js) and ES6 modules (Ember)
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = LandAssessmentCalculator;
} else {
  // Browser/Ember environment - use both global and ES6 export
  if (typeof window !== 'undefined') {
    window.LandAssessmentCalculator = LandAssessmentCalculator;
  }
}

// ES6 export for Ember
export default LandAssessmentCalculator;
