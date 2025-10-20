import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class BuildingEditModalComponent extends Component {
  @service assessing;
  @service municipality;

  @tracked isLoading = false;
  @tracked isSaving = false;
  @tracked buildingData = {};
  @tracked featureCodes = {};
  @tracked buildingCodes = [];

  constructor() {
    super(...arguments);
    // Initialize local building data from args
    if (this.args.buildingAssessment) {
      // Convert snake_case from API to camelCase for component
      this.buildingData = {
        buildingModel: this.args.buildingAssessment.building_model || '',
        frame: this.args.buildingAssessment.frame || '',
        yearBuilt: this.args.buildingAssessment.year_built || '',
        baseType: this.args.buildingAssessment.base_type || '',
        qualityGrade: this.args.buildingAssessment.quality_grade || '',
        storyHeight: this.args.buildingAssessment.story_height || '',
        roofStyle: this.args.buildingAssessment.roof_style || '',
        roofCover: this.args.buildingAssessment.roof_cover || '',
        exteriorWall1: this.args.buildingAssessment.exterior_wall_1 || '',
        exteriorWall2: this.args.buildingAssessment.exterior_wall_2 || '',
        interiorWall1: this.args.buildingAssessment.interior_wall_1 || '',
        interiorWall2: this.args.buildingAssessment.interior_wall_2 || '',
        flooring1: this.args.buildingAssessment.flooring_1 || '',
        flooring2: this.args.buildingAssessment.flooring_2 || '',
        heatingFuel: this.args.buildingAssessment.heating_fuel || '',
        heatingType: this.args.buildingAssessment.heating_type || '',
        bedrooms: this.args.buildingAssessment.bedrooms || 0,
        fullBaths: this.args.buildingAssessment.full_baths || 0,
        halfBaths: this.args.buildingAssessment.half_baths || 0,
        extraKitchen: this.args.buildingAssessment.extra_kitchen || 0,
        airConditioning: this.args.buildingAssessment.air_conditioning || '',
        generator: this.args.buildingAssessment.generator || '',
      };
    } else {
      // Initialize with empty data if no building assessment exists
      this.buildingData = {
        buildingModel: '',
        frame: '',
        yearBuilt: '',
        baseType: '',
        qualityGrade: '',
        storyHeight: '',
        roofStyle: '',
        roofCover: '',
        exteriorWall1: '',
        exteriorWall2: '',
        interiorWall1: '',
        interiorWall2: '',
        flooring1: '',
        flooring2: '',
        heatingFuel: '',
        heatingType: '',
        bedrooms: 0,
        fullBaths: 0,
        halfBaths: 0,
        extraKitchen: 0,
        airConditioning: '',
        generator: '',
      };
    }

    // Load building feature codes and building codes
    this.loadFeatureCodes();
    this.loadBuildingCodes();
  }

  async loadFeatureCodes() {
    try {
      this.isLoading = true;

      // Load feature codes for all types using the assessing service
      const featureTypes = [
        'interior_wall',
        'exterior_wall',
        'roofing',
        'roof_style',
        'flooring',
        'heating_fuel',
        'heating_type',
        'quality',
        'story_height',
        'frame',
      ];

      const codePromises = featureTypes.map(async (type) => {
        try {
          // Use direct API service to bypass HybridAPI caching issues with query parameters
          const response = await this.assessing.api.get(
            `/municipalities/${this.municipality.currentMunicipality.id}/building-feature-codes?featureType=${type}`,
          );
          console.log(`Loaded ${type} codes:`, response);
          return { type, codes: response };
        } catch (error) {
          console.warn(`Error loading ${type} codes:`, error);
          return { type, codes: [] };
        }
      });

      const results = await Promise.all(codePromises);

      // Organize codes by type
      this.featureCodes = {};
      results.forEach(({ type, codes }) => {
        // API returns codes directly as an array
        this.featureCodes[type] = codes || [];
      });

      console.log('Loaded feature codes:', this.featureCodes);
      console.log('Feature codes count by type:');
      Object.keys(this.featureCodes).forEach((type) => {
        console.log(`- ${type}:`, this.featureCodes[type]?.length || 0);
        if (this.featureCodes[type]?.length > 0) {
          console.log(`  Sample ${type} code:`, this.featureCodes[type][0]);
        }
      });
    } catch (error) {
      console.error('Error loading building feature codes:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadBuildingCodes() {
    try {
      // Use direct API to get building codes (base types) from the correct endpoint
      const response = await this.assessing.api.get(
        `/municipalities/${this.municipality.currentMunicipality.id}/building-codes`,
      );
      this.buildingCodes = response.buildingCodes || [];
      console.log('Loaded building codes:', this.buildingCodes);
    } catch (error) {
      console.error('Error loading building codes:', error);
      this.buildingCodes = [];
    }
  }

  @action
  close() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  updateField(fieldName, event) {
    const value = event.target.value;
    this.buildingData = {
      ...this.buildingData,
      [fieldName]: value,
    };
  }

  @action
  updateNumberField(fieldName, event) {
    const value = parseFloat(event.target.value) || 0;
    this.buildingData = {
      ...this.buildingData,
      [fieldName]: value,
    };
  }

  @action
  async save() {
    if (this.isSaving) return;

    this.isSaving = true;

    try {
      console.log('Saving building data:', this.buildingData);

      // Get property ID from args
      const propertyId = this.args.property?.id;
      if (!propertyId) {
        throw new Error('Property ID is required to save building assessment');
      }

      // Convert camelCase to snake_case for API and format text fields
      const apiData = {
        building_model: this.buildingData.buildingModel?.toUpperCase() || '',
        frame: this.buildingData.frame?.toUpperCase() || '',
        year_built: this.buildingData.yearBuilt,
        base_type: this.buildingData.baseType?.toUpperCase() || '',
        quality_grade: this.buildingData.qualityGrade?.toUpperCase() || '',
        story_height: this.buildingData.storyHeight?.toUpperCase() || '',
        roof_style: this.buildingData.roofStyle?.toUpperCase() || '',
        roof_cover: this.buildingData.roofCover?.toUpperCase() || '',
        exterior_wall_1: this.buildingData.exteriorWall1?.toUpperCase() || '',
        exterior_wall_2: this.buildingData.exteriorWall2?.toUpperCase() || '',
        interior_wall_1: this.buildingData.interiorWall1?.toUpperCase() || '',
        interior_wall_2: this.buildingData.interiorWall2?.toUpperCase() || '',
        flooring_1: this.buildingData.flooring1?.toUpperCase() || '',
        flooring_2: this.buildingData.flooring2?.toUpperCase() || '',
        heating_fuel: this.buildingData.heatingFuel?.toUpperCase() || '',
        heating_type: this.buildingData.heatingType?.toUpperCase() || '',
        bedrooms: this.buildingData.bedrooms,
        full_baths: this.buildingData.fullBaths,
        half_baths: this.buildingData.halfBaths,
        extra_kitchen: this.buildingData.extraKitchen,
        air_conditioning:
          this.buildingData.airConditioning?.toUpperCase() || '',
        generator: this.buildingData.generator?.toUpperCase() || '',
      };

      // Get current card number to ensure we're updating the correct card
      const cardNumber = this.args.property?.current_card || 1;

      // Use assessing service to update building assessment
      const response = await this.assessing.updateBuildingAssessment(
        propertyId,
        cardNumber,
        apiData,
      );

      // Update the buildingAssessment args to show the latest calculation data
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
      console.error('Error saving building data:', error);
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
