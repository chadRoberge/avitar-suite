import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class BuildingDetailsController extends Controller {
  @service api;

  // Building rate code tracking
  @tracked isAddingBuildingCode = false;
  @tracked isEditingBuildingCode = false;
  @tracked editingBuildingCode = null;
  @tracked newBuildingDescription = '';
  @tracked newBuildingCode = '';
  @tracked newBuildingRate = '';
  @tracked newBuildingType = '';
  @tracked newSizeAdjustmentCategory = '';
  @tracked newBuildingDepreciation = '';

  // Update counter for reactivity
  @tracked buildingCodeUpdateCounter = 0;

  // Building types available
  buildingTypes = [
    { value: 'residential', label: 'Residential' },
    { value: 'commercial', label: 'Commercial' },
    { value: 'exempt', label: 'Exempt' },
    { value: 'manufactured', label: 'Manufactured' },
    { value: 'industrial', label: 'Industrial' },
    { value: 'utility', label: 'Utility' },
  ];

  // Feature types available
  featureTypes = [
    { value: 'interior_wall', label: 'Interior Wall' },
    { value: 'exterior_wall', label: 'Exterior Wall' },
    { value: 'roofing', label: 'Roofing' },
    { value: 'roof_style', label: 'Roof Style' },
    { value: 'flooring', label: 'Flooring' },
    { value: 'heating_fuel', label: 'Heating Fuel' },
    { value: 'heating_type', label: 'Heating Type' },
    { value: 'quality', label: 'Quality' },
    { value: 'story_height', label: 'Story Height' },
    { value: 'frame', label: 'Frame' },
  ];

  // Feature code tracking
  @tracked isAddingFeatureCode = false;
  @tracked isEditingFeatureCode = false;
  @tracked editingFeatureCode = null;
  @tracked newFeatureType = '';
  @tracked newFeatureDescription = '';
  @tracked newFeatureDisplayText = '';
  @tracked newFeaturePoints = '';

  // Sub area factor tracking
  @tracked isAddingSubAreaFactor = false;
  @tracked isEditingSubAreaFactor = false;
  @tracked editingSubAreaFactor = null;
  @tracked newSubAreaDescription = '';
  @tracked newSubAreaDisplayText = '';
  @tracked newSubAreaPoints = '';
  @tracked newSubAreaLivingSpace = '';

  // Update counters for reactivity
  @tracked featureCodeUpdateCounter = 0;
  @tracked subAreaFactorUpdateCounter = 0;

  // Guidelines modal tracking
  @tracked showGuidelinesModal = false;

  // Miscellaneous points tracking
  @tracked airConditioningPoints = '';
  @tracked extraKitchenPoints = '';
  @tracked generatorPoints = '';

  // Building calculation configuration tracking
  @tracked calculationConfig = {
    base: 5,
    perBedroom: 3,
    perFullBath: 2,
    perHalfBath: 0.8,
    pointMultiplier: 1.0,
    baseRate: 100,
  };

  // Mass recalculation tracking
  @tracked recalculationStatus = null;
  @tracked isRecalculating = false;
  @tracked recalculationResult = null;
  @tracked massRecalcYear = new Date().getFullYear();
  @tracked massRecalcBatchSize = 50;

  // Economies of scale tracking
  @tracked buildingTypeStats = {};
  @tracked economiesOfScale = {
    residential: {
      median_size: 1800,
      smallest_size: 100,
      smallest_factor: 3.0,
      largest_size: 15000,
      largest_factor: 0.75,
    },
    commercial: {
      median_size: 5000,
      smallest_size: 500,
      smallest_factor: 2.5,
      largest_size: 50000,
      largest_factor: 0.8,
    },
    industrial: {
      median_size: 10000,
      smallest_size: 1000,
      smallest_factor: 2.0,
      largest_size: 100000,
      largest_factor: 0.85,
    },
    manufactured: {
      median_size: 1200,
      smallest_size: 50,
      smallest_factor: 4.0,
      largest_size: 3000,
      largest_factor: 0.7,
    },
  };
  @tracked isSavingEconomies = false;
  @tracked economiesSaveStatus = null;

  // Computed property for reactive building codes
  get reactiveBuildingCodes() {
    this.buildingCodeUpdateCounter;
    return this.model?.buildingCodes || [];
  }

  // Computed property for reactive feature codes
  get reactiveFeatureCodes() {
    this.featureCodeUpdateCounter;
    return this.model?.buildingFeatureCodes || [];
  }

  // Computed property for reactive sub area factors
  get reactiveSubAreaFactors() {
    this.subAreaFactorUpdateCounter;
    return this.model?.sketchSubAreaFactors || [];
  }

  // Computed properties for each feature type
  get interiorWallCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'interior_wall',
    );
  }

  get exteriorWallCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'exterior_wall',
    );
  }

  get roofingCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'roofing',
    );
  }

  get roofStyleCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'roof_style',
    );
  }

  get flooringCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'flooring',
    );
  }

  get heatingFuelCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'heating_fuel',
    );
  }

  get heatingTypeCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'heating_type',
    );
  }

  get qualityCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'quality',
    );
  }

  get storyHeightCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'story_height',
    );
  }

  get frameCodes() {
    return this.reactiveFeatureCodes.filter(
      (code) => code.featureType === 'frame',
    );
  }

  // Building code actions
  @action
  startAddingBuildingCode() {
    this.isAddingBuildingCode = true;
    this.isEditingBuildingCode = false;
    this.editingBuildingCode = null;
    this.newBuildingDescription = '';
    this.newBuildingCode = '';
    this.newBuildingRate = '';
    this.newBuildingType = '';
    this.newSizeAdjustmentCategory = '';
    this.newBuildingDepreciation = '';
  }

  @action
  cancelAddingBuildingCode() {
    this.isAddingBuildingCode = false;
    this.newBuildingDescription = '';
    this.newBuildingCode = '';
    this.newBuildingRate = '';
    this.newBuildingType = '';
    this.newSizeAdjustmentCategory = '';
    this.newBuildingDepreciation = '';
  }

  @action
  startEditingBuildingCode(buildingCode) {
    console.log('Editing building code:', buildingCode);
    this.isEditingBuildingCode = true;
    this.isAddingBuildingCode = false;
    this.editingBuildingCode = buildingCode;
    this.newBuildingDescription = buildingCode.description;
    this.newBuildingCode = buildingCode.code;
    this.newBuildingRate = buildingCode.rate.toString();
    this.newBuildingDepreciation = buildingCode.depreciation
      ? buildingCode.depreciation.toString()
      : '';

    // Set building type and size adjustment with slight delay to ensure DOM updates
    setTimeout(() => {
      this.newBuildingType = buildingCode.buildingType;
      this.newSizeAdjustmentCategory = buildingCode.sizeAdjustmentCategory;
      console.log('Set buildingType to:', this.newBuildingType);
      console.log(
        'Set sizeAdjustmentCategory to:',
        this.newSizeAdjustmentCategory,
      );
    }, 10);
  }

  @action
  cancelEditingBuildingCode() {
    this.isEditingBuildingCode = false;
    this.editingBuildingCode = null;
    this.newBuildingDescription = '';
    this.newBuildingCode = '';
    this.newBuildingRate = '';
    this.newBuildingType = '';
    this.newSizeAdjustmentCategory = '';
    this.newBuildingDepreciation = '';
  }

  @action
  updateBuildingDescription(event) {
    this.newBuildingDescription = event.target.value;
  }

  @action
  updateBuildingCode(event) {
    // Limit to 3 characters and uppercase
    const value = event.target.value.toUpperCase().slice(0, 3);
    this.newBuildingCode = value;
    event.target.value = value;
  }

  @action
  updateBuildingRate(event) {
    this.newBuildingRate = event.target.value;
  }

  @action
  updateBuildingType(event) {
    this.newBuildingType = event.target.value;
    // Auto-set size adjustment category to match building type
    this.newSizeAdjustmentCategory = event.target.value;
  }

  @action
  updateSizeAdjustmentCategory(event) {
    this.newSizeAdjustmentCategory = event.target.value;
  }

  @action
  updateBuildingDepreciation(event) {
    this.newBuildingDepreciation = event.target.value;
  }

  @action
  async saveBuildingCode() {
    try {
      const municipalityId = this.model.municipality.id;
      const codeData = {
        description: this.newBuildingDescription.trim(),
        code: this.newBuildingCode.trim(),
        rate: parseFloat(this.newBuildingRate),
        buildingType: this.newBuildingType,
        sizeAdjustmentCategory: this.newSizeAdjustmentCategory,
        depreciation: parseFloat(this.newBuildingDepreciation),
      };

      // Validate
      if (
        !codeData.description ||
        !codeData.code ||
        codeData.code.length !== 3 ||
        !codeData.buildingType ||
        !codeData.sizeAdjustmentCategory ||
        isNaN(codeData.rate) ||
        codeData.rate < 0 ||
        isNaN(codeData.depreciation) ||
        codeData.depreciation < 0 ||
        codeData.depreciation > 100
      ) {
        alert(
          'Please fill in all fields. Code must be exactly 3 characters. Rate and depreciation must be valid numbers.',
        );
        return;
      }

      // Debug logging
      console.log('Saving building code data:', codeData);

      let savedCode;
      if (this.isEditingBuildingCode && this.editingBuildingCode) {
        // Update existing building code
        const response = await this.api.put(
          `/municipalities/${municipalityId}/building-codes/${this.editingBuildingCode._id || this.editingBuildingCode.id}`,
          codeData,
        );
        savedCode = response.buildingCode;

        // Update in local model
        const codeIndex = this.model.buildingCodes.findIndex(
          (c) =>
            (c._id || c.id) ===
            (this.editingBuildingCode._id || this.editingBuildingCode.id),
        );
        if (codeIndex !== -1) {
          this.model.buildingCodes[codeIndex] = savedCode;
          this.model.buildingCodes = [...this.model.buildingCodes];
        }
      } else {
        // Create new building code
        const response = await this.api.post(
          `/municipalities/${municipalityId}/building-codes`,
          codeData,
        );
        savedCode = response.buildingCode;

        // Add to local model
        if (!this.model.buildingCodes) {
          this.model.buildingCodes = [];
        }
        this.model.buildingCodes.push(savedCode);
        this.model.buildingCodes = [...this.model.buildingCodes];
      }

      this.model = { ...this.model };

      // Force reactivity
      this.buildingCodeUpdateCounter++;

      if (this.isEditingBuildingCode) {
        this.cancelEditingBuildingCode();
      } else {
        this.cancelAddingBuildingCode();
      }
    } catch (error) {
      console.error('Error saving building code:', error);
      alert('Error saving building code. Please try again.');
    }
  }

  @action
  async deleteBuildingCode(buildingCode) {
    if (confirm('Are you sure you want to delete this building code?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/building-codes/${buildingCode._id || buildingCode.id}`,
        );

        // Remove from local model
        const codeIndex = this.model.buildingCodes.findIndex(
          (c) => (c._id || c.id) === (buildingCode._id || buildingCode.id),
        );
        if (codeIndex !== -1) {
          this.model.buildingCodes.splice(codeIndex, 1);
          this.model.buildingCodes = [...this.model.buildingCodes];
          this.model = { ...this.model };

          // Force reactivity
          this.buildingCodeUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting building code:', error);
        alert('Error deleting building code. Please try again.');
      }
    }
  }

  // Feature code actions
  @action
  startAddingFeatureCode() {
    this.isAddingFeatureCode = true;
    this.isEditingFeatureCode = false;
    this.editingFeatureCode = null;
    this.newFeatureType = '';
    this.newFeatureDescription = '';
    this.newFeatureDisplayText = '';
    this.newFeaturePoints = '';
  }

  @action
  startAddingFeatureCodeForType(featureType) {
    this.isAddingFeatureCode = true;
    this.isEditingFeatureCode = false;
    this.editingFeatureCode = null;
    this.newFeatureType = featureType;
    this.newFeatureDescription = '';
    this.newFeatureDisplayText = '';
    this.newFeaturePoints = '';
  }

  @action
  cancelAddingFeatureCode() {
    this.isAddingFeatureCode = false;
    this.newFeatureType = '';
    this.newFeatureDescription = '';
    this.newFeatureDisplayText = '';
    this.newFeaturePoints = '';
  }

  @action
  startEditingFeatureCode(featureCode) {
    this.isEditingFeatureCode = true;
    this.isAddingFeatureCode = false;
    this.editingFeatureCode = featureCode;
    this.newFeatureType = featureCode.featureType;
    this.newFeatureDescription = featureCode.description;
    this.newFeatureDisplayText = featureCode.displayText;
    this.newFeaturePoints = featureCode.points.toString();
  }

  @action
  cancelEditingFeatureCode() {
    this.isEditingFeatureCode = false;
    this.editingFeatureCode = null;
    this.newFeatureType = '';
    this.newFeatureDescription = '';
    this.newFeatureDisplayText = '';
    this.newFeaturePoints = '';
  }

  @action
  updateFeatureType(event) {
    this.newFeatureType = event.target.value;
  }

  @action
  updateFeatureDescription(event) {
    this.newFeatureDescription = event.target.value;
  }

  @action
  updateFeatureDisplayText(event) {
    const value = event.target.value.slice(0, 15);
    this.newFeatureDisplayText = value;
    event.target.value = value;
  }

  @action
  updateFeaturePoints(event) {
    this.newFeaturePoints = event.target.value;
  }

  @action
  async saveFeatureCode() {
    try {
      const municipalityId = this.model.municipality.id;
      const codeData = {
        description: this.newFeatureDescription.trim(),
        displayText: this.newFeatureDisplayText.trim(),
        points: parseInt(this.newFeaturePoints, 10),
        featureType: this.newFeatureType,
      };

      // Validate
      if (
        !codeData.description ||
        !codeData.displayText ||
        !codeData.featureType ||
        isNaN(codeData.points) ||
        codeData.points < -1000 ||
        codeData.points > 1000
      ) {
        alert(
          'Please fill in all fields. Points must be between -1000 and 1000.',
        );
        return;
      }

      let savedCode;
      if (this.isEditingFeatureCode && this.editingFeatureCode) {
        // Update existing feature code
        const response = await this.api.put(
          `/municipalities/${municipalityId}/building-feature-codes/${this.editingFeatureCode._id || this.editingFeatureCode.id}`,
          codeData,
        );
        savedCode = response.buildingFeatureCode;

        // Update in local model
        const codeIndex = this.model.buildingFeatureCodes.findIndex(
          (c) =>
            (c._id || c.id) ===
            (this.editingFeatureCode._id || this.editingFeatureCode.id),
        );
        if (codeIndex !== -1) {
          this.model.buildingFeatureCodes[codeIndex] = savedCode;
          this.model.buildingFeatureCodes = [
            ...this.model.buildingFeatureCodes,
          ];
        }
      } else {
        // Create new feature code
        const response = await this.api.post(
          `/municipalities/${municipalityId}/building-feature-codes`,
          codeData,
        );
        savedCode = response.buildingFeatureCode;

        // Add to local model
        if (!this.model.buildingFeatureCodes) {
          this.model.buildingFeatureCodes = [];
        }
        this.model.buildingFeatureCodes.push(savedCode);
        this.model.buildingFeatureCodes = [...this.model.buildingFeatureCodes];
      }

      this.model = { ...this.model };

      // Force reactivity
      this.featureCodeUpdateCounter++;

      if (this.isEditingFeatureCode) {
        this.cancelEditingFeatureCode();
      } else {
        this.cancelAddingFeatureCode();
      }
    } catch (error) {
      console.error('Error saving feature code:', error);

      // Try to extract more specific error message from API response
      let errorMessage = 'Error saving feature code. Please try again.';

      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.errors?.length > 0) {
        errorMessage = error.response.data.errors.map((e) => e.msg).join(', ');
      }

      alert(errorMessage);
    }
  }

  @action
  async deleteFeatureCode(featureCode) {
    if (confirm('Are you sure you want to delete this feature code?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/building-feature-codes/${featureCode._id || featureCode.id}`,
        );

        // Remove from local model
        const codeIndex = this.model.buildingFeatureCodes.findIndex(
          (c) => (c._id || c.id) === (featureCode._id || featureCode.id),
        );
        if (codeIndex !== -1) {
          this.model.buildingFeatureCodes.splice(codeIndex, 1);
          this.model.buildingFeatureCodes = [
            ...this.model.buildingFeatureCodes,
          ];
          this.model = { ...this.model };

          // Force reactivity
          this.featureCodeUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting feature code:', error);
        alert('Error deleting feature code. Please try again.');
      }
    }
  }

  // Sub area factor actions
  @action
  startAddingSubAreaFactor() {
    this.isAddingSubAreaFactor = true;
    this.isEditingSubAreaFactor = false;
    this.editingSubAreaFactor = null;
    this.newSubAreaDescription = '';
    this.newSubAreaDisplayText = '';
    this.newSubAreaPoints = '';
    this.newSubAreaLivingSpace = '';
  }

  @action
  cancelAddingSubAreaFactor() {
    this.isAddingSubAreaFactor = false;
    this.newSubAreaDescription = '';
    this.newSubAreaDisplayText = '';
    this.newSubAreaPoints = '';
    this.newSubAreaLivingSpace = '';
  }

  @action
  startEditingSubAreaFactor(subAreaFactor) {
    this.isEditingSubAreaFactor = true;
    this.isAddingSubAreaFactor = false;
    this.editingSubAreaFactor = subAreaFactor;
    this.newSubAreaDescription = subAreaFactor.description;
    this.newSubAreaDisplayText = subAreaFactor.displayText;
    this.newSubAreaPoints = subAreaFactor.points.toString();
    this.newSubAreaLivingSpace = subAreaFactor.livingSpace.toString();
  }

  @action
  cancelEditingSubAreaFactor() {
    this.isEditingSubAreaFactor = false;
    this.editingSubAreaFactor = null;
    this.newSubAreaDescription = '';
    this.newSubAreaDisplayText = '';
    this.newSubAreaPoints = '';
    this.newSubAreaLivingSpace = '';
  }

  @action
  updateSubAreaDescription(event) {
    this.newSubAreaDescription = event.target.value;
  }

  @action
  updateSubAreaDisplayText(event) {
    const value = event.target.value.slice(0, 15);
    this.newSubAreaDisplayText = value;
    event.target.value = value;
  }

  @action
  updateSubAreaPoints(event) {
    this.newSubAreaPoints = event.target.value;
  }

  @action
  updateSubAreaLivingSpace(event) {
    this.newSubAreaLivingSpace = event.target.value;
  }

  @action
  async saveSubAreaFactor() {
    try {
      const municipalityId = this.model.municipality.id;
      const factorData = {
        description: this.newSubAreaDescription.trim(),
        displayText: this.newSubAreaDisplayText.trim(),
        points: parseInt(this.newSubAreaPoints, 10),
        livingSpace: this.newSubAreaLivingSpace === 'true',
      };

      // Validate
      if (
        !factorData.description ||
        !factorData.displayText ||
        isNaN(factorData.points) ||
        factorData.points < -1000 ||
        factorData.points > 1000 ||
        this.newSubAreaLivingSpace === ''
      ) {
        alert(
          'Please fill in all fields. Points must be between -1000 and 1000.',
        );
        return;
      }

      let savedFactor;
      if (this.isEditingSubAreaFactor && this.editingSubAreaFactor) {
        // Update existing sub area factor
        const response = await this.api.put(
          `/municipalities/${municipalityId}/sketch-sub-area-factors/${this.editingSubAreaFactor._id || this.editingSubAreaFactor.id}`,
          factorData,
        );
        savedFactor = response.sketchSubAreaFactor;

        // Update in local model
        const factorIndex = this.model.sketchSubAreaFactors.findIndex(
          (f) =>
            (f._id || f.id) ===
            (this.editingSubAreaFactor._id || this.editingSubAreaFactor.id),
        );
        if (factorIndex !== -1) {
          this.model.sketchSubAreaFactors[factorIndex] = savedFactor;
          this.model.sketchSubAreaFactors = [
            ...this.model.sketchSubAreaFactors,
          ];
        }
      } else {
        // Create new sub area factor
        const response = await this.api.post(
          `/municipalities/${municipalityId}/sketch-sub-area-factors`,
          factorData,
        );
        savedFactor = response.sketchSubAreaFactor;

        // Add to local model
        if (!this.model.sketchSubAreaFactors) {
          this.model.sketchSubAreaFactors = [];
        }
        this.model.sketchSubAreaFactors.push(savedFactor);
        this.model.sketchSubAreaFactors = [...this.model.sketchSubAreaFactors];
      }

      this.model = { ...this.model };

      // Force reactivity
      this.subAreaFactorUpdateCounter++;

      if (this.isEditingSubAreaFactor) {
        this.cancelEditingSubAreaFactor();
      } else {
        this.cancelAddingSubAreaFactor();
      }
    } catch (error) {
      console.error('Error saving sub area factor:', error);
      alert('Error saving sub area factor. Please try again.');
    }
  }

  @action
  async deleteSubAreaFactor(subAreaFactor) {
    if (confirm('Are you sure you want to delete this sub area factor?')) {
      try {
        const municipalityId = this.model.municipality.id;
        await this.api.delete(
          `/municipalities/${municipalityId}/sketch-sub-area-factors/${subAreaFactor._id || subAreaFactor.id}`,
        );

        // Remove from local model
        const factorIndex = this.model.sketchSubAreaFactors.findIndex(
          (f) => (f._id || f.id) === (subAreaFactor._id || subAreaFactor.id),
        );
        if (factorIndex !== -1) {
          this.model.sketchSubAreaFactors.splice(factorIndex, 1);
          this.model.sketchSubAreaFactors = [
            ...this.model.sketchSubAreaFactors,
          ];
          this.model = { ...this.model };

          // Force reactivity
          this.subAreaFactorUpdateCounter++;
        }
      } catch (error) {
        console.error('Error deleting sub area factor:', error);
        alert('Error deleting sub area factor. Please try again.');
      }
    }
  }

  // Guidelines modal actions
  @action
  showGuidelines() {
    this.showGuidelinesModal = true;
  }

  @action
  hideGuidelines() {
    this.showGuidelinesModal = false;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  // Miscellaneous points actions
  @action
  updateAirConditioningPoints(event) {
    this.airConditioningPoints = event.target.value;
  }

  @action
  updateExtraKitchenPoints(event) {
    this.extraKitchenPoints = event.target.value;
  }

  @action
  updateGeneratorPoints(event) {
    this.generatorPoints = event.target.value;
  }

  @action
  async saveMiscellaneousPoints() {
    try {
      const municipalityId = this.model.municipality.id;
      const pointsData = {
        airConditioningPoints: parseInt(this.airConditioningPoints, 10) || 0,
        extraKitchenPoints: parseInt(this.extraKitchenPoints, 10) || 0,
        generatorPoints: parseInt(this.generatorPoints, 10) || 0,
      };

      // Validate points are within range
      if (
        pointsData.airConditioningPoints < -1000 ||
        pointsData.airConditioningPoints > 1000 ||
        pointsData.extraKitchenPoints < -1000 ||
        pointsData.extraKitchenPoints > 1000 ||
        pointsData.generatorPoints < -1000 ||
        pointsData.generatorPoints > 1000
      ) {
        alert('All points must be between -1000 and 1000.');
        return;
      }

      // Save to API endpoint (you may need to create this endpoint)
      await this.api.put(
        `/municipalities/${municipalityId}/building-miscellaneous-points`,
        pointsData,
      );

      // Update local model if it exists
      if (this.model.miscellaneousPoints) {
        Object.assign(this.model.miscellaneousPoints, pointsData);
      } else {
        this.model.miscellaneousPoints = pointsData;
      }

      alert('Miscellaneous points saved successfully!');
    } catch (error) {
      console.error('Error saving miscellaneous points:', error);
      alert('Error saving miscellaneous points. Please try again.');
    }
  }

  // Building calculation configuration actions
  @action
  updateCalculationBase(event) {
    this.calculationConfig = {
      ...this.calculationConfig,
      base: parseFloat(event.target.value) || 0,
    };
  }

  @action
  updateCalculationPerBedroom(event) {
    this.calculationConfig = {
      ...this.calculationConfig,
      perBedroom: parseFloat(event.target.value) || 0,
    };
  }

  @action
  updateCalculationPerFullBath(event) {
    this.calculationConfig = {
      ...this.calculationConfig,
      perFullBath: parseFloat(event.target.value) || 0,
    };
  }

  @action
  updateCalculationPerHalfBath(event) {
    this.calculationConfig = {
      ...this.calculationConfig,
      perHalfBath: parseFloat(event.target.value) || 0,
    };
  }

  @action
  updateCalculationPointMultiplier(event) {
    this.calculationConfig = {
      ...this.calculationConfig,
      pointMultiplier: parseFloat(event.target.value) || 0,
    };
  }

  @action
  updateCalculationBaseRate(event) {
    this.calculationConfig = {
      ...this.calculationConfig,
      baseRate: parseFloat(event.target.value) || 0,
    };
  }

  @action
  async saveCalculationSettings() {
    try {
      const municipalityId = this.model.municipality.id;

      // Validate all values are within reasonable ranges
      if (
        this.calculationConfig.base < 0 ||
        this.calculationConfig.base > 100 ||
        this.calculationConfig.perBedroom < 0 ||
        this.calculationConfig.perBedroom > 100 ||
        this.calculationConfig.perFullBath < 0 ||
        this.calculationConfig.perFullBath > 100 ||
        this.calculationConfig.perHalfBath < 0 ||
        this.calculationConfig.perHalfBath > 100 ||
        this.calculationConfig.pointMultiplier < 0 ||
        this.calculationConfig.pointMultiplier > 10 ||
        this.calculationConfig.baseRate < 0 ||
        this.calculationConfig.baseRate > 1000
      ) {
        alert('Please ensure all values are within valid ranges.');
        return;
      }

      const configData = {
        bedroom_bath_config: {
          base: this.calculationConfig.base,
          perBedroom: this.calculationConfig.perBedroom,
          perFullBath: this.calculationConfig.perFullBath,
          perHalfBath: this.calculationConfig.perHalfBath,
        },
        calculation_factors: {
          pointMultiplier: this.calculationConfig.pointMultiplier,
          baseRate: this.calculationConfig.baseRate,
        },
      };

      const response = await this.api.patch(
        `/municipalities/${municipalityId}/building-calculation-config`,
        configData,
      );

      // Update local model
      if (this.model.buildingCalculationConfig) {
        Object.assign(this.model.buildingCalculationConfig, response.config);
      } else {
        this.model.buildingCalculationConfig = response.config;
      }

      alert('Building calculation settings saved successfully!');
    } catch (error) {
      console.error('Error saving calculation settings:', error);
      alert('Error saving calculation settings. Please try again.');
    }
  }

  @action
  resetCalculationSettings() {
    this.calculationConfig = {
      base: 5,
      perBedroom: 3,
      perFullBath: 2,
      perHalfBath: 0.8,
      pointMultiplier: 1.0,
      baseRate: 100,
    };
  }

  // Mass recalculation actions
  @action
  updateMassRecalcYear(event) {
    this.massRecalcYear =
      parseInt(event.target.value) || new Date().getFullYear();
  }

  @action
  updateMassRecalcBatchSize(event) {
    this.massRecalcBatchSize = parseInt(event.target.value) || 50;
  }

  @action
  async refreshRecalculationStatus() {
    try {
      const municipalityId = this.model.municipality.id;
      const response = await this.api.get(
        `/municipalities/${municipalityId}/building-assessments/recalculation-status?year=${this.massRecalcYear}`,
      );

      this.recalculationStatus = response.status;
    } catch (error) {
      console.error('Error fetching recalculation status:', error);
      alert('Error fetching recalculation status. Please try again.');
    }
  }

  @action
  async startMassRecalculation() {
    if (
      !confirm(
        'This will recalculate all building assessments. This may take several minutes. Continue?',
      )
    ) {
      return;
    }

    try {
      this.isRecalculating = true;
      this.recalculationResult = null;

      const municipalityId = this.model.municipality.id;
      const response = await this.api.post(
        `/municipalities/${municipalityId}/building-assessments/mass-recalculate`,
        {
          year: this.massRecalcYear,
          batchSize: this.massRecalcBatchSize,
        },
      );

      this.recalculationResult = response;

      // Refresh status after completion
      await this.refreshRecalculationStatus();
    } catch (error) {
      console.error('Error during mass recalculation:', error);
      this.recalculationResult = {
        success: false,
        message:
          error.response?.data?.message ||
          'Mass recalculation failed. Please try again.',
      };
    } finally {
      this.isRecalculating = false;
    }
  }

  @action
  async recalculateOnlyMissing() {
    if (
      !confirm(
        'This will recalculate only building assessments with missing or zero values. Continue?',
      )
    ) {
      return;
    }

    try {
      this.isRecalculating = true;
      this.recalculationResult = null;

      const municipalityId = this.model.municipality.id;
      const response = await this.api.post(
        `/municipalities/${municipalityId}/building-assessments/mass-recalculate`,
        {
          year: this.massRecalcYear,
          batchSize: this.massRecalcBatchSize,
          filters: {
            $or: [
              { building_value: { $exists: false } },
              { building_value: null },
              { building_value: 0 },
            ],
          },
        },
      );

      this.recalculationResult = response;

      // Refresh status after completion
      await this.refreshRecalculationStatus();
    } catch (error) {
      console.error('Error during filtered recalculation:', error);
      this.recalculationResult = {
        success: false,
        message:
          error.response?.data?.message ||
          'Filtered recalculation failed. Please try again.',
      };
    } finally {
      this.isRecalculating = false;
    }
  }

  // Economies of scale actions
  @action
  updateEconomiesOfScale(buildingType, field, event) {
    const value = parseFloat(event.target.value) || 0;
    this.economiesOfScale = {
      ...this.economiesOfScale,
      [buildingType]: {
        ...this.economiesOfScale[buildingType],
        [field]: value,
      },
    };
  }

  @action
  resetEconomiesOfScale() {
    this.economiesOfScale = {
      residential: {
        median_size: 1800,
        smallest_size: 100,
        smallest_factor: 3.0,
        largest_size: 15000,
        largest_factor: 0.75,
      },
      commercial: {
        median_size: 5000,
        smallest_size: 500,
        smallest_factor: 2.5,
        largest_size: 50000,
        largest_factor: 0.8,
      },
      industrial: {
        median_size: 10000,
        smallest_size: 1000,
        smallest_factor: 2.0,
        largest_size: 100000,
        largest_factor: 0.85,
      },
      manufactured: {
        median_size: 1200,
        smallest_size: 50,
        smallest_factor: 4.0,
        largest_size: 3000,
        largest_factor: 0.7,
      },
    };
    this.economiesSaveStatus = null;
  }

  @action
  async saveEconomiesOfScale() {
    this.isSavingEconomies = true;
    this.economiesSaveStatus = null;

    try {
      const response = await this.api.patch(
        `/municipalities/${this.model.municipality.id}/building-calculation-config/economies-of-scale`,
        {
          economiesOfScale: this.economiesOfScale,
        },
      );

      this.economiesSaveStatus = {
        success: true,
        message: 'Economies of scale settings saved successfully!',
      };

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        if (this.economiesSaveStatus?.success) {
          this.economiesSaveStatus = null;
        }
      }, 3000);
    } catch (error) {
      console.error('Error saving economies of scale:', error);
      this.economiesSaveStatus = {
        success: false,
        message:
          error.response?.data?.message ||
          'Failed to save economies of scale settings. Please try again.',
      };
    } finally {
      this.isSavingEconomies = false;
    }
  }
}
