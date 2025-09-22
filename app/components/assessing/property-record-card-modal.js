import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PropertyRecordCardModalComponent extends Component {
  @service('property-selection') propertySelection;
  @service assessing;
  @service municipality;

  @tracked isLoading = false;
  @tracked propertyData = null;
  @tracked cardData = [];
  @tracked lastLoadedPropertyId = null;

  get selectedProperty() {
    return this.propertySelection.selectedProperty;
  }

  get assessmentYear() {
    return this.municipality.selectedAssessmentYear || new Date().getFullYear();
  }

  get municipalityName() {
    return this.municipality.currentMunicipality || null;
  }

  constructor() {
    super(...arguments);
    // Load data immediately if modal is already open and property is selected
    if (this.args.isOpen && this.selectedProperty) {
      this.loadPropertyData();
    }
  }


  @action
  closeModal() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }

  @action
  printCard() {
    window.print();
  }

  // Clear cached data when switching properties
  clearCachedData() {
    this.cardData = [];
    this.propertyData = null;
    console.log('Cleared cached property data due to property change');
  }


  get totalCards() {
    return this.selectedProperty?.cards?.total_cards || 1;
  }

  // Getter to trigger data loading and handle property changes
  get triggerDataLoading() {
    // Check if property has changed or if we have no data
    const currentPropertyId = this.selectedProperty?.id;
    const propertyChanged = currentPropertyId !== this.lastLoadedPropertyId;
    const needsData = this.cardData.length === 0;

    if (
      this.selectedProperty &&
      (propertyChanged || needsData) &&
      !this.isLoading
    ) {
      // Use setTimeout to avoid reactivity issues by deferring to next tick
      setTimeout(() => {
        // Double-check conditions in case they changed
        const stillCurrentPropertyId = this.selectedProperty?.id;
        const stillPropertyChanged = stillCurrentPropertyId !== this.lastLoadedPropertyId;
        const stillNeedsData = this.cardData.length === 0;

        if (
          this.selectedProperty &&
          (stillPropertyChanged || stillNeedsData) &&
          !this.isLoading
        ) {
          // Clear cached data if property changed
          if (stillPropertyChanged) {
            this.clearCachedData();
          }
          this.loadPropertyData();
        }
      }, 0);
    }
    return null; // Return null so template doesn't render anything
  }


  async performDataLoading() {
    if (!this.selectedProperty) return;

    this.isLoading = true;

    try {
      const totalCards = this.totalCards;
      const cardPromises = [];

      // Load data for all cards
      for (let cardNumber = 1; cardNumber <= totalCards; cardNumber++) {
        cardPromises.push(this.loadCardData(cardNumber));
      }

      const cardDataResults = await Promise.all(cardPromises);
      this.cardData = cardDataResults;
      this.propertyData = this.selectedProperty;
      this.lastLoadedPropertyId = this.selectedProperty.id;

      console.log('All card data loaded for property:', this.selectedProperty.id, cardDataResults);
    } catch (error) {
      console.error('Error loading property data for record card:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadCardData(cardNumber) {
    try {
      const [landData, buildingData, featuresData, sketchData] =
        await Promise.all([
          this.loadLandAssessment(cardNumber),
          this.loadBuildingAssessment(cardNumber),
          this.loadPropertyFeatures(cardNumber),
          this.loadSketchData(cardNumber),
        ]);

      return {
        cardNumber,
        landAssessment: landData,
        buildingAssessment: buildingData,
        propertyFeatures: featuresData,
        sketchData: sketchData,
      };
    } catch (error) {
      console.error(`Error loading data for card ${cardNumber}:`, error);
      return {
        cardNumber,
        landAssessment: null,
        buildingAssessment: null,
        propertyFeatures: [],
        sketchData: [],
      };
    }
  }

  // Keep the original method for constructor use
  async loadPropertyData() {
    return this.performDataLoading();
  }

  async loadLandAssessment(cardNumber) {
    try {
      const response = await this.assessing.getLandAssessmentForYear(
        this.selectedProperty.id,
        cardNumber,
        this.assessmentYear,
      );
      return response;
    } catch (error) {
      console.error('Error loading land assessment:', error);
      return null;
    }
  }

  async loadBuildingAssessment(cardNumber) {
    try {
      const response = await this.assessing.getBuildingAssessmentForYear(
        this.selectedProperty.id,
        cardNumber,
        this.assessmentYear,
      );
      return response;
    } catch (error) {
      console.error(
        `Error loading building assessment for card ${cardNumber}:`,
        {
          propertyId: this.selectedProperty.id,
          cardNumber,
          assessmentYear: this.assessmentYear,
          error: error.message,
          stack: error.stack,
          response: error.response?.data || 'No response data',
        },
      );

      // For properties without buildings, this is expected - return null gracefully
      if (
        error.response?.status === 500 &&
        error.message?.includes('Failed to get building assessment')
      ) {
        console.warn(
          `Property ${this.selectedProperty.id} card ${cardNumber} appears to have no building data - this is normal for land-only properties`,
        );
        return null;
      }

      return null;
    }
  }

  async loadPropertyFeatures(cardNumber) {
    try {
      const response = await this.assessing.getPropertyFeaturesForYear(
        this.selectedProperty.id,
        cardNumber,
        this.assessmentYear,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading property features:', error);
      return [];
    }
  }

  async loadSketchData(cardNumber) {
    try {
      const response = await this.assessing.getPropertySketchesForYear(
        this.selectedProperty.id,
        cardNumber,
        this.assessmentYear,
      );
      return response || [];
    } catch (error) {
      console.error('Error loading sketch data:', error);
      return [];
    }
  }
}
