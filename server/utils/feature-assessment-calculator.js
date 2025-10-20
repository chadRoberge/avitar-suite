const { roundToNearestHundred } = require('./assessment');

/**
 * Calculate total feature value for a property/card
 * @param {Array} features - Array of property features
 * @returns {Object} - Calculated feature totals
 */
function calculateFeatureTotals(features) {
  if (!features || !Array.isArray(features)) {
    return {
      totalFeaturesValue: 0,
      totalCalculatedValue: 0,
      featuresValue: 0, // Legacy field name for backward compatibility
      featureCount: 0,
      featuresByCategory: {},
    };
  }

  let totalRawValue = 0;
  const featuresByCategory = {};

  // Calculate individual feature values and group by category
  features.forEach((feature) => {
    const calculatedValue = feature.calculated_value || 0;
    totalRawValue += calculatedValue;

    // Group by feature type if available
    const category = feature.feature_code_id?.category || 'Other';
    if (!featuresByCategory[category]) {
      featuresByCategory[category] = {
        count: 0,
        totalValue: 0,
        features: [],
      };
    }

    featuresByCategory[category].count++;
    featuresByCategory[category].totalValue += calculatedValue;
    featuresByCategory[category].features.push({
      id: feature._id,
      description: feature.description,
      calculatedValue: calculatedValue,
      condition: feature.condition,
    });
  });

  // Round the total to nearest hundred for assessment purposes
  const roundedTotalValue = roundToNearestHundred(totalRawValue);

  return {
    // Primary total field
    totalFeaturesValue: roundedTotalValue,

    // Raw calculation before rounding
    totalCalculatedValue: totalRawValue,

    // Legacy field name for backward compatibility
    featuresValue: roundedTotalValue,

    // Feature count
    featureCount: features.length,

    // Breakdown by category
    featuresByCategory: featuresByCategory,

    // Individual feature details for audit
    featureDetails: features.map((feature) => ({
      id: feature._id,
      description: feature.description,
      units: feature.units,
      length: feature.length,
      width: feature.width,
      rate: feature.rate,
      condition: feature.condition,
      sizeAdjustment: feature.size_adjustment,
      calculatedValue: feature.calculated_value || 0,
      measurementType: feature.measurement_type,
    })),
  };
}

/**
 * Calculate feature adjustment factors based on property characteristics
 * @param {Object} property - Property data
 * @param {Array} features - Array of property features
 * @returns {Object} - Adjustment factors and calculations
 */
function calculateFeatureAdjustments(property, features) {
  // Base calculation
  const baseTotals = calculateFeatureTotals(features);

  // Apply any property-specific adjustments (placeholder for future enhancements)
  // These could include location adjustments, property class adjustments, etc.
  let adjustmentFactor = 1.0;
  let adjustmentReason = 'No adjustments applied';

  // Example: Apply location-based adjustment (placeholder)
  // if (property.neighborhood_code === 'PREMIUM') {
  //   adjustmentFactor = 1.1;
  //   adjustmentReason = 'Premium location adjustment (+10%)';
  // }

  const adjustedTotalValue = roundToNearestHundred(
    baseTotals.totalCalculatedValue * adjustmentFactor,
  );

  return {
    ...baseTotals,
    adjustmentFactor: adjustmentFactor,
    adjustmentReason: adjustmentReason,
    adjustedTotalValue: adjustedTotalValue,
    finalFeaturesValue: adjustedTotalValue, // Use adjusted value as final
  };
}

module.exports = {
  calculateFeatureTotals,
  calculateFeatureAdjustments,
};
