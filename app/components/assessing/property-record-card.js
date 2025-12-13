import Component from '@glimmer/component';

export default class PropertyRecordCardComponent extends Component {
  // Props passed from parent:
  // @property - The property data
  // @landAssessment - Land assessment data for this card
  // @buildingAssessment - Building assessment data for this card
  // @propertyFeatures - Property features data for this card
  // @sketchData - Sketch data for this card
  // @cardNumber - The card number (1, 2, etc.)
  // @assessmentYear - The assessment year

  get cardTitle() {
    return `Card ${this.args.cardNumber}`;
  }

  get hasLandData() {
    return this.args.landAssessment?.assessment?.land_use_details?.length > 0;
  }

  get hasBuildingData() {
    console.log(this.args.buildingAssessment);
    return this.args.buildingAssessment?.assessment;
  }

  // Check if this card has base land value (acreage)
  get hasBaseLandValue() {
    const currentYearValues = this.currentYearValues;
    if (currentYearValues) {
      // Card-specific land value from assessment history
      return currentYearValues.land > 0;
    }
    // Fallback to checking land use details
    return this.hasLandData;
  }

  // Check if this card has view value
  get hasViewValue() {
    const viewDetails = this.args.landAssessment?.assessment?.view_details;
    if (!viewDetails || viewDetails.length === 0) {
      return false;
    }
    // Check if any view detail has a calculated value > 0
    return viewDetails.some((detail) => (detail.calculatedValue || 0) > 0);
  }

  // Check if this card has waterfront value
  get hasWaterfrontValue() {
    const waterfrontDetails =
      this.args.landAssessment?.assessment?.waterfront_details;

    if (!waterfrontDetails || waterfrontDetails.length === 0) {
      return false;
    }
    // Check if any waterfront detail has a calculated value > 0
    return waterfrontDetails.some(
      (detail) => (detail.calculatedValue || 0) > 0,
    );
  }

  get hasFeatures() {
    return this.args.propertyFeatures?.features?.length > 0;
  }

  get hasSketchData() {
    return this.args.sketchData?.length > 0;
  }

  get sketchTotals() {
    if (!this.args.sketchData || !this.args.sketchData.length) {
      return { totalArea: 0, totalEffectiveArea: 0, totalGLA: 0 };
    }
    return this.args.sketchData.reduce(
      (totals, sketch) => {
        totals.totalArea += sketch.total_area || 0;
        totals.totalEffectiveArea += sketch.total_effective_area || 0;
        totals.totalGLA += sketch.total_gla || 0;
        return totals;
      },
      { totalArea: 0, totalEffectiveArea: 0, totalGLA: 0 },
    );
  }

  get buildingSubAreas() {
    if (!this.args.sketchData || !this.args.sketchData.length) {
      return [];
    }

    // Group by area code and sum values
    const areaGroups = new Map();
    // Track processed shapes to avoid duplicates
    const processedShapes = new Set();
    this.args.sketchData.forEach((sketch) => {
      sketch.shapes?.forEach((shape) => {
        // Skip duplicate shapes based on their _id or unique identifier
        const shapeId = shape._id || `${shape.area}-${shape.effective_area}`;

        if (processedShapes.has(shapeId)) {
          return;
        }

        processedShapes.add(shapeId);

        shape.descriptions?.forEach((desc) => {
          const code = desc.label;

          // The desc.effective_area is the individual effective area for this description
          // This should be the actual area attributed to this specific area type
          const descEffectiveArea = desc.effective_area || 0;
          const descArea = shape.area || 0;

          if (areaGroups.has(code)) {
            // Add to existing group - sum both raw area and effective area
            const existing = areaGroups.get(code);
            existing.effectiveArea += descEffectiveArea;
            existing.rawArea += descArea;
          } else {
            // Create new group - look up full description from sketchSubAreaFactors
            const factor = this.args.sketchSubAreaFactors?.find(
              (f) => f.displayText?.toUpperCase() === code?.toUpperCase(),
            );
            const fullDescription = factor?.description || code;

            areaGroups.set(code, {
              code: code,
              description: fullDescription,
              effectiveArea: descEffectiveArea,
              rawArea: descArea,
            });
          }
        });
      });
    });

    // Calculate adjustment rates and format for display
    return Array.from(areaGroups.values()).map((group) => ({
      ...group,
      area: group.rawArea, // Total raw area of all shapes containing this area code
      effectiveArea: group.effectiveArea, // Total effective area for this area code
      adjustment: group.rawArea > 0 ? group.effectiveArea / group.rawArea : 0, // Effective / Raw
    }));
  }

  // Get current year's values from assessment history for displaying in totals sections
  get currentYearValues() {
    const history = this.assessedValuesHistory;
    // Return the first item (current year) from the history
    return history && history.length > 0 ? history[0] : null;
  }

  get assessedValuesHistory() {
    const currentYear = this.args.assessmentYear || new Date().getFullYear();
    const cardNumber = this.args.cardNumber || 1;

    // Use assessment history from API if available
    if (this.args.assessmentHistory && this.args.assessmentHistory.length > 0) {
      // Get the last 3 years from the history
      const years = [];
      const historyByYear = {};

      // Build a map of years for easy lookup
      this.args.assessmentHistory.forEach((record) => {
        historyByYear[record.year] = record;
      });

      // Create array for current year and 2 previous years
      for (let i = 0; i < 3; i++) {
        const year = currentYear - i;
        const yearRecord = historyByYear[year];

        if (yearRecord && yearRecord.current_card) {
          // We have actual historical data for this card
          years.push({
            year,
            building: yearRecord.current_card.building_value || 0,
            features: yearRecord.current_card.improvements_value || 0,
            land: yearRecord.current_card.land_value || 0,
            cardTotal: yearRecord.current_card.card_total || 0,
            parcelTotal: yearRecord.parcel_totals.total_value || 0,
            isCurrent: i === 0,
            cardNumber: cardNumber,
            isCard1: cardNumber === 1,
          });
        } else {
          // No data for this year, use zeros
          years.push({
            year,
            building: 0,
            features: 0,
            land: 0,
            cardTotal: 0,
            parcelTotal: yearRecord?.parcel_totals?.total_value || 0,
            isCurrent: i === 0,
            cardNumber: cardNumber,
            isCard1: cardNumber === 1,
          });
        }
      }

      return years;
    }

    // Fallback: Calculate from current data (for backward compatibility)
    console.warn(
      '🎯 Property Record Card - No assessment history, calculating from current data',
    );
    const years = [];

    // Create array for current year and 2 previous years
    for (let i = 0; i < 3; i++) {
      const year = currentYear - i;

      // LAND VALUE CALCULATION
      let landValue = 0;

      // Get base land value (only for Card 1)
      const baseLandValue =
        this.args.landAssessment?.assessment?.calculated_totals
          ?.totalAssessedValue ||
        this.args.landAssessment?.assessment?.land_value ||
        this.args.landAssessment?.assessment?.value ||
        0;

      if (cardNumber === 1) {
        // Card 1: Gets the full base land value
        landValue = baseLandValue;

        // Add card-specific view/waterfront values
        const cardLandFeatures =
          this.args.buildingAssessment?.assessment?.land?.calculated_totals;
        if (cardLandFeatures) {
          landValue +=
            (cardLandFeatures.cardViewValue || 0) +
            (cardLandFeatures.cardWaterfrontValue || 0);
        }
      } else {
        // Card 2+: Only gets card-specific view/waterfront values (no base land)
        const cardLandFeatures =
          this.args.buildingAssessment?.assessment?.land?.calculated_totals;
        if (cardLandFeatures) {
          landValue =
            (cardLandFeatures.cardViewValue || 0) +
            (cardLandFeatures.cardWaterfrontValue || 0);
        }
      }

      // BUILDING VALUE CALCULATION - Fixed fallback chain
      const buildingValue =
        this.args.buildingAssessment?.assessment?.calculated_totals
          ?.buildingValue ||
        this.args.buildingAssessment?.assessment?.calculated_totals
          ?.totalTaxableValue ||
        this.args.buildingAssessment?.assessment?.building_value ||
        this.args.buildingAssessment?.assessment?.assessed_value ||
        this.args.buildingAssessment?.assessment?.building?.value ||
        this.args.buildingAssessment?.assessment?.value ||
        this.args.buildingAssessment?.calculated_totals?.buildingValue ||
        this.args.buildingAssessment?.building_value ||
        0;

      console.log('🎯 Property Record Card - Building data:', {
        year,
        cardNumber,
        buildingValue,
        buildingAssessmentData: this.args.buildingAssessment?.assessment,
      });

      // FEATURES VALUE CALCULATION - Fixed fallback chain
      const featuresValue =
        this.args.propertyFeatures?.calculated_totals?.totalFeaturesValue ||
        this.args.propertyFeatures?.assessment?.calculated_totals
          ?.totalFeaturesValue ||
        this.args.buildingAssessment?.assessment?.other_improvements
          ?.calculated_totals?.totalFeaturesValue ||
        this.args.buildingAssessment?.assessment?.other_improvements?.value ||
        this.args.propertyFeatures?.features?.reduce((total, feature) => {
          return total + (feature.calculated_value || 0);
        }, 0) ||
        0;

      console.log('🎯 Property Record Card - Features data:', {
        year,
        cardNumber,
        featuresValue,
        featuresData: this.args.propertyFeatures,
      });

      const cardTotal = landValue + buildingValue + featuresValue;

      // For fallback calculation, use cardTotal as parcelTotal
      // (we don't have multi-card data in this path)
      const parcelTotal = cardTotal;

      console.log('🎯 Property Record Card - Calculated totals:', {
        year,
        cardNumber,
        landValue,
        buildingValue,
        featuresValue,
        cardTotal,
        parcelTotal,
        isCurrent: i === 0,
      });

      years.push({
        year,
        building: buildingValue,
        features: featuresValue,
        land: landValue,
        cardTotal: cardTotal,
        parcelTotal: parcelTotal,
        isCurrent: i === 0,
        cardNumber: cardNumber,
        isCard1: cardNumber === 1,
        landBreakdown:
          cardNumber === 1
            ? {
                baseLand: baseLandValue,
                viewValue:
                  this.args.buildingAssessment?.assessment?.land
                    ?.calculated_totals?.cardViewValue || 0,
                waterfrontValue:
                  this.args.buildingAssessment?.assessment?.land
                    ?.calculated_totals?.cardWaterfrontValue || 0,
              }
            : {
                baseLand: 0, // No base land value for cards 2+
                viewValue:
                  this.args.buildingAssessment?.assessment?.land
                    ?.calculated_totals?.cardViewValue || 0,
                waterfrontValue:
                  this.args.buildingAssessment?.assessment?.land
                    ?.calculated_totals?.cardWaterfrontValue || 0,
              },
      });
    }

    return years;
  }
}
