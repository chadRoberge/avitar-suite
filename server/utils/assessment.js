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
) {
  const PropertyAssessment = require('../models/PropertyAssessment');
  const BuildingAssessment = require('../models/BuildingAssessment');
  const LandAssessment = require('../models/LandAssessment');
  const PropertyFeature = require('../models/PropertyFeature');

  const currentYear = assessmentYear || new Date().getFullYear();

  try {
    // Get land assessment (most recent up to currentYear)
    const landAssessment = await LandAssessment.findOne({
      property_id: propertyId,
      effective_year: { $lte: currentYear },
    }).sort({ effective_year: -1 });

    // Get building assessments (all cards, most recent up to currentYear)
    const buildingAssessments = await BuildingAssessment.find({
      property_id: propertyId,
      effective_year: { $lte: currentYear },
    }).sort({ effective_year: -1 });

    // Get property features
    const features = await PropertyFeature.find({
      property_id: propertyId,
    }).populate('feature_code_id');

    // Calculate component values
    const landValue =
      landAssessment?.calculated_totals?.totalAssessedValue || 0;

    const buildingValue = buildingAssessments.reduce((total, building) => {
      const value = building.assessed_value || building.building_value || 0;
      console.log(
        `Building assessment found: Card ${building.card_number}, Value: $${value.toLocaleString()}`,
      );
      return total + value;
    }, 0);

    console.log(`Assessment components for property ${propertyId}:`, {
      landValue: landValue,
      buildingValue: buildingValue,
      featuresValue: features.length,
      buildingRecords: buildingAssessments.length,
    });

    const featuresValue = features.reduce((total, feature) => {
      return total + (feature.calculated_value || 0);
    }, 0);

    // TODO: Add sketch value calculation when sketch model is implemented
    const sketchValue = 0;

    return {
      landValue,
      buildingValue,
      featuresValue,
      sketchValue,
      components: {
        land: landAssessment,
        buildings: buildingAssessments,
        features: features,
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

      // Only store land/building/other_improvements if they actually changed
      // For now, we're just updating the total - the components stay temporal

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

module.exports = {
  roundToNearestHundred,
  calculateTotalAssessedValue,
  getPropertyAssessmentComponents,
  updatePropertyTotalAssessment,
  massRecalculateAssessments,
  massRevaluation,
  isWarrantIssued,
};
