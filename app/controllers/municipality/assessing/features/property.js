import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityAssessingFeaturesPropertyController extends Controller {
  @service api;
  @service notifications;
  @service municipality;
  @service router;

  @tracked features = [];
  @tracked availableFeatureCodes = [];
  @tracked isLoadingFeatureCodes = false;

  get totalFeaturesValue() {
    return this.features.reduce((total, feature) => {
      return total + (feature.calculatedValue || 0);
    }, 0);
  }

  @action
  async setupFeatures() {
    // Load municipality-specific feature codes first
    await this.loadFeatureCodes();

    console.log('Raw features from model:', this.model.features);
    console.log('Feature count:', (this.model.features || []).length);

    // Initialize features from model with feature code data populated
    this.features = (this.model.features || []).map((feature) => {
      // Extract the actual ID from the feature code (could be object or string)
      const featureCodeData = feature.feature_code_id || feature.featureCodeId;
      const featureCodeId =
        typeof featureCodeData === 'object'
          ? featureCodeData._id || featureCodeData.id
          : featureCodeData;

      const selectedFeatureCode = this.availableFeatureCodes.find(
        (code) => (code._id || code.id) === featureCodeId,
      );

      return {
        ...feature,
        isEditing: false,
        isNew: false,
        featureCodeId: featureCodeId, // Ensure frontend field is set
        selectedFeatureCode: selectedFeatureCode,
        measurementType:
          selectedFeatureCode?.measurementType ||
          feature.measurement_type ||
          'units',
        calculatedArea: this.calculateArea(feature.length, feature.width),
        calculatedValue: this.calculateValue(feature),
        originalData: { ...feature },
      };
    });
  }

  async loadFeatureCodes() {
    try {
      this.isLoadingFeatureCodes = true;

      // Note: Municipality ID retrieved from municipality service

      // Get municipality ID from multiple possible sources
      const municipalityId =
        this.model.property?.municipality_id ||
        this.model.property?.municipalityId ||
        this.municipality.currentMunicipality?.id ||
        this.municipality.currentMunicipality?._id ||
        this.router.currentRoute?.params?.municipality_id;

      if (!municipalityId) {
        console.warn('No municipality ID available for loading feature codes');
        return;
      }

      // Load all feature codes for this municipality
      const response = await this.api.get(
        `/municipalities/${municipalityId}/feature-codes`,
      );
      this.availableFeatureCodes = response?.featureCodes || [];
    } catch (error) {
      console.error('Error loading feature codes:', error);
      this.notifications.error('Failed to load available feature codes');
    } finally {
      this.isLoadingFeatureCodes = false;
    }
  }

  @action
  addFeature() {
    const newFeature = {
      id: null,
      featureCodeId: '',
      selectedFeatureCode: null,
      description: '',
      length: '',
      width: '',
      units: 1,
      size_adjustment: 1.0,
      rate: 0,
      condition: 'Average',
      notes: '',
      measurementType: 'units', // default to units only
      isEditing: true,
      isNew: true,
      calculatedArea: 0,
      calculatedValue: 0,
      originalData: null,
    };

    this.features = [newFeature, ...this.features];
  }

  @action
  selectFeatureCode(feature, event) {
    const featureCodeId = event.target.value;
    const selectedCode = this.availableFeatureCodes.find(
      (code) => (code._id || code.id) === featureCodeId,
    );

    if (selectedCode) {
      // Update the features array with a new version of the feature object
      this.features = this.features.map((f) => {
        if (f === feature) {
          const updatedFeature = {
            ...f,
            featureCodeId: featureCodeId,
            selectedFeatureCode: selectedCode,
            description: selectedCode.description,
            rate: selectedCode.rate,
            measurementType: selectedCode.measurementType,
            size_adjustment: selectedCode.sizeAdjustment === 'zero' ? 0 : 1.0,
          };

          // Clear length/width if switching to units only
          if (selectedCode.measurementType === 'units') {
            updatedFeature.length = '';
            updatedFeature.width = '';
            updatedFeature.calculatedArea = 0;
          }

          // Recalculate value
          updatedFeature.calculatedValue = this.calculateValue(updatedFeature);
          return updatedFeature;
        }
        return f;
      });
    }
  }

  @action
  editFeature(feature) {
    // Update the features array with a new version of the feature object to ensure reactivity
    this.features = this.features.map((f) => {
      if (f === feature) {
        // Store the original data before editing
        const originalData = {
          ...f,
          isEditing: false,
          isNew: false,
        };

        // Extract the actual ID from the feature code (could be object or string)
        const featureCodeData = f.feature_code_id || f.featureCodeId;
        const featureCodeId =
          typeof featureCodeData === 'object'
            ? featureCodeData._id || featureCodeData.id
            : featureCodeData;

        const selectedFeatureCode = this.availableFeatureCodes.find(
          (code) => (code._id || code.id) === featureCodeId,
        );

        // Preserve all existing data but set to editing mode
        return {
          ...f,
          originalData,
          featureCodeId: featureCodeId,
          selectedFeatureCode: selectedFeatureCode,
          measurementType:
            selectedFeatureCode?.measurementType ||
            f.measurement_type ||
            f.measurementType ||
            'units',
          isEditing: true,
        };
      }
      return f;
    });
  }

  @action
  updateFeatureField(feature, field, event) {
    const value = event.target ? event.target.value : event;

    // Update the features array with a new version of the feature object
    this.features = this.features.map((f) => {
      if (f === feature) {
        const updatedFeature = { ...f, [field]: value };

        // Recalculate dependent values
        if (field === 'length' || field === 'width') {
          updatedFeature.calculatedArea = this.calculateArea(
            updatedFeature.length,
            updatedFeature.width,
          );
        }

        updatedFeature.calculatedValue = this.calculateValue(updatedFeature);
        return updatedFeature;
      }
      return f;
    });
  }

  @action
  async saveFeature(feature) {
    try {
      const featureData = {
        property_id: this.model.property.id,
        feature_code_id: feature.featureCodeId,
        description: feature.description,
        length: parseFloat(feature.length) || 0,
        width: parseFloat(feature.width) || 0,
        units: parseFloat(feature.units) || 0,
        size_adjustment: parseFloat(feature.size_adjustment) || 1.0,
        rate: parseFloat(feature.rate) || 0,
        condition: feature.condition,
        notes: feature.notes,
        measurement_type: feature.measurementType,
      };

      let savedFeature;
      if (feature.isNew) {
        // Create new feature
        const response = await this.api.post(
          `/properties/${this.model.property.id}/features`,
          featureData,
        );
        savedFeature = response.feature;
        this.notifications.success('Feature added successfully');
      } else {
        // Update existing feature
        const response = await this.api.put(
          `/properties/${this.model.property.id}/features/${feature.id}`,
          featureData,
        );
        savedFeature = response.feature;
        this.notifications.success('Feature updated successfully');
      }

      // Update the feature in the list using the same reactive pattern
      this.features = this.features.map((f) => {
        if (f === feature) {
          // Get the selected feature code for proper data mapping
          const featureCodeData =
            savedFeature.feature_code_id || savedFeature.featureCodeId;
          const featureCodeId =
            typeof featureCodeData === 'object'
              ? featureCodeData._id || featureCodeData.id
              : featureCodeData;

          const selectedFeatureCode = this.availableFeatureCodes.find(
            (code) => (code._id || code.id) === featureCodeId,
          );

          console.log('Saved feature from server:', savedFeature);
          console.log('Selected feature code:', selectedFeatureCode);

          return {
            ...savedFeature,
            isEditing: false,
            isNew: false,
            featureCodeId: featureCodeId,
            selectedFeatureCode: selectedFeatureCode,
            measurementType:
              selectedFeatureCode?.measurementType ||
              savedFeature.measurement_type ||
              'units',
            calculatedArea: this.calculateArea(
              savedFeature.length,
              savedFeature.width,
            ),
            calculatedValue: this.calculateValue(savedFeature),
            originalData: null,
          };
        }
        return f;
      });
    } catch (error) {
      console.error('Failed to save feature:', error);
      this.notifications.error('Failed to save feature');
    }
  }

  @action
  cancelEdit(feature) {
    if (feature.isNew) {
      // Remove new feature that wasn't saved
      this.features = this.features.filter((f) => f !== feature);
    } else {
      // Restore original data by replacing the feature object
      this.features = this.features.map((f) => {
        if (f === feature && f.originalData) {
          const restoredFeature = {
            ...f.originalData,
            calculatedArea: this.calculateArea(
              f.originalData.length,
              f.originalData.width,
            ),
            calculatedValue: this.calculateValue(f.originalData),
            originalData: null,
          };
          return restoredFeature;
        }
        return f;
      });
    }
  }

  @action
  async deleteFeature(feature) {
    if (confirm(`Are you sure you want to delete "${feature.description}"?`)) {
      try {
        await this.api.delete(
          `/properties/${this.model.property.id}/features/${feature.id}`,
        );
        this.features = this.features.filter((f) => f !== feature);
        this.notifications.success('Feature deleted successfully');
      } catch (error) {
        console.error('Failed to delete feature:', error);
        this.notifications.error('Failed to delete feature');
      }
    }
  }

  calculateArea(length, width) {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    return Math.round(l * w);
  }

  @action
  refreshFeaturesProperty() {
    // Use the route reference to refresh
    if (this.featuresRoute) {
      this.featuresRoute.refresh();
    }
  }

  calculateValue(feature) {
    const sizeAdj = parseFloat(feature.size_adjustment) || 1.0;
    const rate = parseFloat(feature.rate) || 0;

    // Calculate quantity based on measurement type
    let quantity = 0;
    if (feature.measurementType === 'length_width') {
      quantity = this.calculateArea(feature.length, feature.width);
    } else {
      // units only
      quantity = parseFloat(feature.units) || 0;
    }

    // Apply condition factor
    let conditionFactor = 1.0;
    switch (feature.condition) {
      case 'Excellent':
        conditionFactor = 1.25;
        break;
      case 'Good':
        conditionFactor = 1.1;
        break;
      case 'Average':
        conditionFactor = 1.0;
        break;
      case 'Fair':
        conditionFactor = 0.9;
        break;
      case 'Poor':
        conditionFactor = 0.75;
        break;
    }

    return Math.round(quantity * sizeAdj * rate * conditionFactor);
  }
}
