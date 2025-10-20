import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class DepreciationEditModalComponent extends Component {
  @service assessing;

  @tracked isLoading = false;
  @tracked isSaving = false;

  // Individual tracked properties for better reactivity
  @tracked yearBuilt = '';
  @tracked normalDescription = '';
  @tracked normalPercentage = 0;
  @tracked physicalNotes = '';
  @tracked physicalPercentage = 0;
  @tracked functionalNotes = '';
  @tracked functionalPercentage = 0;
  @tracked economicNotes = '';
  @tracked economicPercentage = 0;
  @tracked temporaryNotes = '';
  @tracked temporaryPercentage = 0;

  constructor() {
    super(...arguments);
    // Initialize local depreciation data from args
    console.log(
      '🔧 Depreciation modal initialized with buildingAssessment:',
      this.args.buildingAssessment,
    );
    console.log(
      '🔧 Full buildingAssessment.depreciation object:',
      JSON.stringify(this.args.buildingAssessment?.depreciation, null, 2),
    );
    if (this.args.buildingAssessment) {
      // Get current normal depreciation percentage (stored as percentage, convert to decimal for internal calculation)
      const storedNormalPercentage =
        this.args.buildingAssessment.depreciation?.normal?.percentage;
      let initialNormalPercentage;

      if (
        storedNormalPercentage !== null &&
        storedNormalPercentage !== undefined
      ) {
        // Convert percentage to decimal (30 becomes 0.3)
        initialNormalPercentage =
          storedNormalPercentage > 1
            ? storedNormalPercentage / 100
            : storedNormalPercentage;
      } else {
        // Calculate if no stored value (synchronous calculation)
        initialNormalPercentage = this.calculateNormalDepreciation(
          this.args.buildingAssessment.year_built || '',
          this.args.buildingAssessment.depreciation?.normal?.description || '',
        );
      }

      // Helper function to handle percentage conversion (stored values might be decimal or percentage)
      const convertToDecimal = (value) => {
        if (value === null || value === undefined) return 0;
        return value > 1 ? value / 100 : value;
      };

      // Set individual tracked properties
      this.yearBuilt = this.args.buildingAssessment.year_built || '';
      this.normalDescription =
        this.args.buildingAssessment.depreciation?.normal?.description || '';
      this.normalPercentage = initialNormalPercentage;
      this.physicalNotes =
        this.args.buildingAssessment.depreciation?.physical?.notes || '';
      this.physicalPercentage = convertToDecimal(
        this.args.buildingAssessment.depreciation?.physical?.percentage,
      );
      this.functionalNotes =
        this.args.buildingAssessment.depreciation?.functional?.notes || '';
      this.functionalPercentage = convertToDecimal(
        this.args.buildingAssessment.depreciation?.functional?.percentage,
      );
      this.economicNotes =
        this.args.buildingAssessment.depreciation?.economic?.notes || '';
      this.economicPercentage = convertToDecimal(
        this.args.buildingAssessment.depreciation?.economic?.percentage,
      );
      this.temporaryNotes =
        this.args.buildingAssessment.depreciation?.temporary?.notes || '';
      this.temporaryPercentage = convertToDecimal(
        this.args.buildingAssessment.depreciation?.temporary?.percentage,
      );
    } else {
      // Initialize with empty data if no building assessment exists
      this.yearBuilt = '';
      this.normalDescription = '';
      this.normalPercentage = this.calculateNormalDepreciation('', '');
      this.physicalNotes = '';
      this.physicalPercentage = 0;
      this.functionalNotes = '';
      this.functionalPercentage = 0;
      this.economicNotes = '';
      this.economicPercentage = 0;
      this.temporaryNotes = '';
      this.temporaryPercentage = 0;
    }

    console.log('🔧 Individual tracked properties initialized:', {
      yearBuilt: this.yearBuilt,
      normalDescription: this.normalDescription,
      normalPercentage: this.normalPercentage,
    });
  }

  @action
  close() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  updateCondition(event) {
    const value = event.target.value;
    console.log('🔧 Condition update:', {
      value,
      oldValue: this.normalDescription,
    });

    // Update the tracked property directly
    this.normalDescription = value;

    console.log(
      '🔧 Triggering depreciation recalculation for condition change',
    );
    this.updateNormalDepreciation();
  }

  @action
  updateField(fieldName, event) {
    const value = event.target.value;
    console.log('🔧 Field update:', {
      fieldName,
      value,
      oldValue: this[fieldName],
    });

    // Update the tracked property directly
    this[fieldName] = value;

    // If year built changed, recalculate normal depreciation percentage
    if (fieldName === 'yearBuilt') {
      console.log(
        '🔧 Triggering depreciation recalculation for field:',
        fieldName,
      );
      this.updateNormalDepreciation();
    }
  }

  @action
  updatePercentageField(fieldName, event) {
    const percentageValue = parseFloat(event.target.value) || 0;
    // Convert percentage input (30) to decimal (0.3) for internal storage
    const decimalValue = percentageValue / 100;

    console.log('🔧 Percentage field update:', {
      fieldName,
      percentageValue,
      decimalValue,
    });

    // Update the tracked property directly
    this[fieldName] = decimalValue;
  }

  calculateNormalDepreciation(yearBuilt, condition) {
    // Calculate building age
    const yearBuiltNum = parseInt(yearBuilt);
    const assessmentYear =
      this.args.property?.municipality?.assessment_year ||
      new Date().getFullYear();

    // If no valid year built, return 0 (can't calculate age-based depreciation)
    if (!yearBuiltNum || isNaN(yearBuiltNum) || yearBuiltNum <= 0) {
      console.log(
        '🔧 No valid year built provided, cannot calculate depreciation',
      );
      return 0;
    }

    const buildingAge = Math.max(0, assessmentYear - yearBuiltNum);

    console.log('🔧 Depreciation calculation inputs:', {
      yearBuilt,
      yearBuiltNum,
      assessmentYear,
      buildingAge,
      condition,
      propertyData: this.args.property,
      buildingAssessment: this.args.buildingAssessment,
    });

    // Use same condition factors as backend
    const conditionFactors = {
      Excellent: 1,
      'Very Good': 1.5,
      Good: 2,
      Average: 2.5,
      Fair: 3,
      Poor: 3.5,
      'Very Poor': 4,
    };

    const conditionFactor = conditionFactors[condition || 'Average'] || 2.5;

    // Try to get building-specific depreciation rate from building assessment
    let baseDepreciationRate = 0.02; // Default fallback (2%)

    // Get the depreciation rate from the building code if available
    if (
      this.args.buildingAssessment?.building_code_id ||
      this.args.buildingAssessment?.base_type
    ) {
      try {
        // Look up building codes to find the specific depreciation rate
        const buildingCodes = this.args.property?.buildingCodes;
        if (buildingCodes && Array.isArray(buildingCodes)) {
          const matchingCode = buildingCodes.find(
            (code) => code.code === this.args.buildingAssessment?.base_type,
          );
          if (matchingCode && matchingCode.depreciation) {
            baseDepreciationRate = matchingCode.depreciation / 100; // Convert percentage to decimal
          }
        }
      } catch (error) {
        console.log(
          'Could not lookup building code depreciation, using default 2%',
        );
      }
    }

    // Use same formula as backend: √(building age) × condition factor × base rate depreciation
    const sqrtAge = Math.sqrt(buildingAge);
    const normalDepreciation = sqrtAge * conditionFactor * baseDepreciationRate;

    console.log('🔧 Frontend normal depreciation calculation:', {
      buildingAge,
      sqrtAge,
      baseDepreciationRate,
      condition,
      conditionFactor,
      formula: '√(age) × condition × base_rate',
      calculation: `√(${buildingAge}) × ${conditionFactor} × ${baseDepreciationRate}`,
      normalDepreciation,
    });

    // Round to 5 decimal places
    return Math.round(normalDepreciation * 100000) / 100000;
  }

  async updateNormalDepreciation() {
    console.log('🔧 updateNormalDepreciation called with:', {
      yearBuilt: this.yearBuilt,
      condition: this.normalDescription,
    });

    const normalPercentage = this.calculateNormalDepreciation(
      this.yearBuilt,
      this.normalDescription,
    );

    console.log('🔧 New normal percentage calculated:', normalPercentage);

    // Update the tracked property directly
    this.normalPercentage = normalPercentage;
  }

  @action
  async save() {
    if (this.isSaving) return;

    this.isSaving = true;

    try {
      console.log('Saving depreciation data from tracked properties:', {
        yearBuilt: this.yearBuilt,
        normalDescription: this.normalDescription,
        normalPercentage: this.normalPercentage,
      });

      // Get property ID from args
      const propertyId = this.args.property?.id;
      if (!propertyId) {
        throw new Error('Property ID is required to save depreciation data');
      }

      // Convert individual tracked properties to API format and format text fields
      const apiData = {
        year_built: this.yearBuilt,
        depreciation: {
          normal: {
            description: this.normalDescription?.toUpperCase() || '',
            percentage: this.normalPercentage * 100, // Send calculated percentage to backend
          },
          physical: {
            notes: this.physicalNotes?.toUpperCase() || '',
            percentage: this.physicalPercentage * 100, // Convert decimal to percentage for API
          },
          functional: {
            notes: this.functionalNotes?.toUpperCase() || '',
            percentage: this.functionalPercentage * 100, // Convert decimal to percentage for API
          },
          economic: {
            notes: this.economicNotes?.toUpperCase() || '',
            percentage: this.economicPercentage * 100, // Convert decimal to percentage for API
          },
          temporary: {
            notes: this.temporaryNotes?.toUpperCase() || '',
            percentage: this.temporaryPercentage * 100, // Convert decimal to percentage for API
          },
        },
      };

      console.log('API data being sent:', apiData);

      // Get current card number to ensure we're updating the correct card
      const cardNumber = this.args.property?.current_card || 1;

      // Use assessing service to update building assessment
      const response = await this.assessing.updateBuildingAssessment(
        propertyId,
        cardNumber,
        apiData,
      );

      console.log('Depreciation data saved successfully:', response);

      // Update the buildingAssessment args to show the latest data
      if (response.assessment) {
        Object.assign(this.args.buildingAssessment, response.assessment);
      }

      // Call the onSave callback if provided (for refreshing data)
      if (this.args.onSave) {
        console.log('Calling onSave callback to refresh data...');
        await this.args.onSave();
        console.log('onSave callback completed');
      } else {
        console.warn('No onSave callback provided');
      }

      // Close modal on successful save
      this.close();
    } catch (error) {
      console.error('Error saving depreciation data:', error);
      // Keep modal open on error so user can retry
    } finally {
      this.isSaving = false;
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
