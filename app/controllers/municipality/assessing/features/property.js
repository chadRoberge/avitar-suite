import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class MunicipalityAssessingFeaturesPropertyController extends Controller {
  @service api;
  @service notifications;
  @service municipality;
  @service router;
  @service('property-selection') propertySelection;

  @tracked features = [];
  @tracked availableFeatureCodes = [];
  @tracked isLoadingFeatureCodes = false;
  @tracked isFeaturesModalOpen = false;

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
  openFeaturesModal() {
    this.isFeaturesModalOpen = true;
  }

  @action
  closeFeaturesModal() {
    this.isFeaturesModalOpen = false;
  }

  @action
  async handleFeaturesSave() {
    // Refresh the route to reload features after save
    if (this.featuresRoute) {
      this.featuresRoute.refresh();
    }

    // Also refresh assessment totals in property header
    await this.propertySelection.refreshCurrentAssessmentTotals(
      null,
      this.model,
    );
  }

  calculateArea(length, width) {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    return Math.round(l * w);
  }

  @action
  async refreshFeaturesProperty() {
    // Use the route reference to refresh
    if (this.featuresRoute) {
      this.featuresRoute.refresh();
    }

    // Also refresh assessment totals in property header
    await this.propertySelection.refreshCurrentAssessmentTotals(
      null,
      this.model,
    );
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
