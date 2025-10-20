// Assessment calculation utilities

/**
 * Round a value to the nearest hundred
 * @param {number} value - The value to round
 * @returns {number} - The rounded value
 */
function roundToNearestHundred(value) {
  if (typeof value !== 'number' || isNaN(value)) {
    return 0;
  }
  return Math.round(value / 100) * 100;
}

/**
 * Calculate total assessed value from all components
 * @param {Object} components - Object containing all assessment components
 * @param {number} components.landValue - Land assessment value
 * @param {number} components.buildingValue - Building assessment value
 * @param {number} components.featuresValue - Features/outbuildings value
 * @param {number} components.sketchValue - Sketch value (if applicable)
 * @returns {number} - Total assessed value rounded to nearest hundred
 */
function calculateTotalAssessedValue({
  landValue = 0,
  buildingValue = 0,
  featuresValue = 0,
  sketchValue = 0,
}) {
  // Round each component to nearest hundred first
  const roundedLand = roundToNearestHundred(landValue);
  const roundedBuilding = roundToNearestHundred(buildingValue);
  const roundedFeatures = roundToNearestHundred(featuresValue);
  const roundedSketch = roundToNearestHundred(sketchValue);

  // Calculate total and round again
  const total = roundedLand + roundedBuilding + roundedFeatures + roundedSketch;
  return roundToNearestHundred(total);
}

/**
 * Get all assessment components for a property
 * @param {string} propertyId - Property ID
 * @param {number} assessmentYear - Assessment year
 * @returns {Object} - Object containing all component values
 */
async function getPropertyAssessmentComponents(
  propertyId,
  assessmentYear = null,
  cardNumber = null, // Add card number parameter for card-specific calculations
) {
  const PropertyAssessment = require('../models/PropertyAssessment');
  const BuildingAssessment = require('../models/BuildingAssessment');
  const LandAssessment = require('../models/LandAssessment');
  const PropertyFeature = require('../models/PropertyFeature');
  const { calculateFeatureTotals } = require('./feature-assessment-calculator');

  const currentYear = assessmentYear || new Date().getFullYear();

  try {
    // Get land assessment (most recent up to currentYear) - property-level
    const landAssessment = await LandAssessment.findOne({
      property_id: propertyId,
      effective_year: { $lte: currentYear },
    }).sort({ effective_year: -1 });

    // Get building assessments - filter by card number if provided
    const buildingQuery = {
      property_id: propertyId,
      effective_year: { $lte: currentYear },
    };
    if (cardNumber) {
      buildingQuery.card_number = cardNumber;
    }
    const buildingAssessments = await BuildingAssessment.find(
      buildingQuery,
    ).sort({ effective_year: -1 });

    // Get property features - filter by card number if provided
    const featureQuery = { property_id: propertyId };
    if (cardNumber) {
      featureQuery.card_number = cardNumber;
    }
    const features =
      await PropertyFeature.find(featureQuery).populate('feature_code_id');

    // Get card-specific land features (view/waterfront values per card)
    const cardLandQuery = {
      property_id: propertyId,
      effective_year: { $lte: currentYear },
      'land.view_value': { $exists: true },
    };
    if (cardNumber) {
      cardLandQuery.card_number = cardNumber;
    }
    const cardLandFeatures = await PropertyAssessment.find(cardLandQuery).sort({
      effective_year: -1,
    });

    // Calculate land value based on card context
    let landValue = 0;
    let landComponents = {};

    if (cardNumber) {
      // Card-specific calculation
      // Since cardLandFeatures is already filtered by cardNumber, we can access the first result
      const cardFeatures = cardLandFeatures[0]; // Most recent record for this card

      console.log(`🌳 LAND CALCULATION - Card ${cardNumber}:`, {
        cardNumber,
        baseLandValue: landAssessment?.calculated_totals?.totalAssessedValue || 0,
        cardFeaturesFound: !!cardFeatures,
        cardFeaturesCardNumber: cardFeatures?.card_number,
        viewValue: cardFeatures?.land?.view_value || 0,
        waterfrontValue: cardFeatures?.land?.waterfront_value || 0,
      });

      if (cardNumber === 1) {
        // Card 1 gets base land value + card-specific features
        landValue = landAssessment?.calculated_totals?.totalAssessedValue || 0;
        console.log(`🌳 Card 1 - Starting with base land: $${landValue.toLocaleString()}`);

        if (cardFeatures?.land) {
          const viewValue = cardFeatures.land.view_value || 0;
          const waterfrontValue = cardFeatures.land.waterfront_value || 0;
          landValue += viewValue + waterfrontValue;
          console.log(`🌳 Card 1 - Added view ($${viewValue.toLocaleString()}) + waterfront ($${waterfrontValue.toLocaleString()}) = $${landValue.toLocaleString()}`);
        }
      } else {
        // Card 2+ gets only card-specific view/waterfront values
        console.log(`🌳 Card ${cardNumber} - Should get ONLY view/waterfront (NO base land)`);
        if (cardFeatures?.land) {
          const viewValue = cardFeatures.land.view_value || 0;
          const waterfrontValue = cardFeatures.land.waterfront_value || 0;
          landValue = viewValue + waterfrontValue;
          console.log(`🌳 Card ${cardNumber} - View ($${viewValue.toLocaleString()}) + waterfront ($${waterfrontValue.toLocaleString()}) = $${landValue.toLocaleString()}`);
        } else {
          console.log(`🌳 Card ${cardNumber} - No card features found, land value = $0`);
        }
      }

      landComponents = {
        baseLandValue:
          cardNumber === 1
            ? landAssessment?.calculated_totals?.totalAssessedValue || 0
            : 0,
        viewValue: cardFeatures?.land?.view_value || 0,
        waterfrontValue: cardFeatures?.land?.waterfront_value || 0,
        cardNumber: cardNumber,
      };

      console.log(`🌳 FINAL LAND VALUE for Card ${cardNumber}: $${landValue.toLocaleString()}`, landComponents);
    } else {
      // Property-wide calculation (sum all cards)
      landValue = landAssessment?.calculated_totals?.totalAssessedValue || 0;

      // Add all card-specific view/waterfront values
      cardLandFeatures.forEach((cardFeature) => {
        if (cardFeature.land) {
          landValue +=
            (cardFeature.land.view_value || 0) +
            (cardFeature.land.waterfront_value || 0);
        }
      });

      landComponents = {
        baseLandValue:
          landAssessment?.calculated_totals?.totalAssessedValue || 0,
        totalViewValue: cardLandFeatures.reduce(
          (sum, cf) => sum + (cf.land?.view_value || 0),
          0,
        ),
        totalWaterfrontValue: cardLandFeatures.reduce(
          (sum, cf) => sum + (cf.land?.waterfront_value || 0),
          0,
        ),
        cardCount: cardLandFeatures.length,
      };
    }

    // Calculate building value - buildingAssessments is already filtered by cardNumber if provided
    const buildingValue = buildingAssessments.reduce((total, building) => {
      const value = building.building_value || building.assessed_value || 0;
      const context = cardNumber
        ? `Card ${cardNumber} calculation`
        : 'Property-wide calculation';
      console.log(
        `[${context}] Building assessment found for Card ${building.card_number}, Value: $${value.toLocaleString()}`,
      );
      return total + value;
    }, 0);

    // Calculate features value using the new feature calculator
    const featureCalculations = calculateFeatureTotals(features);
    const featuresValue = featureCalculations.totalFeaturesValue;

    console.log(
      `Assessment components for property ${propertyId}${cardNumber ? ` Card ${cardNumber}` : ''}:`,
      {
        landValue: landValue,
        landComponents: landComponents,
        buildingValue: buildingValue,
        featuresValue: featuresValue,
        featureCount: featureCalculations.featureCount,
        buildingRecords: buildingAssessments.length,
      },
    );

    // TODO: Add sketch value calculation when sketch model is implemented
    const sketchValue = 0;

    return {
      landValue,
      buildingValue,
      featuresValue,
      sketchValue,
      components: {
        land: landAssessment,
        landComponents: landComponents, // Detailed land breakdown
        cardLandFeatures: cardLandFeatures, // Card-specific features
        buildings: buildingAssessments,
        features: features,
        featureCalculations: featureCalculations, // Include detailed calculations
        sketch: null, // TODO: Implement sketch model
      },
    };
  } catch (error) {
    console.error('Error getting property assessment components:', error);
    throw error;
  }
}

/**
 * Check if warrant has been issued for a tax year (prevents assessment changes after warrant)
 * @param {string} municipalityId - Municipality ID
 * @param {number} taxYear - Tax year to check
 * @returns {boolean} - True if warrant issued, false if still allows changes
 */
async function isWarrantIssued(municipalityId, taxYear) {
  // TODO: Implement warrant status checking when warrant model is available
  // For now, return false to allow changes
  // This should check a Warrant or TaxRoll model with fields like:
  // { municipality_id, tax_year, warrant_issued_date, status: 'draft'|'issued'|'committed' }
  try {
    const currentDate = new Date();
    const taxYearEnd = new Date(taxYear + 1, 3, 1); // April 1st of following year

    // For now, assume warrant is issued after April 1st following the tax year
    // This is a placeholder - replace with actual warrant model lookup
    return currentDate > taxYearEnd;
  } catch (error) {
    console.warn('Error checking warrant status, allowing changes:', error);
    return false; // Allow changes if we can't determine warrant status
  }
}

/**
 * Update total assessed value for a property (respects temporal assessment pattern)
 * @param {string} propertyId - Property ID
 * @param {string} municipalityId - Municipality ID
 * @param {number} assessmentYear - Assessment year
 * @param {string} userId - User ID for audit trail
 * @returns {Object} - Updated property assessment
 */
async function updatePropertyTotalAssessment(
  propertyId,
  municipalityId,
  assessmentYear = null,
  userId = null,
  options = {},
) {
  const PropertyAssessment = require('../models/PropertyAssessment');
  const mongoose = require('mongoose');
  const currentYear = assessmentYear || new Date().getFullYear();

  try {
    // Check if warrant has been issued for this tax year (prevents changes after warrant)
    const warrantIssued = await isWarrantIssued(municipalityId, currentYear);
    if (warrantIssued) {
      console.warn(
        `Cannot update assessment for property ${propertyId}: Warrant already issued for tax year ${currentYear}`,
      );
      throw new Error(
        `Assessment changes not allowed: Final warrant has been issued for tax year ${currentYear}`,
      );
    }

    // Convert propertyId to ObjectId if it's a string
    const propertyObjectId =
      typeof propertyId === 'string'
        ? new mongoose.Types.ObjectId(propertyId)
        : propertyId;

    // Get all current component values (includes latest changes to any component)
    const components = await getPropertyAssessmentComponents(
      propertyId,
      currentYear,
    );
    const roundedLandValue = roundToNearestHundred(components.landValue);
    const roundedBuildingValue = roundToNearestHundred(
      components.buildingValue,
    );
    const roundedFeaturesValue = roundToNearestHundred(
      components.featuresValue,
    );
    const roundedSketchValue = roundToNearestHundred(components.sketchValue);

    // Calculate new total with all current component values
    const newTotalValue = calculateTotalAssessedValue({
      landValue: components.landValue,
      buildingValue: components.buildingValue,
      featuresValue: components.featuresValue,
      sketchValue: components.sketchValue,
    });

    // Find or create assessment record for current year
    let yearAssessment = await PropertyAssessment.findOne({
      property_id: propertyObjectId,
      effective_year: currentYear,
    });

    if (yearAssessment) {
      // Update the total value for current year
      yearAssessment.total_value = newTotalValue;
      yearAssessment.reviewed_date = new Date();
      if (userId) {
        yearAssessment.reviewed_by = userId;
      }

      // Update other_improvements with feature calculated totals
      if (components.featureCalculations) {
        yearAssessment.other_improvements = {
          value: roundedFeaturesValue,
          description: `${components.featureCalculations.featureCount} features total`,
          last_changed: currentYear,
          calculated_totals: components.featureCalculations,
        };
      }

      // Update land with card-specific view/waterfront values if available
      if (components.landComponents) {
        yearAssessment.land = {
          value: roundedLandValue,
          last_changed: currentYear,
          calculated_totals: components.landComponents,
        };
      }

      await yearAssessment.save();

      console.log(
        `Updated ${currentYear} total assessment for property ${propertyId}: $${newTotalValue.toLocaleString()} (Land: $${roundedLandValue.toLocaleString()}, Building: $${roundedBuildingValue.toLocaleString()}, Features: $${roundedFeaturesValue.toLocaleString()})`,
      );
    } else {
      // Create assessment record for current year with temporal values
      const assessmentData = {
        property_id: propertyObjectId,
        municipality_id: municipalityId,
        effective_year: currentYear,
        total_value: newTotalValue,
        assessment_method: 'market',
        reviewed_date: new Date(),
        reviewed_by: userId,
        change_reason: 'cyclical_review',
      };

      // Store feature calculated totals in other_improvements
      if (components.featureCalculations) {
        assessmentData.other_improvements = {
          value: roundedFeaturesValue,
          description: `${components.featureCalculations.featureCount} features total`,
          last_changed: currentYear,
          calculated_totals: components.featureCalculations,
        };
      }

      // Store land with card-specific view/waterfront values if available
      if (components.landComponents) {
        assessmentData.land = {
          value: roundedLandValue,
          last_changed: currentYear,
          calculated_totals: components.landComponents,
        };
      }

      yearAssessment = await PropertyAssessment.create(assessmentData);

      console.log(
        `Created ${currentYear} assessment for property ${propertyId}: $${newTotalValue.toLocaleString()}`,
      );
    }

    // Also update the denormalized value in PropertyTreeNode
    try {
      const PropertyTreeNode = require('../models/PropertyTreeNode');
      await PropertyTreeNode.findByIdAndUpdate(propertyObjectId, {
        assessed_value: newTotalValue,
        last_updated: new Date(),
      });
      console.log(
        `Updated PropertyTreeNode assessed_value to $${newTotalValue.toLocaleString()}`,
      );
    } catch (updateError) {
      console.warn(
        'Failed to update PropertyTreeNode assessed_value:',
        updateError,
      );
    }

    return {
      propertyAssessment: yearAssessment,
      totalAssessedValue: newTotalValue,
      components: {
        landValue: roundedLandValue,
        buildingValue: roundedBuildingValue,
        featuresValue: roundedFeaturesValue,
        sketchValue: roundedSketchValue,
      },
    };
  } catch (error) {
    console.error('Error updating property total assessment:', error);
    throw error;
  }
}

/**
 * Mass recalculation for multiple properties
 * @param {Array} propertyIds - Array of property IDs
 * @param {string} municipalityId - Municipality ID
 * @param {number} assessmentYear - Assessment year
 * @param {string} userId - User ID for audit trail
 * @returns {Object} - Results of mass recalculation
 */
async function massRecalculateAssessments(
  propertyIds,
  municipalityId,
  assessmentYear = null,
  userId = null,
) {
  const results = {
    successful: [],
    failed: [],
    totalProcessed: 0,
    totalValue: 0,
  };

  for (const propertyId of propertyIds) {
    try {
      const result = await updatePropertyTotalAssessment(
        propertyId,
        municipalityId,
        assessmentYear,
        userId,
      );
      results.successful.push({
        propertyId,
        totalAssessedValue: result.totalAssessedValue,
      });
      results.totalValue += result.totalAssessedValue;
      results.totalProcessed++;
    } catch (error) {
      console.error(
        `Failed to recalculate assessment for property ${propertyId}:`,
        error,
      );
      results.failed.push({
        propertyId,
        error: error.message,
      });
    }
  }

  console.log(
    `Mass recalculation completed: ${results.successful.length} successful, ${results.failed.length} failed`,
  );

  return results;
}

/**
 * Mass revaluation with new rates/factors
 * @param {Array} propertyIds - Array of property IDs
 * @param {string} municipalityId - Municipality ID
 * @param {Object} revaluationFactors - New rates and factors to apply
 * @param {number} assessmentYear - Assessment year
 * @param {string} userId - User ID for audit trail
 * @returns {Object} - Results of mass revaluation
 */
async function massRevaluation(
  propertyIds,
  municipalityId,
  revaluationFactors,
  assessmentYear = null,
  userId = null,
) {
  const BuildingAssessment = require('../models/BuildingAssessment');
  const LandAssessment = require('../models/LandAssessment');

  const results = {
    successful: [],
    failed: [],
    totalProcessed: 0,
    totalValueBefore: 0,
    totalValueAfter: 0,
  };

  for (const propertyId of propertyIds) {
    try {
      // Get current total before revaluation
      const beforeComponents = await getPropertyAssessmentComponents(
        propertyId,
        assessmentYear,
      );
      const beforeTotal = calculateTotalAssessedValue(beforeComponents);

      // Apply revaluation factors to building assessments
      if (revaluationFactors.buildingRates) {
        await BuildingAssessment.massRecalculateWithNewRates(
          [propertyId],
          municipalityId,
          revaluationFactors.buildingRates,
          assessmentYear,
          userId,
        );
      }

      // Apply revaluation factors to land assessments
      if (revaluationFactors.landRates) {
        // TODO: Implement land mass revaluation when needed
      }

      // Recalculate total with new values
      const afterResult = await updatePropertyTotalAssessment(
        propertyId,
        municipalityId,
        assessmentYear,
        userId,
      );

      results.successful.push({
        propertyId,
        beforeTotal,
        afterTotal: afterResult.totalAssessedValue,
        change: afterResult.totalAssessedValue - beforeTotal,
      });

      results.totalValueBefore += beforeTotal;
      results.totalValueAfter += afterResult.totalAssessedValue;
      results.totalProcessed++;
    } catch (error) {
      console.error(`Failed to revalue property ${propertyId}:`, error);
      results.failed.push({
        propertyId,
        error: error.message,
      });
    }
  }

  console.log(
    `Mass revaluation completed: ${results.successful.length} successful, ${results.failed.length} failed`,
  );
  console.log(
    `Total value change: $${(results.totalValueAfter - results.totalValueBefore).toLocaleString()}`,
  );

  return results;
}

/**
 * Update assessment totals for a specific card
 * @param {string} propertyId - Property ID
 * @param {number} cardNumber - Card number
 * @param {string} municipalityId - Municipality ID
 * @param {number} assessmentYear - Assessment year
 * @returns {Object} - Updated card assessment data
 */
async function updateCardAssessment(
  propertyId,
  cardNumber,
  municipalityId,
  assessmentYear = null,
) {
  const BuildingAssessment = require('../models/BuildingAssessment');
  const currentYear = assessmentYear || new Date().getFullYear();

  try {
    // Get components for THIS CARD ONLY
    const components = await getPropertyAssessmentComponents(
      propertyId,
      currentYear,
      cardNumber, // ← Pass card number to filter components
    );

    const cardTotal = calculateTotalAssessedValue(components);

    // Get building assessment ID for reference
    let buildingAssessmentId = null;
    if (components.components.buildings && components.components.buildings.length > 0) {
      buildingAssessmentId = components.components.buildings[0]._id;
    }

    const roundedLandValue = roundToNearestHundred(components.landValue);
    const roundedBuildingValue = roundToNearestHundred(components.buildingValue);
    const roundedFeaturesValue = roundToNearestHundred(components.featuresValue);

    console.log(`  📊 Card ${cardNumber} Final Assessment:`, {
      land: `$${roundedLandValue.toLocaleString()}`,
      building: `$${roundedBuildingValue.toLocaleString()}`,
      improvements: `$${roundedFeaturesValue.toLocaleString()}`,
      total: `$${cardTotal.toLocaleString()}`,
      landComponents: components.components.landComponents,
    });

    return {
      card_number: cardNumber,
      land_value: roundedLandValue,
      building_value: roundedBuildingValue,
      improvements_value: roundedFeaturesValue,
      card_total: cardTotal,
      building_assessment_id: buildingAssessmentId,
      last_updated: new Date(),
    };
  } catch (error) {
    console.error(`Error calculating card ${cardNumber} assessment:`, error);
    throw error;
  }
}

/**
 * Update parcel-level totals (aggregates all cards)
 * This is the NEW primary function for maintaining assessment totals
 * @param {string} propertyId - Property ID
 * @param {string} municipalityId - Municipality ID
 * @param {number} assessmentYear - Assessment year
 * @param {Object} options - Additional options (trigger, userId)
 * @returns {Object} - Updated parcel assessment with card breakdown
 */
async function updateParcelAssessment(
  propertyId,
  municipalityId,
  assessmentYear = null,
  options = {},
) {
  const ParcelAssessment = require('../models/ParcelAssessment');
  const PropertyTreeNode = require('../models/PropertyTreeNode');
  const LandAssessment = require('../models/LandAssessment');
  const mongoose = require('mongoose');
  const currentYear = assessmentYear || new Date().getFullYear();

  const startTime = Date.now();

  try {
    // Check warrant status
    const warrantIssued = await isWarrantIssued(municipalityId, currentYear);
    if (warrantIssued) {
      console.warn(
        `Cannot update assessment for property ${propertyId}: Warrant already issued for tax year ${currentYear}`,
      );
      throw new Error(
        `Assessment changes not allowed: Final warrant has been issued for tax year ${currentYear}`,
      );
    }

    // Convert propertyId to ObjectId if it's a string
    const propertyObjectId =
      typeof propertyId === 'string'
        ? new mongoose.Types.ObjectId(propertyId)
        : propertyId;

    // Get property to know how many cards exist
    const property = await PropertyTreeNode.findById(propertyObjectId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    const totalCards = property.cards?.total_cards || 1;

    console.log(
      `\n🔄 Updating Parcel Assessment for property ${propertyId} (${totalCards} card${totalCards > 1 ? 's' : ''})`,
    );

    // Calculate assessment for EACH CARD
    const cardAssessments = [];
    const parcelTotals = {
      total_land_value: 0,
      total_building_value: 0,
      total_improvements_value: 0,
      total_assessed_value: 0,
    };

    for (let cardNum = 1; cardNum <= totalCards; cardNum++) {
      const cardData = await updateCardAssessment(
        propertyId,
        cardNum,
        municipalityId,
        currentYear,
      );

      cardAssessments.push(cardData);

      // Aggregate to parcel totals
      parcelTotals.total_land_value += cardData.land_value;
      parcelTotals.total_building_value += cardData.building_value;
      parcelTotals.total_improvements_value += cardData.improvements_value;
      parcelTotals.total_assessed_value += cardData.card_total;
    }

    // Get land allocation details
    const landAssessment = await LandAssessment.findOne({
      property_id: propertyObjectId,
      effective_year: { $lte: currentYear },
    }).sort({ effective_year: -1 });

    const baseLandValue =
      landAssessment?.calculated_totals?.totalAssessedValue || 0;

    // Build card land values map
    const cardLandValuesMap = {};
    cardAssessments.forEach((card) => {
      cardLandValuesMap[card.card_number] = card.land_value;
    });

    const landAllocation = {
      base_land_value: roundToNearestHundred(baseLandValue),
      card_1_land_value: cardAssessments[0]?.land_value || 0,
      total_view_value: 0, // TODO: Calculate from PropertyAssessment view values
      total_waterfront_value: 0, // TODO: Calculate from PropertyAssessment waterfront values
      card_land_values: cardLandValuesMap,
    };

    // Find or create ParcelAssessment record
    let parcelAssessment = await ParcelAssessment.findOne({
      property_id: propertyObjectId,
      effective_year: currentYear,
    });

    const previousTotal =
      parcelAssessment?.parcel_totals?.total_assessed_value || 0;
    const changeAmount = parcelTotals.total_assessed_value - previousTotal;
    const changePercentage =
      previousTotal > 0 ? ((changeAmount / previousTotal) * 100).toFixed(2) : 0;

    const calculationDuration = Date.now() - startTime;

    if (parcelAssessment) {
      // Update existing parcel assessment
      parcelAssessment.parcel_totals = parcelTotals;
      parcelAssessment.card_assessments = cardAssessments;
      parcelAssessment.land_allocation = landAllocation;
      parcelAssessment.last_calculated = new Date();
      parcelAssessment.calculation_trigger = options.trigger || 'building_update';
      parcelAssessment.calculated_by = options.userId || null;
      parcelAssessment.previous_total = previousTotal;
      parcelAssessment.change_amount = changeAmount;
      parcelAssessment.change_percentage = parseFloat(changePercentage);
      parcelAssessment.total_cards_count = totalCards;
      parcelAssessment.calculation_duration_ms = calculationDuration;

      await parcelAssessment.save();
    } else {
      // Create new parcel assessment
      parcelAssessment = await ParcelAssessment.create({
        property_id: propertyObjectId,
        municipality_id: municipalityId,
        effective_year: currentYear,
        parcel_totals: parcelTotals,
        card_assessments: cardAssessments,
        land_allocation: landAllocation,
        calculation_trigger: options.trigger || 'initial_calculation',
        calculated_by: options.userId || null,
        previous_total: 0,
        change_amount: parcelTotals.total_assessed_value,
        change_percentage: 0,
        total_cards_count: totalCards,
        calculation_duration_ms: calculationDuration,
      });
    }

    // Update denormalized values in PropertyTreeNode
    await PropertyTreeNode.findByIdAndUpdate(propertyObjectId, {
      assessed_value: parcelTotals.total_assessed_value, // Backward compatibility
      assessment_summary: {
        total_value: parcelTotals.total_assessed_value,
        land_value: parcelTotals.total_land_value,
        building_value: parcelTotals.total_building_value,
        improvements_value: parcelTotals.total_improvements_value,
        last_updated: new Date(),
        assessment_year: currentYear,
      },
      last_updated: new Date(),
    });

    console.log(`\n✅ Parcel Assessment Updated:`, {
      propertyId: propertyId.toString().substring(0, 8) + '...',
      totalCards,
      parcelTotal: `$${parcelTotals.total_assessed_value.toLocaleString()}`,
      breakdown: {
        land: `$${parcelTotals.total_land_value.toLocaleString()}`,
        building: `$${parcelTotals.total_building_value.toLocaleString()}`,
        improvements: `$${parcelTotals.total_improvements_value.toLocaleString()}`,
      },
      change:
        changeAmount > 0
          ? `+$${changeAmount.toLocaleString()}`
          : `$${changeAmount.toLocaleString()}`,
      changePercent: `${changePercentage}%`,
      calculationTime: `${calculationDuration}ms`,
    });

    return {
      parcelAssessment,
      cardAssessments,
      parcelTotals,
      landAllocation,
      changeAmount,
      changePercentage: parseFloat(changePercentage),
      calculationDuration,
    };
  } catch (error) {
    console.error('Error updating parcel assessment:', error);
    throw error;
  }
}

module.exports = {
  roundToNearestHundred,
  calculateTotalAssessedValue,
  getPropertyAssessmentComponents,
  updatePropertyTotalAssessment, // Keep for backward compatibility
  updateCardAssessment, // NEW: Update single card
  updateParcelAssessment, // NEW: Update entire parcel (PRIMARY FUNCTION)
  massRecalculateAssessments,
  massRevaluation,
  isWarrantIssued,
};
