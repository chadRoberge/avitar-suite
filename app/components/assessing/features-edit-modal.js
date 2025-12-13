import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class FeaturesEditModalComponent extends Component {
  @service assessing;
  @service municipality;
  @service notifications;
  @service('hybrid-api') hybridApi;
  @service indexedDb;

  @tracked isLoading = false;
  @tracked features = [];
  @tracked availableFeatureCodes = [];

  constructor() {
    super(...arguments);
    this.loadData();
  }

  get totalFeaturesValue() {
    return this.features.reduce((total, feature) => {
      return total + (feature.calculatedValue || 0);
    }, 0);
  }

  async loadData() {
    this.isLoading = true;
    try {
      await Promise.all([this.loadFeatureCodes(), this.loadFeatures()]);
    } catch (error) {
      console.error('Error loading features data:', error);
      this.notifications.error('Failed to load features data');
    } finally {
      this.isLoading = false;
    }
  }

  async loadFeatureCodes() {
    try {
      const municipalityId =
        this.args.property?.municipality_id ||
        this.municipality.currentMunicipality?.id;

      if (!municipalityId) {
        console.warn('No municipality ID available for loading feature codes');
        return;
      }

      // Load all feature codes for this municipality
      const response = await this.assessing.api.get(
        `/municipalities/${municipalityId}/feature-codes`,
      );
      this.availableFeatureCodes = response?.featureCodes || [];
      console.log(`Loaded ${this.availableFeatureCodes.length} feature codes`);
    } catch (error) {
      console.error('Error loading feature codes:', error);
      this.notifications.error('Failed to load available feature codes');
    }
  }

  async loadFeatures() {
    try {
      const propertyId = this.args.property?.id;
      const cardNumber = this.args.cardNumber || 1;

      if (!propertyId) {
        console.warn('No property ID available for loading features');
        return;
      }

      // Load features for this card
      const response = await this.assessing.getPropertyFeaturesForYear(
        propertyId,
        cardNumber,
        null, // current year
      );

      console.log('Raw features response:', response);

      // Extract features array from API response
      const featuresArray = response?.features || response || [];

      // Initialize features with feature code data populated
      this.features = featuresArray.map((feature) => {
        // Extract the actual ID from the feature code (could be object or string)
        const featureCodeData =
          feature.feature_code_id || feature.featureCodeId;
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
          featureCodeId: featureCodeId,
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

      console.log(
        `Loaded ${this.features.length} features for card ${cardNumber}`,
      );
    } catch (error) {
      console.error('Error loading features:', error);
      this.notifications.error('Failed to load features');
    }
  }

  @action
  addFeature() {
    // Check if we're at the maximum (11 features per card)
    if (this.features.length >= 11) {
      this.notifications.error(
        `Maximum of 11 features allowed per card. This card already has ${this.features.length} features.`,
      );
      return;
    }

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
      measurementType: 'units',
      isEditing: true,
      isNew: true,
      calculatedArea: 0,
      calculatedValue: 0,
      originalData: null,
    };

    this.features = [newFeature, ...this.features];
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

        return {
          ...f,
          originalData,
          isEditing: true,
        };
      }
      return f;
    });
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
      const propertyId = this.args.property?.id;
      const cardNumber = this.args.cardNumber || 1;

      if (!propertyId) {
        throw new Error('Property ID is required to save feature');
      }

      const featureData = {
        property_id: propertyId,
        card_number: cardNumber,
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
        const response = await this.assessing.api.post(
          `/properties/${propertyId}/features`,
          featureData,
        );
        savedFeature = response.feature;
        this.notifications.success('Feature added successfully');
      } else {
        // Update existing feature
        const response = await this.assessing.api.put(
          `/properties/${propertyId}/features/${feature.id}`,
          featureData,
        );
        savedFeature = response.feature;
        this.notifications.success('Feature updated successfully');
      }

      // Clear features cache to ensure fresh data on next load
      console.log(
        `🧹 Clearing features cache for property ${propertyId}, card ${cardNumber}`,
      );
      await this.clearFeaturesCache(propertyId, cardNumber);

      // Update the feature in the list
      this.features = this.features.map((f) => {
        if (f === feature) {
          const featureCodeData =
            savedFeature.feature_code_id || savedFeature.featureCodeId;
          const featureCodeId =
            typeof featureCodeData === 'object'
              ? featureCodeData._id || featureCodeData.id
              : featureCodeData;

          const selectedFeatureCode = this.availableFeatureCodes.find(
            (code) => (code._id || code.id) === featureCodeId,
          );

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

      // Call the onSave callback if provided
      if (this.args.onSave) {
        await this.args.onSave();
      }
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
      // Restore original data
      this.features = this.features.map((f) => {
        if (f === feature && f.originalData) {
          return {
            ...f.originalData,
            calculatedArea: this.calculateArea(
              f.originalData.length,
              f.originalData.width,
            ),
            calculatedValue: this.calculateValue(f.originalData),
            originalData: null,
            isEditing: false,
          };
        }
        return f;
      });
    }
  }

  @action
  async deleteFeature(feature) {
    if (confirm(`Are you sure you want to delete "${feature.description}"?`)) {
      try {
        const propertyId = this.args.property?.id;
        const cardNumber = this.args.cardNumber || 1;

        await this.assessing.api.delete(
          `/properties/${propertyId}/features/${feature.id}`,
        );

        // Clear features cache to ensure fresh data on next load
        console.log(
          `🧹 Clearing features cache after delete for property ${propertyId}, card ${cardNumber}`,
        );
        await this.clearFeaturesCache(propertyId, cardNumber);

        this.features = this.features.filter((f) => f !== feature);
        this.notifications.success('Feature deleted successfully');

        // Call the onSave callback if provided
        if (this.args.onSave) {
          await this.args.onSave();
        }
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

  calculateValue(feature) {
    const sizeAdj = parseFloat(feature.size_adjustment) || 1.0;
    const rate = parseFloat(feature.rate) || 0;

    // Calculate quantity based on measurement type
    let quantity = 0;
    if (feature.measurementType === 'length_width') {
      quantity = this.calculateArea(feature.length, feature.width);
    } else {
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

  @action
  close() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  /**
   * Clear cached features data for a specific property/card combination
   * This ensures fresh data is loaded after save/delete operations
   */
  async clearFeaturesCache(propertyId, cardNumber) {
    try {
      // Clear from IndexedDB features collection - filter by BOTH property_id AND card_number
      const cachedFeatures = await this.indexedDb.getAll('features', {
        property_id: propertyId,
      });

      // Post-filter by card_number since IndexedDB compound index query might not work directly
      const featuresForCard = cachedFeatures.filter((feature) => {
        // Card 1 includes features without card_number (legacy)
        if (cardNumber === 1) {
          return (
            feature.card_number === 1 ||
            feature.card_number === undefined ||
            feature.card_number === null
          );
        } else {
          return feature.card_number === cardNumber;
        }
      });

      console.log(
        `🗑️ Found ${featuresForCard.length} cached features for property ${propertyId}, card ${cardNumber} (out of ${cachedFeatures.length} total features)`,
      );

      for (const feature of featuresForCard) {
        await this.indexedDb.delete('features', feature.id || feature._id);
      }

      console.log(
        `✅ Cleared ${featuresForCard.length} features from IndexedDB cache for card ${cardNumber}`,
      );
    } catch (error) {
      console.error('Error clearing features cache:', error);
      // Don't throw - cache clearing is optional, shouldn't block the operation
    }
  }
}
