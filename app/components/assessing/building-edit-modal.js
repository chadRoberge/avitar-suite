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

    console.log(
      '🔍 Building Assessment received:',
      this.args.buildingAssessment,
    );

    // Initialize local building data from args
    if (this.args.buildingAssessment) {
      // Convert snake_case from API to camelCase for component
      // Extract ObjectIds from fields (they might be populated objects or ObjectId strings)
      console.log('🔍 Frame value (raw):', this.args.buildingAssessment.frame);
      console.log('🔍 Frame type:', typeof this.args.buildingAssessment.frame);
      console.log(
        '🔍 Base Type value (raw):',
        this.args.buildingAssessment.base_type,
      );
      console.log(
        '🔍 Base Type type:',
        typeof this.args.buildingAssessment.base_type,
      );

      const frameId = this.extractObjectId(this.args.buildingAssessment.frame);
      const baseTypeId = this.extractObjectId(
        this.args.buildingAssessment.base_type,
      );

      console.log('🔍 Extracted Frame ID:', frameId);
      console.log('🔍 Extracted Base Type ID:', baseTypeId);

      this.buildingData = {
        buildingModel: this.args.buildingAssessment.building_model || '',
        frame: frameId || '',
        ceilingHeight:
          this.extractObjectId(this.args.buildingAssessment.ceiling_height) ||
          '',
        yearBuilt: this.args.buildingAssessment.year_built || '',
        baseType: baseTypeId || '',
        qualityGrade:
          this.extractObjectId(this.args.buildingAssessment.quality_grade) ||
          '',
        storyHeight:
          this.extractObjectId(this.args.buildingAssessment.story_height) || '',
        roofStyle:
          this.extractObjectId(this.args.buildingAssessment.roof_style) || '',
        roofCover:
          this.extractObjectId(this.args.buildingAssessment.roof_cover) || '',
        exteriorWall1:
          this.extractObjectId(this.args.buildingAssessment.exterior_wall_1) ||
          '',
        exteriorWall2:
          this.extractObjectId(this.args.buildingAssessment.exterior_wall_2) ||
          '',
        interiorWall1:
          this.extractObjectId(this.args.buildingAssessment.interior_wall_1) ||
          '',
        interiorWall2:
          this.extractObjectId(this.args.buildingAssessment.interior_wall_2) ||
          '',
        flooring1:
          this.extractObjectId(this.args.buildingAssessment.flooring_1) || '',
        flooring2:
          this.extractObjectId(this.args.buildingAssessment.flooring_2) || '',
        heatingFuel:
          this.extractObjectId(this.args.buildingAssessment.heating_fuel) || '',
        heatingType:
          this.extractObjectId(this.args.buildingAssessment.heating_type) || '',
        bedrooms: this.args.buildingAssessment.bedrooms || 0,
        fullBaths: this.args.buildingAssessment.full_baths || 0,
        halfBaths: this.args.buildingAssessment.half_baths || 0,
        extraKitchen: this.args.buildingAssessment.extra_kitchen || 0,
        airConditioning: this.args.buildingAssessment.air_conditioning || '',
        generator: this.args.buildingAssessment.generator || '',
      };

      console.log('🔍 Processed buildingData:', this.buildingData);
    } else {
      // Initialize with empty data if no building assessment exists
      this.buildingData = {
        buildingModel: '',
        frame: '',
        ceilingHeight: '',
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
    // Note: Backend now sends populated objects with _id, so no need to convert
    this.loadFeatureCodes();
    this.loadBuildingCodes();
  }

  /**
   * Extract ObjectId from a field that might be an ObjectId string or a populated object
   * Returns empty string if the value is not a valid ObjectId (e.g., it's a code string like "RESIDENTIAL")
   */
  extractObjectId(field) {
    if (!field) return '';

    // If it's an object with an _id, return the _id
    if (typeof field === 'object' && field._id) {
      return String(field._id);
    }

    // If it's a string, validate it's a proper ObjectId (24 hex characters)
    if (typeof field === 'string') {
      // ObjectIds are 24 character hex strings
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(field);
      if (isValidObjectId) {
        return field;
      }
      // If it's not a valid ObjectId, it's probably a code string from old cached data
      console.warn('⚠️ Invalid ObjectId format, ignoring:', field);
      return '';
    }

    return '';
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
        'ceiling_height',
      ];

      // Get the current assessment year from municipality service
      const year = this.municipality.selectedAssessmentYear || new Date().getFullYear();

      const codePromises = featureTypes.map(async (type) => {
        try {
          // Use direct API service to bypass HybridAPI caching issues with query parameters
          // Include year parameter for temporal inheritance
          const response = await this.assessing.api.get(
            `/municipalities/${this.municipality.currentMunicipality.id}/building-feature-codes?featureType=${type}&year=${year}`,
          );
          // API returns { buildingFeatureCodes: [...], year, isYearLocked }
          const codes = response.buildingFeatureCodes || [];
          return { type, codes };
        } catch (error) {
          console.warn(`Error loading ${type} codes:`, error);
          return { type, codes: [] };
        }
      });

      const results = await Promise.all(codePromises);

      // Organize codes by type and ensure _id is a string for comparison
      // Build the object first, then assign to trigger reactivity
      const featureCodesObj = {};
      results.forEach(({ type, codes }) => {
        // Ensure _id is a string for comparison in templates
        featureCodesObj[type] = (codes || []).map((code) => ({
          ...code,
          _id: String(code._id),
        }));
      });
      this.featureCodes = featureCodesObj;
    } catch (error) {
      console.error('Error loading building feature codes:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadBuildingCodes() {
    try {
      // Get the current assessment year from municipality service
      const year = this.municipality.selectedAssessmentYear || new Date().getFullYear();

      // Use direct API to get building codes (base types) from the correct endpoint
      // Include year parameter for temporal inheritance
      const response = await this.assessing.api.get(
        `/municipalities/${this.municipality.currentMunicipality.id}/building-codes?year=${year}`,
      );
      // Ensure _id is a string for comparison in templates
      this.buildingCodes = (response.buildingCodes || []).map((code) => ({
        ...code,
        _id: String(code._id),
      }));
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

      // Convert camelCase to snake_case for API
      // Send ObjectIds directly (or empty string which will be converted to null by backend)
      const apiData = {
        building_model: this.buildingData.buildingModel?.toUpperCase() || '',
        frame: this.buildingData.frame || '',
        ceiling_height: this.buildingData.ceilingHeight || '',
        year_built: this.buildingData.yearBuilt,
        base_type: this.buildingData.baseType || '',
        quality_grade: this.buildingData.qualityGrade || '',
        story_height: this.buildingData.storyHeight || '',
        roof_style: this.buildingData.roofStyle || '',
        roof_cover: this.buildingData.roofCover || '',
        exterior_wall_1: this.buildingData.exteriorWall1 || '',
        exterior_wall_2: this.buildingData.exteriorWall2 || '',
        interior_wall_1: this.buildingData.interiorWall1 || '',
        interior_wall_2: this.buildingData.interiorWall2 || '',
        flooring_1: this.buildingData.flooring1 || '',
        flooring_2: this.buildingData.flooring2 || '',
        heating_fuel: this.buildingData.heatingFuel || '',
        heating_type: this.buildingData.heatingType || '',
        bedrooms: this.buildingData.bedrooms,
        full_baths: this.buildingData.fullBaths,
        half_baths: this.buildingData.halfBaths,
        extra_kitchen: this.buildingData.extraKitchen,
        air_conditioning: this.buildingData.airConditioning || '',
        generator: this.buildingData.generator || '',
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
